# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vue 3 single-page application for Eagle Eye Networks camera monitoring. Uses the `een-api-toolkit` npm package for all API interactions (auth, cameras, events, alerts, media, exports). Live video via `@een/live-video-web-sdk`, recorded playback via `hls.js`.

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server at `http://127.0.0.1:3333` (kills existing port 3333 process first) |
| `npm run build` | Type-check with `vue-tsc --noEmit` then build with Vite |
| `npm run test:unit` | Run Vitest unit tests (src/**/*.test.ts) |
| `npm test` | Run all Playwright E2E tests (requires dev server + dev-bypass token) |
| `npx playwright test tests/events.spec.ts` | Run a single test file |
| `npx playwright test -g "should toggle dark mode"` | Run a single test by name |
| `npx playwright test --ui` | Interactive Playwright UI |
| `npx playwright test --headed` | Tests in visible browser |

## Testing Notes

- Tests run sequentially (`workers: 1`, `fullyParallel: false`), no retries, 60s timeout
- E2E tests run in dev-bypass mode (`VITE_AUTH_MODE=dev`); requires `.env` with `VITE_DEV_EEN_TOKEN`, `VITE_DEV_EEN_BASE_URL`, `TEST_USER`, and `TEST_PASSWORD`. Tests are skipped when `VITE_DEV_EEN_TOKEN` is not set.
- Auth state cached in `.auth-state.json` for reuse across specs
- The `performLogin()` helper handles the 2-step OAuth flow (email → Next → password → Sign in) for the dev-bypass login page
- Dev server auto-starts via Playwright's `webServer` config unless already running

## Architecture

### Routing & Auth Flow
- **Labs-only auth**: `labs-auth.js` (from the Labs SDK) gates the page before the Vue app loads. It brokers an EEN vendor token on behalf of the authenticated Labs user.
- `main.ts` calls `src/labs/labsAuth.ts` to retrieve the token/baseUrl from the Labs SDK, then injects them into `een-api-toolkit` via `authStore.setToken`/`setBaseUrl` before mounting the Vue app. See `src/labs/` (`config.ts`, `loadLabsSdk.ts`, `labsAuth.ts`).
- There is no `/login` or `/callback` route and no OAuth proxy. The router-guard OAuth `code`/`state` branch was removed. Unauthenticated users are redirected to the Labs product page by `labs-auth.js`.
- Auth state: Pinia store (`useAuthStore` from een-api-toolkit), populated via the Labs-brokered token before mount.

### Component Structure
- `Home.vue` — Main layout orchestrating all panels and video player
- `CameraSidebar.vue` — Paginated camera list with layout dropdown filter
- `CameraSelectModal.vue` — Camera selection modal (up to 10 cameras)
- `MainVideoPlayer.vue` — HD live (SDK) + HLS recorded playback with keyboard shortcuts
- `EventsPanel.vue` / `AlertsPanel.vue` — Event/alert lists with time range, auto-refresh, live SSE
- `EventTypesPanel.vue` — Event type toggles that filter both panels
- `BoundingBoxOverlay.vue` — Object detection boxes on thumbnails/video

### Composables (Singleton Pattern)
Composables in `src/composables/` manage shared state as module-level singletons:
- `useVideoExport()` — Export job lifecycle with 10-min auto-clipping
- `useImageCache()` — LRU cache (250 items) for event thumbnails, deduplicates in-flight requests
- `useDarkMode()` — Reactive dark mode via `dark` class on `<html>`, persisted to localStorage
- `useMute()` — Mute toggle persisted to localStorage, with sessionStorage through OAuth flow
- `useSseNotification()` — SSE event notification banner with Web Audio API beep sound
- `useHlsPlayer()` — HLS.js player setup and teardown
- `useBoundingBoxes()` — Object detection box data fetch/parse for overlays
- `useEventAge()` — Shared ticking clock for relative "X seconds ago" event timestamps

### URL State
All view state is encoded in URL params (`id`, `selected`, `events`, `ed`, `ad`, `er`, `ar`, `live`, `filter`, `dark`, `mute`, `full`). Event types use 3-char DJB2 base62 hashes (see `src/utils/eventTypeHash.ts`). URL auto-updates on user interaction.

### Dark Mode
Toggles `dark` class on `<html>` element. Tailwind CSS scopes dark styles. Persists via localStorage (`een_dark_mode`) and sessionStorage through OAuth flow. URL param `dark=1` overrides stored preference.

## Environment

- **Must run on** `http://127.0.0.1:3333` (strictPort) for local dev
- **Required env vars** in `.env`:
  - `VITE_AUTH_MODE` — `labs` (default, production) or `dev` (local/E2E dev-bypass)
  - `VITE_LABS_BASE` — Labs base URL (default: `https://labs.eagleeyenetworks.com`)
  - `VITE_DEV_EEN_TOKEN` — EEN access token for dev-bypass mode (required when `VITE_AUTH_MODE=dev`)
  - `VITE_DEV_EEN_BASE_URL` — EEN API base URL for dev-bypass mode
  - `TEST_USER` / `TEST_PASSWORD` — credentials for Playwright E2E login flow
  - (`VITE_PROXY_URL` and `VITE_EEN_CLIENT_ID` are no longer used.)
- Production build uses base path `/experiments/observation-app/` (driven by `VITE_BASE_PATH`)

## Pre-commit Hook

Husky pre-commit hook auto-increments patch version (`npm version patch`) when `src/`, `public/`, or `index.html` files are staged. This modifies `package.json` and stages it automatically.

## Key Dependencies

- `een-api-toolkit` — All EEN API calls (auth, cameras, events, alerts, media, jobs, layouts); token injected by Labs auth, no OAuth proxy
- `@een/live-video-web-sdk` — Live HD video streaming
- `hls.js` — HLS recorded video playback
- `pinia` — State management (auth store from toolkit + app state)
- `tailwindcss` v4 — Styling with PostCSS plugin (`@tailwindcss/postcss`)

## Brivo Labs (Path B)

- **Slug:** `observation-app`
- **Vite base path:** `/experiments/observation-app/` (set via `VITE_BASE_PATH`)
- **Deploy infra:** `Makefile` (`deployment-image`, `test`, `chart-lint`, `chart-template` targets) + `charts/observation-app/` Helm chart + `.github/workflows/build-and-push.yml` (GitHub OIDC → ECR push)
- **Local / E2E dev:** use `VITE_AUTH_MODE=dev` with `VITE_DEV_EEN_TOKEN` + `VITE_DEV_EEN_BASE_URL` to bypass Labs auth. E2E tests are skipped when `VITE_DEV_EEN_TOKEN` is unset.
- **Design spec:** `docs/superpowers/specs/2026-05-28-brivo-labs-integration-design.md`
- **Onboarding request:** `docs/labs-onboarding-request.md`
