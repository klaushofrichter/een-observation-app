# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vue 3 single-page application for Eagle Eye Networks camera monitoring. Uses the `een-api-toolkit` npm package for all API interactions (auth, cameras, events, alerts, media, exports). Live video via `@een/live-video-web-sdk`, recorded playback via `hls.js`.

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server at `http://127.0.0.1:3333` (kills existing port 3333 process first) |
| `npm run build` | Type-check with `vue-tsc --noEmit` then build with Vite |
| `npm test` | Run all 51 Playwright E2E tests across 10 spec files (requires dev server + OAuth proxy) |
| `npx playwright test tests/events.spec.ts` | Run a single test file |
| `npx playwright test -g "should toggle dark mode"` | Run a single test by name |
| `npx playwright test --ui` | Interactive Playwright UI |
| `npx playwright test --headed` | Tests in visible browser |

## Testing Notes

- Tests run sequentially (`workers: 1`, `fullyParallel: false`), no retries, 60s timeout
- Tests perform real OAuth login against EEN servers; requires `.env` with `TEST_USER` and `TEST_PASSWORD`
- Auth state cached in `.auth-state.json` for reuse across specs
- The `performLogin()` helper handles the 2-step OAuth flow (email → Next → password → Sign in)
- Dev server auto-starts via Playwright's `webServer` config unless already running

## Architecture

### Routing & Auth Flow
- **Router guard order matters**: OAuth callback check (looking for `code`/`state` params) MUST come before the auth check, because EEN IDP redirects to `/` with those params.
- URL params are saved to sessionStorage before OAuth redirect and restored after callback, enabling state persistence through the login flow.
- Auth state: Pinia store (`useAuthStore` from een-api-toolkit) + localStorage fallback (`een_token`, `een_tokenExpiration`).

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

### URL State
All view state is encoded in URL params (`id`, `selected`, `events`, `ed`, `ad`, `er`, `ar`, `live`, `filter`, `dark`, `mute`, `full`). Event types use 3-char DJB2 base62 hashes (see `src/utils/eventTypeHash.ts`). URL auto-updates on user interaction. Because all state lives in the URL, `App.vue` renders a QR code (via the `qrcode` package) of the current URL so the exact view can be opened on another device.

### Dark Mode
Toggles `dark` class on `<html>` element. Tailwind CSS scopes dark styles. Persists via localStorage (`een_dark_mode`) and sessionStorage through OAuth flow. URL param `dark=1` overrides stored preference.

## Environment

- **Must run on** `http://127.0.0.1:3333` (strictPort) to match OAuth redirect URI
- **Required env vars** in `.env`: `VITE_PROXY_URL`, `VITE_EEN_CLIENT_ID`, `TEST_USER`, `TEST_PASSWORD`
- Production build uses base path `/een-observation-app/` for GitHub Pages

## Pre-commit Hook

Husky pre-commit hook auto-increments patch version (`npm version patch`) when `src/`, `public/`, or `index.html` files are staged. This modifies `package.json` and stages it automatically.

## Key Dependencies

- `een-api-toolkit` — All EEN API calls (auth, cameras, events, alerts, media, jobs, layouts)
- `@een/live-video-web-sdk` — Live HD video streaming
- `hls.js` — HLS recorded video playback
- `pinia` — State management (auth store from toolkit + app state)
- `tailwindcss` v4 — Styling with PostCSS plugin (`@tailwindcss/postcss`)
