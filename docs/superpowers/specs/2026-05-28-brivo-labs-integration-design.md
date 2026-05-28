# Design: Brivo Labs (Path B) integration for observation-app

**Date:** 2026-05-28
**Status:** Approved (design); pending spec review
**Slug:** `observation-app`

## Goal

Deploy the existing Vue 3 / nginx container as a **Brivo Labs-proxied
experiment**. Replace the app's EEN OAuth proxy flow with Brivo Labs
authentication: Labs gates access and brokers the EEN vendor token, which
we inject into `een-api-toolkit`. The OAuth proxy is removed entirely.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Hosting path | **Labs-proxied (Path B)** — container in Labs EKS, Labs reverse-proxies `/experiments/observation-app/*` and gates auth. |
| Auth mode | **Labs-only** — fully replace the proxy/OAuth flow. GitHub Pages standalone deployment is dropped. |
| Scope | App/container changes **+** Path B infra (Makefile/Helm/ECR-OIDC) **+** onboarding coordination. |
| Product slug | `observation-app` (not yet registered). |
| SDK wiring | **Approach 1** — programmatic `LabsAuth.ready()` gate in `main.ts` before mount. |
| Local dev / tests | **Dev-bypass** — env flag injects a manually-provided EEN token + baseUrl, skipping the SDK. |
| Access model | **Account-level grant** (`requiresApproval=false`). |

## Background: how Labs replaces the proxy

Verified against `een-api-toolkit` source:

- Data calls (`cameras`, `events`, `users/self`, etc.) hit
  `${authStore.baseUrl}/api/v3.0/...` **directly** against the EEN cluster.
- `proxyUrl` was used **only** for OAuth: `getAccessToken`,
  `refreshAccessToken`, `revoke`. Labs now owns login, so the proxy is dead.
- `initEenToolkit()` options are all optional.
- `authStore.setToken(token, expiresIn)` + `authStore.setBaseUrl(urlString)`
  inject auth directly. `setBaseUrl` parses a full URL string and validates
  the hostname against an allowed-EEN-domain list. `setToken` writes
  `een_token` / `een_tokenExpiration` to localStorage — the same keys the
  router guard reads.
- The toolkit's auto-refresh calls the (now-removed) proxy, so it must
  **not** be enabled in Labs-only mode.

The Labs SDK (`https://labs.eagleeyenetworks.com/sdk/labs-auth.js`) exposes
`LabsAuth.ready({product, vendors})` which returns
`{caller, vendors, token}` or `null` (when it has redirected the page).
`vendors.een = { accessToken, baseUrl, expiresAt, requestHeaders }`.

## Architecture

```
Browser ── https://labs.eagleeyenetworks.com/experiments/observation-app/*
   │
   ▼
Labs ingress  ── validates EEN JWT / gates auth ── strips /experiments/observation-app prefix
   │
   ▼
observation-app Service (nginx, :8080, Labs EKS "experiments" ns)
   │
   ▼ (browser) labs-auth.js SDK ── LabsAuth.ready() ── vendors.een token
   │
   ▼
een-api-toolkit ── direct ${baseUrl}/api/v3.0/... ── EEN cluster
```

## Components

### 1. Auth bootstrap — `src/main.ts` (rewritten)

Mode selected by `VITE_AUTH_MODE` (`labs` default, `dev` local):

**labs mode**
1. `createApp(App)`; `app.use(createPinia())`.
2. `initEenToolkit({ storageStrategy: 'localStorage', debug: false })` —
   no `proxyUrl` / `clientId` / `redirectUri`.
3. `await loadLabsSdk()` (helper, below).
4. `const res = await LabsAuth.ready({ product: 'observation-app', vendors: ['een'] })`.
5. If `res === null` → SDK redirected; **return without mounting**.
6. `authStore.setBaseUrl(res.vendors.een.baseUrl)`; then
   `authStore.setToken(res.vendors.een.accessToken, expiresIn)` where
   `expiresIn = Math.max(0, res.vendors.een.expiresAt - Math.floor(Date.now()/1000))`.
   Optionally `authStore.setUserProfile(...)` from `res.caller`.
7. `app.use(router)`; `app.mount('#app')`.

**dev mode**
1–2 as above.
3. Inject `VITE_DEV_EEN_TOKEN` + `VITE_DEV_EEN_BASE_URL` via
   `setBaseUrl`/`setToken` (use a long synthetic `expiresIn`).
4. `app.use(router)`; `app.mount('#app')`.

### 2. SDK loader — `src/labs/loadLabsSdk.ts` (new)

Injects the `labs-auth.js` `<script>` and resolves once `window.LabsAuth`
exists. Base URL from `VITE_LABS_BASE` (default
`https://labs.eagleeyenetworks.com`); when overridden for local, also pass
`labsBase` to `LabsAuth.ready()`. Rejects on script load error.

### 3. Labs auth wrapper — `src/labs/labsAuth.ts` (new)

Thin module owning: the `LabsAuth.ready()` call, token injection into the
auth store, and `refreshLabsAuth()` (re-runs `LabsAuth.vendorRequireAuth(['een'])`
and re-injects). Keeps `main.ts` small and gives tests a seam to mock.

### 4. Token refresh

No toolkit auto-refresh. v1:
- Timer fires ~60s before `expiresAt` → `refreshLabsAuth()`.
- A global handler on EEN `401` → `refreshLabsAuth()`, with full page
  reload as the fallback (SDK re-gates on reload).
- dev mode: neither (static token).

### 5. Routing — `src/router/index.ts`

- **Remove** `Login.vue`, `Callback.vue`, and the OAuth-callback
  (`code`/`state`) branch in the guard.
- **Logout** → `LabsAuth.logout()` then redirect to
  `${VITE_LABS_BASE}/product/observation-app`.
- Keep `Home` + `requiresAuth` and the localStorage fallback guard
  (defense-in-depth; auth is guaranteed pre-mount).
- Keep the URL-state sessionStorage handling (still used for in-app state).
- `createWebHistory` base = `/experiments/observation-app/`.

### 6. Build / Vite / nginx

- `vite.config.ts` `base: '/experiments/observation-app/'` for the labs
  build (replaces GH Pages `/een-observation-app/` and the Dockerfile
  `--base=/`). Dev server stays at `/`.
- `nginx.conf` unchanged — Labs strips the path prefix before proxying, so
  nginx serves at root; `try_files` + `/assets/` rules already work.
- Container keeps listening on `0.0.0.0:8080` (chart readiness-probe
  requirement). `Dockerfile` updated: drop `VITE_PROXY_URL` /
  `VITE_EEN_CLIENT_ID` build args; build with the labs base path.

### 7. Path B infra (new files)

- **`Makefile`** — `deployment-image IMAGE_TAG=...` produces local image
  `observation-app:$IMAGE_TAG`; plus `test`, `chart-lint`, `chart-template`.
- **`charts/observation-app/`** — `Chart.yaml` (name
  `een-labs-observation-app`), `values.yaml`, `templates/` Deployment +
  Service (port 8080) + optional HPA. **No Ingress.** `secretEnvFrom: ""`
  (Labs-only ⇒ no secrets in the container).
- **`.github/workflows/build-and-push.yml`** — GitHub OIDC → ECR image push
  + chart OCI push, on `main` and `v*` tags. No static credentials.
- **`docker-compose.dev.yml`** — local dev in dev-bypass mode.

### 8. Onboarding coordination

Draft request to **Eric Janik (eric@een.com)**:
- slug `observation-app`, hosting = Labs-proxied, vendors = `[een]`.
- access = **account-level grant** (`requiresApproval=false`); supply the
  EEN account ID to enroll.
- GitHub org/repo (see risk below) and who creates it.
- Run `labs-candidacy.md` checklist first.
Receive back: ECR repo URL, IAM role ARN, confirmed GitHub repo path,
`proxyTarget` wired after first deploy.

## Data flow

1. User opens `/experiments/observation-app/` → Labs gate (server) →
   proxies to nginx → `index.html` + assets.
2. `main.ts` loads SDK → `LabsAuth.ready()` → EEN vendor token.
3. Token + baseUrl injected into `een-api-toolkit` auth store.
4. App mounts; toolkit calls EEN cluster directly with the Bearer.
5. Near expiry / on 401 → `refreshLabsAuth()` re-injects.

## Error handling

| Case | Handling |
|---|---|
| `LabsAuth.ready()` returns `null` | SDK redirected (to product page / vendor-auth); app does not mount. |
| `LabsVendorConfigError` | SDK rendered terminal overlay; do not mount; log. |
| `setBaseUrl` rejects host | Surface a fatal init error overlay; likely an unexpected SDK baseUrl — investigate allowlist. |
| EEN API 401 mid-session | `refreshLabsAuth()`; fallback full reload. |
| SDK script fails to load | Fatal init error message with retry. |
| dev mode missing token env | Fatal init error with guidance. |

## Testing

- Dev-bypass injection lets local docker + most E2E specs (cameras,
  events, dark-mode, mute, url-state, event-types) run unchanged.
- Login-coupled specs (`auth.spec`, `qr-code` gating, `user-info`,
  mute-through-login) reworked: Playwright global setup injects the dev
  token instead of `performLogin()`.
- New unit tests: labs bootstrap (mocked `LabsAuth`) + dev-bypass injection.
- `make chart-lint` / `make chart-template` validate the Helm chart locally.

## What gets removed

- `VITE_PROXY_URL`, `VITE_EEN_CLIENT_ID` usage in `main.ts` + Dockerfile.
- `Login.vue`, `Callback.vue`; OAuth-callback branch in the router guard.
- Dependence on the external OAuth proxy worker (stop using; not deleted here).
- GitHub Pages `deploy.yml` flow is superseded (decision: leave file or
  retire it — see open question).

## Risks / open questions

1. **`setBaseUrl` domain allowlist** may reject the SDK's `baseUrl` if it's
   an unexpected host. Verify the toolkit's allowed-domain list against a
   real `vendors.een.baseUrl` early in implementation.
2. **`requestHeaders`**: `een-api-toolkit` has no per-request custom-header
   hook. For EEN this is typically empty; if non-empty, that's a gap
   requiring a toolkit change or a fetch wrapper.
3. **GitHub repo / OIDC org**: Path B's trust policy expects
   `EENCloud/<repo>`; current repo is `klaushofrichter/een-observation-app`.
   Align during onboarding (move/mirror to EENCloud, or scope trust to the
   current org).
4. **Local fidelity**: dev-bypass cannot exercise the real Labs gate; the
   true SDK flow is only testable once the product is registered.
5. **GitHub Pages `deploy.yml`**: retire or leave dormant — confirm.
6. **Token-refresh v1** is intentionally minimal (timer + 401 reload).
