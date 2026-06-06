# Project-specific review guidance

This repo is a **Vue 3 + TypeScript single-page app** for Eagle Eye Networks camera
monitoring. All EEN API access goes through the `een-api-toolkit` package; live video
uses `@een/live-video-web-sdk` and recorded playback uses `hls.js`. State is managed
with Pinia. Styling is Tailwind CSS v4.

When reviewing, pay particular attention to the areas that are easy to get wrong here:

- **OAuth / routing.** The router guard in `src/router/index.ts` must check for the OAuth
  callback (`code`/`state` query params) **before** the auth check. Flag any reordering.
- **URL state.** All view state is encoded in URL params and persisted to `sessionStorage`
  (keys `een_url_*`) so it survives the OAuth redirect. The param set lives in one source
  of truth: `src/utils/urlState.ts` (`URL_PARAMS` table). New params should be added there,
  not hand-enumerated in `router/index.ts`, `Callback.vue`, or `Home.vue`.
- **Resource cleanup (memory leaks).** Components and composables create timers
  (`setInterval`/`setTimeout`), SSE subscriptions, `document` event listeners, fullscreen
  listeners, and object URLs. Verify every one is torn down in `onUnmounted` / on teardown.
- **Composable singletons.** Composables in `src/composables/` (e.g. `useImageCache`,
  `useDarkMode`, `useMute`, `useEventAge`, `useSseNotification`) are module-level singletons
  with shared state. Watch for accidental per-call state or unbounded growth (the image cache
  is an LRU — keep it bounded).
- **Reactivity / performance.** Event and alert lists can hold hundreds of items and
  re-render on a shared 1-second "now" tick. Flag expensive per-row work (regex, date
  parsing, array rebuilds) done in templates or computeds on the hot path.
- **Secrets.** Never hard-code or log `VITE_EEN_CLIENT_ID`, `VITE_PROXY_URL`, tokens, or
  test credentials. They come from env vars / GitHub secrets only.
- **Dark mode.** Dark styling is scoped via the `dark` class on `<html>`; new UI should
  carry matching `dark:` Tailwind variants.

## Tests

- Unit tests: `npm run test:unit` (Vitest, colocated `src/**/*.test.ts`).
- E2E tests: `npm test` (Playwright; performs real OAuth login). Pure utilities should get
  unit tests; behavioral changes should keep the E2E suite green.

Keep feedback concise and actionable; prefer pointing at specific files and lines.
