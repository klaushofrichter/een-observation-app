# Brivo Labs (Path B) Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy observation-app as a Brivo Labs-proxied experiment (slug `observation-app`) using Labs SDK authentication instead of the OAuth proxy, with a dev-bypass mode for local/E2E testing and full Path B deploy infrastructure.

**Architecture:** The browser loads `labs-auth.js`, which gates the page and brokers an EEN vendor token (`accessToken` + `baseUrl`). `main.ts` injects that token into `een-api-toolkit` before mounting. The OAuth proxy and the Login/Callback OAuth flow are removed. The container ships unchanged nginx-static behavior but builds with Vite base `/experiments/observation-app/`, deployed to Labs EKS via Helm + GitHub OIDC → ECR.

**Tech Stack:** Vue 3, TypeScript, Vite, `een-api-toolkit`, Pinia, Vitest (new, for unit tests), Playwright (E2E), nginx, Docker, Helm, GitHub Actions OIDC.

**Spec:** `docs/superpowers/specs/2026-05-28-brivo-labs-integration-design.md`

---

## File Structure

**New (app):**
- `src/labs/config.ts` — auth-mode + Labs config from env; product slug constant.
- `src/labs/loadLabsSdk.ts` — dynamic SDK script loader + `LabsAuth` TypeScript surface.
- `src/labs/labsAuth.ts` — `bootstrapAuth()`, token injection, `refreshLabsAuth()`, `labsLogout()`.

**New (infra/test):**
- `Makefile`, `charts/observation-app/` (Helm), `.github/workflows/build-and-push.yml`, `docker-compose.dev.yml`
- `vitest.config.ts`, `src/labs/*.test.ts`
- `tests/helpers/auth.ts`
- `docs/labs-onboarding-request.md`

**Modified:**
- `src/main.ts` — async bootstrap gate.
- `src/router/index.ts` — remove login/callback/logout routes + OAuth branch.
- `src/App.vue` — logout button via `labsLogout`; remove login link.
- `src/views/Home.vue` — replace `router.push('/login')` with `labsLogout()`.
- `vite.config.ts` — base path from env.
- `Dockerfile` — Path B base path; drop proxy build args.
- `playwright.config.ts` — dev-bypass webServer env.
- `tests/*.spec.ts` (×10) — replace `performLogin` with dev-auth helper.
- `package.json` — Vitest scripts + dep.
- `.env.example`, `CLAUDE.md`, `README.md` — new env vars + Labs notes.

**Deleted:**
- `src/views/Login.vue`, `src/views/Callback.vue`, `src/views/Logout.vue`.

---

## Phase 1 — Vitest setup

### Task 1: Add Vitest

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Install Vitest + happy-dom**

Run:
```bash
npm install -D vitest@^2 happy-dom@^15
```
Expected: packages added to `devDependencies`.

- [ ] **Step 2: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src') }
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    globals: true
  }
})
```

- [ ] **Step 3: Add `test:unit` script to `package.json`**

In the `"scripts"` block add:
```json
"test:unit": "vitest run",
```

- [ ] **Step 4: Verify the runner starts (no tests yet)**

Run: `npm run test:unit`
Expected: exits 0 with "No test files found" (acceptable at this point) — or a non-error message. If it errors on config, fix before continuing.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "chore: add Vitest for unit tests"
```

---

## Phase 2 — Labs auth modules (TDD)

### Task 2: Labs config module

**Files:**
- Create: `src/labs/config.ts`
- Test: `src/labs/config.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/labs/config.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getLabsConfig, LABS_PRODUCT_SLUG } from './config'

describe('getLabsConfig', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('exposes the product slug', () => {
    expect(LABS_PRODUCT_SLUG).toBe('observation-app')
  })

  it('defaults to labs mode with the production labs base', () => {
    vi.stubEnv('VITE_AUTH_MODE', '')
    vi.stubEnv('VITE_LABS_BASE', '')
    const cfg = getLabsConfig()
    expect(cfg.mode).toBe('labs')
    expect(cfg.labsBase).toBe('https://labs.eagleeyenetworks.com')
  })

  it('reads dev mode with token + baseUrl', () => {
    vi.stubEnv('VITE_AUTH_MODE', 'dev')
    vi.stubEnv('VITE_DEV_EEN_TOKEN', 'tok123')
    vi.stubEnv('VITE_DEV_EEN_BASE_URL', 'https://api.c021.eagleeyenetworks.com')
    const cfg = getLabsConfig()
    expect(cfg.mode).toBe('dev')
    expect(cfg.devToken).toBe('tok123')
    expect(cfg.devBaseUrl).toBe('https://api.c021.eagleeyenetworks.com')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/labs/config.test.ts`
Expected: FAIL — cannot resolve `./config`.

- [ ] **Step 3: Write `src/labs/config.ts`**

```typescript
export const LABS_PRODUCT_SLUG = 'observation-app'

export type AuthMode = 'labs' | 'dev'

export interface LabsConfig {
  mode: AuthMode
  labsBase: string
  devToken: string | null
  devBaseUrl: string | null
}

export function getLabsConfig(): LabsConfig {
  const rawMode = import.meta.env.VITE_AUTH_MODE
  return {
    mode: rawMode === 'dev' ? 'dev' : 'labs',
    labsBase: import.meta.env.VITE_LABS_BASE || 'https://labs.eagleeyenetworks.com',
    devToken: import.meta.env.VITE_DEV_EEN_TOKEN || null,
    devBaseUrl: import.meta.env.VITE_DEV_EEN_BASE_URL || null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/labs/config.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/labs/config.ts src/labs/config.test.ts
git commit -m "feat: add Labs config module"
```

---

### Task 3: SDK loader

**Files:**
- Create: `src/labs/loadLabsSdk.ts`
- Test: `src/labs/loadLabsSdk.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/labs/loadLabsSdk.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadLabsSdk, __resetLoadPromiseForTests } from './loadLabsSdk'

describe('loadLabsSdk', () => {
  beforeEach(() => {
    __resetLoadPromiseForTests()
    document.head.innerHTML = ''
    // @ts-expect-error test cleanup
    delete window.LabsAuth
    vi.stubEnv('VITE_LABS_BASE', 'https://labs.example.com')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('returns existing window.LabsAuth without injecting a script', async () => {
    const fake = { ready: vi.fn(), vendorRequireAuth: vi.fn(), logout: vi.fn() }
    // @ts-expect-error assign fake
    window.LabsAuth = fake
    const api = await loadLabsSdk()
    expect(api).toBe(fake)
    expect(document.head.querySelector('script')).toBeNull()
  })

  it('injects the script from VITE_LABS_BASE and resolves on load', async () => {
    const promise = loadLabsSdk()
    const script = document.head.querySelector('script')!
    expect(script.src).toBe('https://labs.example.com/sdk/labs-auth.js')
    const fake = { ready: vi.fn(), vendorRequireAuth: vi.fn(), logout: vi.fn() }
    // @ts-expect-error assign fake
    window.LabsAuth = fake
    script.onload!(new Event('load'))
    await expect(promise).resolves.toBe(fake)
  })

  it('rejects when the script fails to load', async () => {
    const promise = loadLabsSdk()
    const script = document.head.querySelector('script')!
    script.onerror!(new Event('error'))
    await expect(promise).rejects.toThrow(/Failed to load/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/labs/loadLabsSdk.test.ts`
Expected: FAIL — cannot resolve `./loadLabsSdk`.

- [ ] **Step 3: Write `src/labs/loadLabsSdk.ts`**

```typescript
import { getLabsConfig } from './config'

export interface EenVendor {
  accessToken: string
  baseUrl: string | null
  expiresAt: number
  requestHeaders?: Record<string, string>
}

export interface LabsCaller {
  kind: 'labs' | 'een'
  eenAccountId?: string
  eenUserId?: string
  labsUserId?: string | null
  isAdmin?: boolean
}

export interface LabsReadyResult {
  caller: LabsCaller
  vendors: Record<string, EenVendor>
  token: string
}

export interface LabsAuthApi {
  ready(opts: {
    product: string
    vendors?: string[]
    overlay?: boolean
    labsBase?: string
  }): Promise<LabsReadyResult | null>
  vendorRequireAuth(
    slugs: string[],
    opts: { product: string; labsBase?: string }
  ): Promise<Record<string, EenVendor> | null>
  logout(): void
}

declare global {
  interface Window {
    LabsAuth?: LabsAuthApi
  }
}

let loadPromise: Promise<LabsAuthApi> | null = null

/** Test-only: reset the memoized load promise between cases. */
export function __resetLoadPromiseForTests(): void {
  loadPromise = null
}

export function loadLabsSdk(): Promise<LabsAuthApi> {
  if (window.LabsAuth) return Promise.resolve(window.LabsAuth)
  if (loadPromise) return loadPromise

  const { labsBase } = getLabsConfig()
  loadPromise = new Promise<LabsAuthApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `${labsBase}/sdk/labs-auth.js`
    script.async = true
    script.onload = () => {
      if (window.LabsAuth) resolve(window.LabsAuth)
      else reject(new Error('labs-auth.js loaded but window.LabsAuth is undefined'))
    }
    script.onerror = () => {
      loadPromise = null
      reject(new Error(`Failed to load labs-auth.js from ${script.src}`))
    }
    document.head.appendChild(script)
  })
  return loadPromise
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/labs/loadLabsSdk.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/labs/loadLabsSdk.ts src/labs/loadLabsSdk.test.ts
git commit -m "feat: add Labs SDK loader with typed surface"
```

---

### Task 4: Auth bootstrap + token injection

**Files:**
- Create: `src/labs/labsAuth.ts`
- Test: `src/labs/labsAuth.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/labs/labsAuth.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const setToken = vi.fn()
const setBaseUrl = vi.fn(() => true)
vi.mock('een-api-toolkit', () => ({
  useAuthStore: () => ({ setToken, setBaseUrl })
}))

const ready = vi.fn()
const vendorRequireAuth = vi.fn()
const logout = vi.fn()
vi.mock('./loadLabsSdk', () => ({
  loadLabsSdk: () => Promise.resolve({ ready, vendorRequireAuth, logout })
}))

import { bootstrapAuth } from './labsAuth'

describe('bootstrapAuth', () => {
  beforeEach(() => {
    setToken.mockClear(); setBaseUrl.mockClear()
    ready.mockClear(); vendorRequireAuth.mockClear()
  })
  afterEach(() => vi.unstubAllEnvs())

  it('dev mode injects env token + baseUrl and returns true', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'dev')
    vi.stubEnv('VITE_DEV_EEN_TOKEN', 'tok123')
    vi.stubEnv('VITE_DEV_EEN_BASE_URL', 'https://api.c021.eagleeyenetworks.com')
    const mounted = await bootstrapAuth()
    expect(mounted).toBe(true)
    expect(setBaseUrl).toHaveBeenCalledWith('https://api.c021.eagleeyenetworks.com')
    expect(setToken).toHaveBeenCalledWith('tok123', expect.any(Number))
  })

  it('dev mode throws when token env is missing', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'dev')
    vi.stubEnv('VITE_DEV_EEN_TOKEN', '')
    vi.stubEnv('VITE_DEV_EEN_BASE_URL', '')
    await expect(bootstrapAuth()).rejects.toThrow(/VITE_DEV_EEN_TOKEN/)
  })

  it('labs mode injects the EEN vendor token and returns true', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'labs')
    ready.mockResolvedValue({
      caller: { kind: 'een' },
      token: 'jwt',
      vendors: {
        een: {
          accessToken: 'een-tok',
          baseUrl: 'https://api.c021.eagleeyenetworks.com',
          expiresAt: Math.floor(Date.now() / 1000) + 3600
        }
      }
    })
    const mounted = await bootstrapAuth()
    expect(mounted).toBe(true)
    expect(ready).toHaveBeenCalledWith({
      product: 'observation-app',
      vendors: ['een'],
      labsBase: 'https://labs.eagleeyenetworks.com'
    })
    expect(setBaseUrl).toHaveBeenCalledWith('https://api.c021.eagleeyenetworks.com')
    expect(setToken).toHaveBeenCalledWith('een-tok', expect.any(Number))
  })

  it('labs mode returns false when the SDK redirected (null)', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'labs')
    ready.mockResolvedValue(null)
    const mounted = await bootstrapAuth()
    expect(mounted).toBe(false)
    expect(setToken).not.toHaveBeenCalled()
  })

  it('labs mode throws when baseUrl is rejected by the toolkit', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'labs')
    setBaseUrl.mockReturnValueOnce(false)
    ready.mockResolvedValue({
      caller: { kind: 'een' },
      token: 'jwt',
      vendors: { een: { accessToken: 'x', baseUrl: 'https://evil.example.com', expiresAt: 0 } }
    })
    await expect(bootstrapAuth()).rejects.toThrow(/Rejected EEN baseUrl/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/labs/labsAuth.test.ts`
Expected: FAIL — cannot resolve `./labsAuth`.

- [ ] **Step 3: Write `src/labs/labsAuth.ts`**

```typescript
import { useAuthStore } from 'een-api-toolkit'
import { getLabsConfig, LABS_PRODUCT_SLUG } from './config'
import { loadLabsSdk, type EenVendor } from './loadLabsSdk'

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function injectEenVendor(een: EenVendor): void {
  const authStore = useAuthStore()
  if (!een.baseUrl) throw new Error('EEN vendor token missing baseUrl')
  const accepted = authStore.setBaseUrl(een.baseUrl)
  if (!accepted) throw new Error(`Rejected EEN baseUrl: ${een.baseUrl}`)
  const expiresIn = Math.max(0, een.expiresAt - nowSeconds())
  authStore.setToken(een.accessToken, expiresIn)
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null

function scheduleRefresh(expiresAt: number): void {
  if (refreshTimer) clearTimeout(refreshTimer)
  const ms = Math.max(5000, (expiresAt - nowSeconds() - 60) * 1000)
  refreshTimer = setTimeout(() => {
    void refreshLabsAuth()
  }, ms)
}

/**
 * Establish auth before the app mounts.
 * @returns true if the app should mount; false if the SDK redirected the page.
 */
export async function bootstrapAuth(): Promise<boolean> {
  const cfg = getLabsConfig()

  if (cfg.mode === 'dev') {
    if (!cfg.devToken || !cfg.devBaseUrl) {
      throw new Error(
        'Dev auth mode requires VITE_DEV_EEN_TOKEN and VITE_DEV_EEN_BASE_URL'
      )
    }
    injectEenVendor({
      accessToken: cfg.devToken,
      baseUrl: cfg.devBaseUrl,
      expiresAt: nowSeconds() + 86400
    })
    return true
  }

  const sdk = await loadLabsSdk()
  const res = await sdk.ready({
    product: LABS_PRODUCT_SLUG,
    vendors: ['een'],
    labsBase: cfg.labsBase
  })
  if (!res) return false // SDK redirected the page

  const een = res.vendors.een
  if (!een) throw new Error('Labs did not return an EEN vendor token')
  injectEenVendor(een)
  scheduleRefresh(een.expiresAt)
  return true
}

export async function refreshLabsAuth(): Promise<void> {
  const cfg = getLabsConfig()
  if (cfg.mode === 'dev') return
  try {
    const sdk = await loadLabsSdk()
    const vendors = await sdk.vendorRequireAuth(['een'], {
      product: LABS_PRODUCT_SLUG,
      labsBase: cfg.labsBase
    })
    if (!vendors || !vendors.een) {
      window.location.reload()
      return
    }
    injectEenVendor(vendors.een)
    scheduleRefresh(vendors.een.expiresAt)
  } catch {
    window.location.reload()
  }
}

export async function labsLogout(): Promise<void> {
  const cfg = getLabsConfig()
  try {
    const sdk = await loadLabsSdk()
    sdk.logout()
  } catch {
    // ignore — still redirect
  }
  window.location.href = `${cfg.labsBase}/product/${LABS_PRODUCT_SLUG}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/labs/labsAuth.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full unit suite + type-check**

Run: `npm run test:unit && npx vue-tsc --noEmit`
Expected: all unit tests pass; type-check clean.

- [ ] **Step 6: Commit**

```bash
git add src/labs/labsAuth.ts src/labs/labsAuth.test.ts
git commit -m "feat: add Labs auth bootstrap with token injection"
```

---

## Phase 3 — Wire bootstrap into the app

### Task 5: Rewrite `main.ts`

**Files:**
- Modify: `src/main.ts` (full replacement)

- [ ] **Step 1: Replace `src/main.ts` contents**

```typescript
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { initEenToolkit } from 'een-api-toolkit'
import App from './App.vue'
import router from './router'
import './assets/main.css'
import { bootstrapAuth } from './labs/labsAuth'

async function start(): Promise<void> {
  const app = createApp(App)

  // Pinia must be installed before initEenToolkit and before useAuthStore.
  app.use(createPinia())

  // Labs-only: no proxy/clientId. The token is injected by bootstrapAuth().
  initEenToolkit({
    storageStrategy: 'localStorage',
    debug: false
  })

  let mounted: boolean
  try {
    mounted = await bootstrapAuth()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    document.body.innerHTML =
      `<div style="font-family:sans-serif;padding:2rem;color:#b91c1c">` +
      `Authentication failed to initialize: ${message}</div>`
    return
  }

  if (!mounted) return // Labs SDK redirected the page; do not mount.

  app.use(router)
  app.mount('#app')
}

void start()
```

- [ ] **Step 2: Type-check**

Run: `npx vue-tsc --noEmit`
Expected: clean (note: `Login.vue`/`Callback.vue` still referenced by the router until Task 6 — if the type-check errors on missing imports, proceed to Task 6 and re-run there).

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat: gate app mount on Labs auth bootstrap"
```

---

### Task 6: Router cleanup + remove OAuth views

**Files:**
- Modify: `src/router/index.ts`
- Delete: `src/views/Login.vue`, `src/views/Callback.vue`, `src/views/Logout.vue`

- [ ] **Step 1: Replace `src/router/index.ts` contents**

```typescript
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from 'een-api-toolkit'
import { clearUrlSessionStorage } from '@/utils/clearUrlSessionStorage'
import { getLabsConfig, LABS_PRODUCT_SLUG } from '@/labs/config'
import Home from '../views/Home.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: Home,
      meta: { requiresAuth: true }
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

/**
 * Auth check: Pinia store first, then a localStorage fallback for the
 * window before the store hydrates. setToken() (called during bootstrap)
 * writes these same keys.
 */
function isAuthenticated(): boolean {
  const authStore = useAuthStore()
  if (authStore.isAuthenticated) return true

  const token = localStorage.getItem('een_token')
  const expiration = localStorage.getItem('een_tokenExpiration')
  if (token && expiration) {
    const expirationTime = parseInt(expiration, 10)
    if (expirationTime > Date.now() + 60000) return true
  }
  return false
}

/** Labs owns login; send unauthenticated users to the Labs product page. */
function redirectToProductPage(): void {
  const { labsBase } = getLabsConfig()
  window.location.href = `${labsBase}/product/${LABS_PRODUCT_SLUG}`
}

router.beforeEach((to, _from, next) => {
  // Persist in-app URL state through navigation (still used by the app).
  if (to.path === '/') {
    if (Object.keys(to.query).length === 0) {
      clearUrlSessionStorage()
    }
    const map: Record<string, string> = {
      id: 'een_url_camera_ids',
      selected: 'een_url_selected',
      events: 'een_url_events',
      ed: 'een_url_ed',
      ad: 'een_url_ad',
      er: 'een_url_er',
      ar: 'een_url_ar',
      live: 'een_url_live',
      filter: 'een_url_filter',
      dark: 'een_url_dark',
      mute: 'een_url_mute',
      full: 'een_url_full'
    }
    for (const [param, key] of Object.entries(map)) {
      if (to.query[param] !== undefined) {
        sessionStorage.setItem(key, to.query[param] as string)
      } else {
        sessionStorage.removeItem(key)
      }
    }
  }

  if (to.meta.requiresAuth && !isAuthenticated()) {
    redirectToProductPage()
    return
  }
  next()
})

export default router
```

- [ ] **Step 2: Delete the OAuth view files**

Run:
```bash
git rm src/views/Login.vue src/views/Callback.vue src/views/Logout.vue
```
Expected: three files staged for deletion.

- [ ] **Step 3: Type-check**

Run: `npx vue-tsc --noEmit`
Expected: errors only from `App.vue` (logout/login `router-link`) and `Home.vue` (`router.push('/login')`) — fixed in Task 7. If other errors appear, resolve them.

- [ ] **Step 4: Commit**

```bash
git add src/router/index.ts
git commit -m "refactor: Labs-only routing, drop OAuth login/callback/logout"
```

---

### Task 7: Update App.vue + Home.vue auth references

**Files:**
- Modify: `src/App.vue:1-35` (script imports), `src/App.vue:490-503` (template)
- Modify: `src/views/Home.vue:421-432`

- [ ] **Step 1: Add the logout handler import to `App.vue` script**

In `src/App.vue`, after line 4 (`import { useRoute } from 'vue-router'`), add:
```typescript
import { labsLogout } from '@/labs/labsAuth'
```

- [ ] **Step 2: Add the `onLogout` function in `App.vue` script**

After the `const route = useRoute()` line (around line 25), add:
```typescript
function onLogout(): void {
  void labsLogout()
}
```

- [ ] **Step 3: Replace the logout/login template block in `App.vue`**

Replace this block (around lines 490-503):
```html
          <template v-if="isAuthenticated && user">
            <button
              @click="showUserModal = true"
              class="hover:underline cursor-pointer"
              title="View user info and API details"
            >
              {{ user.firstName }} {{ user.lastName }}
            </button>
            <span class="opacity-50">|</span>
            <router-link to="/logout" class="hover:underline">Logout</router-link>
          </template>
          <template v-else-if="route.name !== 'login'">
            <router-link to="/login" class="hover:underline">Login</router-link>
          </template>
```
with:
```html
          <template v-if="isAuthenticated && user">
            <button
              @click="showUserModal = true"
              class="hover:underline cursor-pointer"
              title="View user info and API details"
            >
              {{ user.firstName }} {{ user.lastName }}
            </button>
            <span class="opacity-50">|</span>
            <button @click="onLogout" class="hover:underline cursor-pointer">Logout</button>
          </template>
```

- [ ] **Step 4: Replace the `router.push('/login')` in `Home.vue`**

In `src/views/Home.vue`, add to the script imports (near the other `@/` imports):
```typescript
import { labsLogout } from '@/labs/labsAuth'
```
Then replace lines 424-428:
```typescript
  if (result.error) {
    if (result.error.code === 'AUTH_REQUIRED') {
      router.push('/login')
      return
    }
    error.value = result.error
  } else {
```
with:
```typescript
  if (result.error) {
    if (result.error.code === 'AUTH_REQUIRED') {
      void labsLogout()
      return
    }
    error.value = result.error
  } else {
```

- [ ] **Step 5: Type-check + build**

Run: `npx vue-tsc --noEmit && npx vite build --base=/`
Expected: clean type-check; successful build.

- [ ] **Step 6: Commit**

```bash
git add src/App.vue src/views/Home.vue
git commit -m "feat: wire Labs logout into App and Home"
```

---

## Phase 4 — Build, Vite base path, Docker

### Task 8: Vite base path from env

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Replace `vite.config.ts` contents**

```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// Base path is driven by VITE_BASE_PATH so the same build works for Labs
// (/experiments/observation-app/) and any other host. Dev server stays at '/'.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? (process.env.VITE_BASE_PATH || '/experiments/observation-app/') : '/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  server: {
    host: '127.0.0.1',
    port: 3333,
    strictPort: true,
    open: true
  }
}))
```

- [ ] **Step 2: Verify the default base path is applied**

Run: `npx vite build && grep -o '/experiments/observation-app/assets/[^"]*' dist/index.html | head -1`
Expected: prints an asset path beginning `/experiments/observation-app/assets/`.

- [ ] **Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "feat: drive Vite base path from VITE_BASE_PATH (default Labs path)"
```

---

### Task 9: Dockerfile for Path B

**Files:**
- Modify: `Dockerfile`

- [ ] **Step 1: Replace `Dockerfile` contents**

```dockerfile
# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS build
WORKDIR /app

# Labs-proxied base path. Overridable, but defaults to the registered slug path.
ARG VITE_BASE_PATH=/experiments/observation-app/
ENV VITE_BASE_PATH=$VITE_BASE_PATH

ENV HUSKY=0

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
# Labs auth is the default mode (VITE_AUTH_MODE unset => 'labs').
RUN npx vue-tsc --noEmit && npx vite build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY --from=build --chown=nginx:nginx /app/dist /usr/share/nginx/html
COPY --chown=nginx:nginx nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
```

- [ ] **Step 2: Build the image**

Run: `docker build -t observation-app:plancheck .`
Expected: build succeeds; final stage is nginx-unprivileged.

- [ ] **Step 3: Verify assets are served at the Labs base path**

Run:
```bash
docker rm -f oa-plancheck 2>/dev/null; docker run -d --name oa-plancheck -p 3334:8080 observation-app:plancheck
sleep 2
curl -s http://127.0.0.1:3334/ | grep -o '/experiments/observation-app/assets/[^"]*' | head -1
docker rm -f oa-plancheck
```
Expected: prints an asset path under `/experiments/observation-app/assets/`.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile
git commit -m "feat: build container for Labs Path B base path"
```

---

## Phase 5 — Path B deploy infrastructure

### Task 10: Makefile

**Files:**
- Create: `Makefile`

- [ ] **Step 1: Create `Makefile`**

```makefile
SLUG := observation-app
IMAGE_TAG ?= local
CHART := charts/$(SLUG)

.PHONY: deployment-image test chart-lint chart-template

## Build the production container as <slug>:$(IMAGE_TAG) (CI contract).
deployment-image:
	docker build -t $(SLUG):$(IMAGE_TAG) .

## Smoke test: unit tests + type-check.
test:
	npm ci --no-audit --no-fund
	npm run test:unit
	npx vue-tsc --noEmit

## Helm lint.
chart-lint:
	helm lint $(CHART)

## Render the chart with defaults.
chart-template:
	helm template $(SLUG) $(CHART) --namespace experiments --set image.tag=$(IMAGE_TAG)
```

- [ ] **Step 2: Verify the image target builds the contract-named image**

Run: `make deployment-image IMAGE_TAG=local && docker image inspect observation-app:local >/dev/null && echo OK`
Expected: prints `OK`.

- [ ] **Step 3: Commit**

```bash
git add Makefile
git commit -m "feat: add Makefile with Path B CI contract targets"
```

---

### Task 11: Helm chart

**Files:**
- Create: `charts/observation-app/Chart.yaml`
- Create: `charts/observation-app/values.yaml`
- Create: `charts/observation-app/templates/deployment.yaml`
- Create: `charts/observation-app/templates/service.yaml`

- [ ] **Step 1: Create `charts/observation-app/Chart.yaml`**

```yaml
apiVersion: v2
name: een-labs-observation-app
description: EEN Camera Observation App - Brivo Labs experiment (Path B)
type: application
version: 0.1.0
appVersion: "1.0.0"
```

- [ ] **Step 2: Create `charts/observation-app/values.yaml`**

```yaml
image:
  repository: een-labs-observation-app
  tag: latest
  pullPolicy: IfNotPresent

replicaCount: 1

service:
  port: 8080
  targetPort: 8080

# Labs-only auth keeps no secrets in the container. Leave empty.
secretEnvFrom: ""

resources:
  requests:
    cpu: 50m
    memory: 64Mi
  limits:
    cpu: 250m
    memory: 128Mi
```

- [ ] **Step 3: Create `charts/observation-app/templates/deployment.yaml`**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Chart.Name }}
  namespace: {{ .Release.Namespace }}
  labels:
    app: {{ .Chart.Name }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      app: {{ .Chart.Name }}
  template:
    metadata:
      labels:
        app: {{ .Chart.Name }}
    spec:
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - containerPort: {{ .Values.service.targetPort }}
          {{- if .Values.secretEnvFrom }}
          envFrom:
            - secretRef:
                name: {{ .Values.secretEnvFrom }}
          {{- end }}
          readinessProbe:
            httpGet:
              path: /
              port: {{ .Values.service.targetPort }}
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /
              port: {{ .Values.service.targetPort }}
            initialDelaySeconds: 10
            periodSeconds: 30
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
```

- [ ] **Step 4: Create `charts/observation-app/templates/service.yaml`**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: {{ .Chart.Name }}
  namespace: {{ .Release.Namespace }}
  labels:
    app: {{ .Chart.Name }}
spec:
  selector:
    app: {{ .Chart.Name }}
  ports:
    - protocol: TCP
      port: {{ .Values.service.port }}
      targetPort: {{ .Values.service.targetPort }}
```

- [ ] **Step 5: Lint and render the chart**

Run: `make chart-lint && make chart-template`
Expected: `helm lint` reports 0 failures; `helm template` renders a Deployment (containerPort 8080, readiness/liveness on `/`) and a Service (port 8080). Eyeball the output.

- [ ] **Step 6: Commit**

```bash
git add charts/observation-app
git commit -m "feat: add Helm chart for Labs EKS deploy"
```

---

### Task 12: GitHub OIDC build-and-push workflow

**Files:**
- Create: `.github/workflows/build-and-push.yml`

> **Note:** `<ACCOUNT_ID>` and the role ARN are placeholders until onboarding (Task 15) returns them. The workflow is committed now but only runs successfully after the platform team applies terraform and the values are filled in. Leave a `TODO(onboarding)` marker on the two lines that need the real values.

- [ ] **Step 1: Create `.github/workflows/build-and-push.yml`**

```yaml
name: build-and-push
on:
  push:
    branches: [main]
    tags: ['v*']

permissions:
  id-token: write
  contents: read

env:
  AWS_REGION: us-east-1
  REPO: een-labs-observation-app

jobs:
  push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          # TODO(onboarding): replace with the IAM role ARN from terraform output.
          role-to-assume: arn:aws:iam::<ACCOUNT_ID>:role/een-labs-ecr-push-observation-app
          aws-region: ${{ env.AWS_REGION }}

      - uses: aws-actions/amazon-ecr-login@v2
        id: ecr

      - name: Build and push image
        env:
          REGISTRY: ${{ steps.ecr.outputs.registry }}
          TAG: ${{ github.sha }}
        run: |
          make deployment-image IMAGE_TAG=$TAG
          docker tag observation-app:$TAG $REGISTRY/$REPO:$TAG
          docker tag observation-app:$TAG $REGISTRY/$REPO:latest
          docker push $REGISTRY/$REPO:$TAG
          docker push $REGISTRY/$REPO:latest

      - name: Package and push Helm chart (OCI)
        env:
          REGISTRY: ${{ steps.ecr.outputs.registry }}
        run: |
          if [ "${GITHUB_REF_TYPE}" = "tag" ]; then
            CHART_VERSION="${GITHUB_REF_NAME#v}"
          else
            CHART_VERSION="0.0.0-main.$(git rev-parse --short HEAD)"
          fi
          helm package charts/observation-app --version "$CHART_VERSION" --app-version "$CHART_VERSION"
          helm push "een-labs-observation-app-${CHART_VERSION}.tgz" "oci://$REGISTRY"
```

- [ ] **Step 2: Validate workflow YAML syntax**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/build-and-push.yml')); print('valid yaml')"`
Expected: prints `valid yaml`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/build-and-push.yml
git commit -m "ci: add OIDC build-and-push for ECR (image + chart)"
```

---

### Task 13: docker-compose for local dev

**Files:**
- Create: `docker-compose.dev.yml`

- [ ] **Step 1: Create `docker-compose.dev.yml`**

```yaml
# Local dev container in dev-bypass auth mode.
# Provide a real EEN token in a .env file:
#   VITE_DEV_EEN_TOKEN=<an EEN access JWT>
#   VITE_DEV_EEN_BASE_URL=https://api.cXXX.eagleeyenetworks.com
services:
  observation-app:
    build:
      context: .
      args:
        # Serve at root for simple local access (no Labs prefix).
        VITE_BASE_PATH: /
    ports:
      - "3333:8080"
    environment:
      VITE_AUTH_MODE: dev
      VITE_DEV_EEN_TOKEN: ${VITE_DEV_EEN_TOKEN}
      VITE_DEV_EEN_BASE_URL: ${VITE_DEV_EEN_BASE_URL}
```

> **Note:** `VITE_*` vars are build-time for Vite. For a true dev-bypass container you must build with these as build args, or run `npm run dev` with them in `.env`. This compose file documents the local pattern; the canonical local-dev path is `npm run dev` with the env vars set (Task 14).

- [ ] **Step 2: Validate compose syntax**

Run: `docker compose -f docker-compose.dev.yml config >/dev/null && echo OK`
Expected: prints `OK`.

- [ ] **Step 3: Commit**

```bash
git add docker-compose.dev.yml
git commit -m "chore: add docker-compose for local dev-bypass"
```

---

## Phase 6 — Test rework (dev-bypass)

### Task 14: Playwright dev-bypass webServer + env

**Files:**
- Modify: `playwright.config.ts`
- Modify: `.env.example`

- [ ] **Step 1: Update the `webServer` block in `playwright.config.ts`**

Replace the existing `webServer` block with:
```typescript
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3333',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
    env: {
      VITE_AUTH_MODE: 'dev',
      VITE_DEV_EEN_TOKEN: process.env.VITE_DEV_EEN_TOKEN || '',
      VITE_DEV_EEN_BASE_URL: process.env.VITE_DEV_EEN_BASE_URL || ''
    }
  }
```

- [ ] **Step 2: Add the new dev vars to `.env.example`**

Append to `.env.example`:
```
# Labs dev-bypass (local + E2E). Obtain a current EEN access token and the
# matching cluster base URL out-of-band; this skips the Labs SDK locally.
VITE_AUTH_MODE=dev
VITE_DEV_EEN_TOKEN=YOUR-EEN-ACCESS-TOKEN
VITE_DEV_EEN_BASE_URL=https://api.cXXX.eagleeyenetworks.com
```

- [ ] **Step 3: Commit**

```bash
git add playwright.config.ts .env.example
git commit -m "test: run E2E against dev-bypass auth mode"
```

---

### Task 15: Shared dev-auth test helper

**Files:**
- Create: `tests/helpers/auth.ts`

- [ ] **Step 1: Create `tests/helpers/auth.ts`**

```typescript
import { Page, expect } from '@playwright/test'

/**
 * In dev-bypass mode the app injects the EEN token from build/runtime env on
 * load, so no login UI is involved. This helper navigates to a path and waits
 * for the authenticated home shell to render.
 */
export async function gotoAuthenticated(page: Page, path = '/'): Promise<void> {
  await page.goto(path)
  // The user button (firstName lastName) only renders when authenticated.
  await expect(page.locator('header button[title="View user info and API details"]'))
    .toBeVisible({ timeout: 30000 })
}

/** True when dev-bypass credentials are configured. */
export function hasDevToken(): boolean {
  return !!process.env.VITE_DEV_EEN_TOKEN && !!process.env.VITE_DEV_EEN_BASE_URL
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/helpers/auth.ts
git commit -m "test: add shared dev-auth helper"
```

---

### Task 16: Migrate spec files off performLogin

**Files (apply the same transformation to each):**
- Modify: `tests/cameras.spec.ts`, `tests/camera-select.spec.ts`, `tests/dark-mode.spec.ts`, `tests/event-types.spec.ts`, `tests/events.spec.ts`, `tests/mute.spec.ts`, `tests/url-state.spec.ts`, `tests/user-info.spec.ts`, `tests/qr-code.spec.ts`, `tests/auth.spec.ts`

For **each** file, perform the identical mechanical change below.

- [ ] **Step 1: Add the helper import**

At the top of each spec (after the `@playwright/test` import) add:
```typescript
import { gotoAuthenticated, hasDevToken } from './helpers/auth'
```

- [ ] **Step 2: Delete the local `performLogin` function**

Remove the entire `async function performLogin(page, username, password) { ... }` block (it is duplicated in each file). Also remove the now-unused `isProxyAccessible` helper and `PROXY_URL` constant if present.

- [ ] **Step 3: Replace login calls with the helper**

Replace every call of the shape:
```typescript
await performLogin(page, TEST_USER!, TEST_PASSWORD!)
```
with:
```typescript
await gotoAuthenticated(page)
```
If a test navigates to a specific URL after login (e.g. `page.goto('/?id=...')`), pass that path: `await gotoAuthenticated(page, '/?id=...')`.

- [ ] **Step 4: Replace skip guards**

Replace `skipIfNoProxy()` / `skipIfNoCredentials()` guards (and their `proxyAccessible` `beforeAll` probe) with a single dev-token guard at the top of the describe block:
```typescript
test.beforeEach(() => {
  test.skip(!hasDevToken(), 'Dev-bypass token not configured (VITE_DEV_EEN_TOKEN)')
})
```

- [ ] **Step 5: Rework `tests/auth.spec.ts` specifically**

The OAuth-login assertions no longer apply. Reduce `auth.spec.ts` to verify dev-bypass auth state:
```typescript
import { test, expect } from '@playwright/test'
import dotenv from 'dotenv'
import { gotoAuthenticated, hasDevToken } from './helpers/auth'

dotenv.config()

test.describe('Authentication (Labs dev-bypass)', () => {
  test.beforeEach(() => {
    test.skip(!hasDevToken(), 'Dev-bypass token not configured (VITE_DEV_EEN_TOKEN)')
  })

  test('app loads authenticated and stores an EEN token', async ({ page }) => {
    await gotoAuthenticated(page)
    const token = await page.evaluate(() => localStorage.getItem('een_token'))
    expect(token).toBeTruthy()
  })

  test('unauthenticated load redirects to the Labs product page', async ({ page }) => {
    await page.addInitScript(() => localStorage.clear())
    // With no token and SDK absent locally, the guard sends us to labs.
    // We assert the app shell never reaches the authenticated state.
    await page.goto('/')
    await expect(
      page.locator('header button[title="View user info and API details"]')
    ).toHaveCount(0, { timeout: 5000 })
  })
})
```

- [ ] **Step 6: Type-check the tests**

Run: `npx tsc --noEmit -p tsconfig.json` (or `npx vue-tsc --noEmit`)
Expected: no references to removed `performLogin` / proxy helpers remain.

- [ ] **Step 7: Run the E2E suite against dev-bypass**

> Requires `VITE_DEV_EEN_TOKEN` + `VITE_DEV_EEN_BASE_URL` set in `.env` to a **current** EEN access token for the test account.

Run: `npm test`
Expected: specs pass (or cleanly skip if no dev token). Investigate any failures that are not token-expiry related.

- [ ] **Step 8: Commit**

```bash
git add tests/
git commit -m "test: migrate specs to Labs dev-bypass auth"
```

---

## Phase 7 — Onboarding + docs

### Task 17: Onboarding request document

**Files:**
- Create: `docs/labs-onboarding-request.md`

- [ ] **Step 1: Create `docs/labs-onboarding-request.md`**

```markdown
# Brivo Labs onboarding request — observation-app

**To:** Eric Janik (eric@een.com)
**Hosting shape:** Labs-proxied (Path B)

## Product
- **Slug:** `observation-app`
- **Name:** EEN Camera Observation App
- **Tagline:** Live + recorded multi-camera monitoring with events and alerts.
- **Has UI:** yes
- **Requires approval:** no (account-level grant)

## Vendors
- `een` (required) — the app calls the EEN v3.0 API with the brokered vendor token.

## Access
- **Model:** account-level grant.
- **Initial account to enroll:** <EEN_ACCOUNT_ID>  <!-- TODO: fill in -->

## Hosting / CI
- **GitHub org/repo:** <ORG>/<REPO>  <!-- TODO: confirm EENCloud vs current org; see spec risk #3 -->
- **Repo created by:** <you | platform team>  <!-- TODO -->
- Container listens on `0.0.0.0:8080`. Helm chart at `charts/observation-app/`,
  Service name `een-labs-observation-app`, port 8080.

## What we need back
- ECR repository URL (`een-labs-observation-app`).
- IAM role ARN (`een-labs-ecr-push-observation-app`) for GitHub OIDC.
- Confirmed GitHub repo path for the OIDC trust policy.
- `proxyTarget` wired to `http://observation-app.experiments.svc.cluster.local:8080`
  after the first deploy.

## Candidacy notes
- Single auth-gated Service, no unauthenticated inbound paths (no webhooks).
- Single replica, static SPA + nginx. No multi-service architecture.
- No secrets required in the container (Labs-only auth).
```

- [ ] **Step 2: Commit**

```bash
git add docs/labs-onboarding-request.md
git commit -m "docs: add Labs onboarding request"
```

---

### Task 18: Update CLAUDE.md, README, .gitignore

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `.gitignore`

- [ ] **Step 1: Update `CLAUDE.md`**

- Replace the "Required env vars" line with:
  `VITE_AUTH_MODE` (`labs` default | `dev`), `VITE_LABS_BASE` (default `https://labs.eagleeyenetworks.com`), and for dev-bypass `VITE_DEV_EEN_TOKEN` + `VITE_DEV_EEN_BASE_URL`. (Remove `VITE_PROXY_URL`, `VITE_EEN_CLIENT_ID`.)
- Update the "Routing & Auth Flow" section: the app is Labs-only — `labs-auth.js` gates the page and brokers the EEN vendor token, injected via `authStore.setToken`/`setBaseUrl` in `main.ts` before mount; there is no OAuth callback route.
- Add a "Brivo Labs (Path B)" section noting slug `observation-app`, Vite base `/experiments/observation-app/`, Makefile/Helm/ECR-OIDC, and the dev-bypass for local/E2E.
- Note unit tests: `npm run test:unit` (Vitest).

- [ ] **Step 2: Update `README.md`**

- Remove proxy/OAuth setup steps; replace `VITE_EEN_CLIENT_ID`/`VITE_PROXY_URL` instructions with the new env vars and the dev-bypass workflow. Document the Labs Path B deploy at a high level (link the onboarding doc + spec).

- [ ] **Step 3: Update `.gitignore` if needed**

Ensure `*.tgz` (packaged Helm charts) is ignored:
```
*.tgz
```

- [ ] **Step 4: Final verification**

Run:
```bash
npm run test:unit && npx vue-tsc --noEmit && npx vite build && make chart-lint
```
Expected: unit tests pass, type-check clean, build succeeds, chart lints clean.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md README.md .gitignore
git commit -m "docs: update project docs for Labs-only auth + Path B"
```

---

## Self-Review Notes (for the executor)

- **Spec coverage:** §2 auth bootstrap → Tasks 4–5; §3 token refresh → Task 4 (`scheduleRefresh`/`refreshLabsAuth`); §4 routing → Tasks 6–7; §5 build/Vite/nginx/Dockerfile → Tasks 8–9 (nginx.conf unchanged by design); §6 infra → Tasks 10–13; §7 onboarding → Task 17; §8 testing → Tasks 1–4 (unit), 14–16 (E2E).
- **Risk #1 (setBaseUrl allowlist):** Task 4's labsAuth throws a clear error if `setBaseUrl` returns false; verify against a real `vendors.een.baseUrl` the first time the SDK runs in a registered environment.
- **Risk #2 (requestHeaders):** not consumed by the toolkit; left out intentionally. If a future vendor needs them, add a fetch wrapper — out of scope here.
- **Open items deferred to onboarding (Task 17):** GitHub org/repo + account ID placeholders, and the workflow's `<ACCOUNT_ID>`/role ARN (Task 12) — all marked `TODO(onboarding)`.
- **GitHub Pages `deploy.yml`:** left in place (dormant) per spec open question #5; retire later if desired.
