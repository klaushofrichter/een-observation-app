# URL-Param Source of Truth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-param URL-state ladders in the OAuth-flow trio (router save, clear util, Callback restore) with one `URL_PARAMS` descriptor table and three helper functions, eliminating drift and the `mute` restore inconsistency (#74).

**Architecture:** A new pure module `src/utils/urlState.ts` owns the param set as a descriptor table (`{query, storageKey, presence}`) plus `saveQueryToSession`, `clearUrlSessionStorage`, and `restoreQueryFromSession`. The router guard, the deleted clear-util's importers, and `Callback.vue` call these helpers. Storage keys are byte-identical to today, so `Home.vue` / `App.vue` consumers are untouched. The pure functions are unit-tested with a newly-added minimal Vitest setup; the existing Playwright E2E suite is the integration safety net.

**Tech Stack:** Vue 3, TypeScript, Vue Router 4, Vite 7, Vitest (new), Playwright (existing).

---

## Context for the implementer

- This is a **behavior-preserving refactor** of code that already works and is covered by E2E tests. The discipline is: existing E2E stays green, new pure functions get red-green unit tests.
- **Critical gotcha:** the `id` URL param maps to sessionStorage key `een_url_camera_ids` — NOT `een_url_id`. The descriptor table encodes this explicitly. Do not "simplify" it to a derived `een_url_<query>` scheme.
- **Two save semantics exist and must be preserved:** most params persist on a truthy check (`if (to.query.X)`); `dark`, `mute`, `full` persist on `!== undefined` (so an explicit `dark=0` is stored). The `presence` field (`'truthy' | 'defined'`) captures this.
- **Why Vitest tests live in `src/`:** Playwright's `testDir: './tests'` uses a default `testMatch` that also grabs `*.test.ts`. Colocating unit tests in `src/` and scoping Vitest's `include` to `src/**/*.test.ts` keeps the two runners from fighting over each other's files.
- The repo's Husky pre-commit hook auto-bumps the patch version when `src/`, `public/`, or `index.html` are staged, and re-stages `package.json`. This is expected; let it happen.

## File structure

- **Create** `src/utils/urlState.ts` — the descriptor table + `saveQueryToSession` / `clearUrlSessionStorage` / `restoreQueryFromSession`. Single source of truth for the URL-param set.
- **Create** `src/utils/urlState.test.ts` — Vitest unit tests for the three functions (colocated).
- **Create** `vitest.config.ts` — standalone Vitest config (node env, `@` alias, `src/**/*.test.ts` include).
- **Modify** `package.json` — add `vitest` devDependency + `test:unit` script.
- **Modify** `src/router/index.ts` — replace the ~90-line save ladder with `saveQueryToSession(to.query)`; import from `urlState`.
- **Delete** `src/utils/clearUrlSessionStorage.ts` — moved into `urlState.ts`.
- **Modify** `src/views/Callback.vue` — replace the `storedX` ladder with `restoreQueryFromSession()`.

---

## Task 1: Add Vitest infrastructure

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install Vitest as a dev dependency**

Run:
```bash
npm install -D vitest@^3
```
Expected: `package.json` gains `vitest` under `devDependencies`; install completes without error.

- [ ] **Step 2: Add the `test:unit` script**

In `package.json`, inside `"scripts"`, add this line (leave the existing `"test": "playwright test"` untouched):
```json
"test:unit": "vitest run",
```

- [ ] **Step 3: Create `vitest.config.ts`**

Create `vitest.config.ts` with exactly:
```ts
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
})
```

- [ ] **Step 4: Verify Vitest runs (with no tests yet)**

Run: `npm run test:unit`
Expected: Vitest starts and reports "No test files found" (exit code may be non-zero for "no tests" — that is fine at this step; it confirms Vitest is wired up). Proceed regardless.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "Add minimal Vitest setup for unit tests"
```

---

## Task 2: Create the urlState module (TDD)

**Files:**
- Create: `src/utils/urlState.test.ts`
- Create: `src/utils/urlState.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/urlState.test.ts` with exactly:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  URL_PARAMS,
  saveQueryToSession,
  clearUrlSessionStorage,
  restoreQueryFromSession
} from './urlState'

// Minimal in-memory sessionStorage mock (no jsdom dependency)
class MemoryStorage {
  private store = new Map<string, string>()
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value))
  }
  removeItem(key: string): void {
    this.store.delete(key)
  }
  clear(): void {
    this.store.clear()
  }
}

beforeEach(() => {
  vi.stubGlobal('sessionStorage', new MemoryStorage())
})

describe('URL_PARAMS table', () => {
  it('maps id to the een_url_camera_ids storage key', () => {
    const id = URL_PARAMS.find(p => p.query === 'id')
    expect(id?.storageKey).toBe('een_url_camera_ids')
  })

  it('includes mute', () => {
    expect(URL_PARAMS.some(p => p.query === 'mute')).toBe(true)
  })

  it('uses the defined presence rule for dark, mute and full', () => {
    for (const q of ['dark', 'mute', 'full']) {
      expect(URL_PARAMS.find(p => p.query === q)?.presence).toBe('defined')
    }
  })
})

describe('saveQueryToSession', () => {
  it('stores truthy params under their storage key', () => {
    saveQueryToSession({ id: 'cam1,cam2', selected: 'cam1' })
    expect(sessionStorage.getItem('een_url_camera_ids')).toBe('cam1,cam2')
    expect(sessionStorage.getItem('een_url_selected')).toBe('cam1')
  })

  it('removes a truthy param key when the value is absent', () => {
    sessionStorage.setItem('een_url_selected', 'stale')
    saveQueryToSession({ id: 'cam1' })
    expect(sessionStorage.getItem('een_url_selected')).toBeNull()
  })

  it('stores defined params even when the value is "0"', () => {
    saveQueryToSession({ dark: '0', mute: '0', full: '0' })
    expect(sessionStorage.getItem('een_url_dark')).toBe('0')
    expect(sessionStorage.getItem('een_url_mute')).toBe('0')
    expect(sessionStorage.getItem('een_url_full')).toBe('0')
  })

  it('clears all keys when given an empty query', () => {
    sessionStorage.setItem('een_url_camera_ids', 'cam1')
    sessionStorage.setItem('een_url_dark', '1')
    saveQueryToSession({})
    expect(sessionStorage.getItem('een_url_camera_ids')).toBeNull()
    expect(sessionStorage.getItem('een_url_dark')).toBeNull()
  })
})

describe('clearUrlSessionStorage', () => {
  it('removes every URL-param key', () => {
    for (const p of URL_PARAMS) sessionStorage.setItem(p.storageKey, 'x')
    clearUrlSessionStorage()
    for (const p of URL_PARAMS) {
      expect(sessionStorage.getItem(p.storageKey)).toBeNull()
    }
  })
})

describe('restoreQueryFromSession', () => {
  it('returns null when nothing is stored', () => {
    expect(restoreQueryFromSession()).toBeNull()
  })

  it('round-trips saved params back into a query object', () => {
    saveQueryToSession({ id: 'cam1', selected: 'cam1', dark: '1', mute: '1' })
    const restored = restoreQueryFromSession()
    expect(restored).toMatchObject({
      id: 'cam1',
      selected: 'cam1',
      dark: '1',
      mute: '1'
    })
  })

  it('restores mute (regression guard for #74)', () => {
    sessionStorage.setItem('een_url_mute', '1')
    expect(restoreQueryFromSession()?.mute).toBe('1')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL — Vitest cannot resolve `./urlState` (module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/utils/urlState.ts` with exactly:
```ts
import type { LocationQuery } from 'vue-router'

export interface UrlParamDescriptor {
  /** URL query-string key, e.g. 'id' */
  query: string
  /** sessionStorage key, e.g. 'een_url_camera_ids' */
  storageKey: string
  /**
   * Presence rule for saving from the URL:
   * - 'truthy'  : store only when the value is truthy (most params)
   * - 'defined' : store whenever present, including '0'/'' (dark, mute, full)
   */
  presence: 'truthy' | 'defined'
}

// Single source of truth for the URL params that persist through the OAuth redirect.
export const URL_PARAMS: UrlParamDescriptor[] = [
  { query: 'id',       storageKey: 'een_url_camera_ids', presence: 'truthy'  },
  { query: 'selected', storageKey: 'een_url_selected',   presence: 'truthy'  },
  { query: 'events',   storageKey: 'een_url_events',     presence: 'truthy'  },
  { query: 'ed',       storageKey: 'een_url_ed',         presence: 'truthy'  },
  { query: 'ad',       storageKey: 'een_url_ad',         presence: 'truthy'  },
  { query: 'er',       storageKey: 'een_url_er',         presence: 'truthy'  },
  { query: 'ar',       storageKey: 'een_url_ar',         presence: 'truthy'  },
  { query: 'live',     storageKey: 'een_url_live',       presence: 'truthy'  },
  { query: 'filter',   storageKey: 'een_url_filter',     presence: 'truthy'  },
  { query: 'dark',     storageKey: 'een_url_dark',       presence: 'defined' },
  { query: 'mute',     storageKey: 'een_url_mute',       presence: 'defined' },
  { query: 'full',     storageKey: 'een_url_full',       presence: 'defined' },
]

/** Persist URL query params to sessionStorage so they survive the OAuth redirect. */
export function saveQueryToSession(query: LocationQuery): void {
  for (const p of URL_PARAMS) {
    const value = query[p.query]
    const present = p.presence === 'defined' ? value !== undefined : Boolean(value)
    if (present) {
      sessionStorage.setItem(p.storageKey, value as string)
    } else {
      sessionStorage.removeItem(p.storageKey)
    }
  }
}

/** Remove all URL-param sessionStorage keys. */
export function clearUrlSessionStorage(): void {
  for (const p of URL_PARAMS) {
    sessionStorage.removeItem(p.storageKey)
  }
}

/** Rebuild a query object from params saved before the OAuth redirect; null if none. */
export function restoreQueryFromSession(): Record<string, string> | null {
  const query: Record<string, string> = {}
  for (const p of URL_PARAMS) {
    const stored = sessionStorage.getItem(p.storageKey)
    if (stored) query[p.query] = stored
  }
  return Object.keys(query).length > 0 ? query : null
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit`
Expected: PASS — all tests in `src/utils/urlState.test.ts` green.

- [ ] **Step 5: Type-check**

Run: `npx vue-tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/utils/urlState.ts src/utils/urlState.test.ts
git commit -m "Add urlState module with URL_PARAMS table and helpers"
```

---

## Task 3: Wire the router guard to saveQueryToSession

**Files:**
- Modify: `src/router/index.ts`

- [ ] **Step 1: Replace the import**

In `src/router/index.ts`, replace this line:
```ts
import { clearUrlSessionStorage } from '@/utils/clearUrlSessionStorage'
```
with:
```ts
import { saveQueryToSession } from '@/utils/urlState'
```

- [ ] **Step 2: Replace the save ladder**

In the `router.beforeEach((to, _from, next) => { ... })` guard, replace the entire block that starts with the comment `// Handle URL parameters` and the `if (to.path === '/') { ... }` body (the part containing `clearUrlSessionStorage()` and all the per-param `if (to.query.X) sessionStorage.setItem(...) else sessionStorage.removeItem(...)` statements — through the closing brace of that `if (to.path === '/')` block) with exactly:
```ts
  // Handle URL parameters: persist them to sessionStorage so they survive the
  // OAuth redirect but not across sessions. Saving an empty query removes all keys.
  if (to.path === '/') {
    saveQueryToSession(to.query)
  }
```

Leave everything else in the guard unchanged: the OAuth-callback-first check at the top (`if (to.path === '/' && to.query.code && to.query.state)`) and the auth check at the bottom (`if (to.meta.requiresAuth && !isAuthenticated())`).

- [ ] **Step 3: Type-check**

Run: `npx vue-tsc --noEmit`
Expected: no errors (no remaining references to the old `clearUrlSessionStorage` import in this file).

- [ ] **Step 4: Commit**

```bash
git add src/router/index.ts
git commit -m "Route URL-param saving through saveQueryToSession"
```

---

## Task 4: Wire Callback.vue to restoreQueryFromSession (fixes #74)

**Files:**
- Modify: `src/views/Callback.vue`

- [ ] **Step 1: Add the import**

In `src/views/Callback.vue`, add to the `<script setup>` imports (after the existing `import { handleAuthCallback } from 'een-api-toolkit'` line):
```ts
import { restoreQueryFromSession } from '@/utils/urlState'
```

- [ ] **Step 2: Replace the restore ladder**

Replace this block (the comment, all `const storedX = sessionStorage.getItem(...)` lines, the big `if (storedCameraIds || ...) { ... } else { router.push('/') }`):
```ts
  // Restore URL parameters from sessionStorage if they were set before OAuth redirect
  const storedCameraIds = sessionStorage.getItem('een_url_camera_ids')
  const storedSelected = sessionStorage.getItem('een_url_selected')
  const storedEvents = sessionStorage.getItem('een_url_events')
  const storedEd = sessionStorage.getItem('een_url_ed')
  const storedAd = sessionStorage.getItem('een_url_ad')
  const storedEr = sessionStorage.getItem('een_url_er')
  const storedAr = sessionStorage.getItem('een_url_ar')
  const storedLive = sessionStorage.getItem('een_url_live')
  const storedFilter = sessionStorage.getItem('een_url_filter')
  const storedDark = sessionStorage.getItem('een_url_dark')
  const storedFull = sessionStorage.getItem('een_url_full')

  if (storedCameraIds || storedSelected || storedEvents || storedEd || storedAd || storedEr || storedAr || storedLive || storedFilter || storedDark || storedFull) {
    const query: Record<string, string> = {}
    if (storedCameraIds) query.id = storedCameraIds
    if (storedSelected) query.selected = storedSelected
    if (storedEvents) query.events = storedEvents
    if (storedEd) query.ed = storedEd
    if (storedAd) query.ad = storedAd
    if (storedEr) query.er = storedEr
    if (storedAr) query.ar = storedAr
    if (storedLive) query.live = storedLive
    if (storedFilter) query.filter = storedFilter
    if (storedDark) query.dark = storedDark
    if (storedFull) query.full = storedFull
    router.push({ path: '/', query })
  } else {
    router.push('/')
  }
```
with exactly:
```ts
  // Restore URL parameters saved before the OAuth redirect (includes mute, fixing #74)
  const restoredQuery = restoreQueryFromSession()
  router.push(restoredQuery ? { path: '/', query: restoredQuery } : '/')
```

- [ ] **Step 3: Type-check**

Run: `npx vue-tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/views/Callback.vue
git commit -m "Restore URL params via restoreQueryFromSession (fixes #74)"
```

---

## Task 5: Delete the obsolete clearUrlSessionStorage util

**Files:**
- Delete: `src/utils/clearUrlSessionStorage.ts`

- [ ] **Step 1: Confirm there are no remaining importers**

Run: `grep -rn "clearUrlSessionStorage" src/`
Expected: matches ONLY in `src/utils/urlState.ts` (the function definition + JSDoc) and `src/utils/urlState.test.ts`. There must be NO match referencing `@/utils/clearUrlSessionStorage` or the old file path. If any other file imports from `@/utils/clearUrlSessionStorage`, repoint that import to `import { clearUrlSessionStorage } from '@/utils/urlState'` before deleting.

- [ ] **Step 2: Delete the file**

Run: `git rm src/utils/clearUrlSessionStorage.ts`
Expected: file staged for deletion.

- [ ] **Step 3: Type-check and unit tests**

Run: `npx vue-tsc --noEmit && npm run test:unit`
Expected: no type errors; all unit tests pass.

- [ ] **Step 4: Commit**

```bash
git commit -m "Delete obsolete clearUrlSessionStorage util (moved to urlState)"
```

---

## Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Build (type-check + production build)**

Run: `npm run build`
Expected: `vue-tsc --noEmit` passes and Vite build completes with no errors.

- [ ] **Step 2: Unit tests**

Run: `npm run test:unit`
Expected: all `src/utils/urlState.test.ts` tests pass.

- [ ] **Step 3: Full E2E suite (integration safety net)**

Run: `npx playwright test`
Expected: all 51 tests pass — in particular `tests/url-state.spec.ts` ("should restore camera and event type selection from URL") and `tests/auth.spec.ts` must be green, confirming the save → redirect → restore round-trip is behavior-preserved.

- [ ] **Step 4: Sanity-check the diff**

Run: `git diff develop --stat`
Expected: net line reduction in `src/router/index.ts` and `src/views/Callback.vue`; new `src/utils/urlState.ts` + test; `src/utils/clearUrlSessionStorage.ts` deleted; `vitest.config.ts`, `package.json`, `package-lock.json` added/changed.

---

## Self-review notes (author)

- **Spec coverage:** urlState module + table (Task 2) ✓; router save (Task 3) ✓; Callback restore / #74 (Task 4) ✓; clear util move/delete (Task 5) ✓; Vitest infra + unit tests incl. mute guard (Tasks 1–2) ✓; behavior-preservation verified by E2E (Task 6) ✓. Home.vue/App.vue explicitly out of scope per spec — no task, correct.
- **Type consistency:** function names `saveQueryToSession` / `clearUrlSessionStorage` / `restoreQueryFromSession` and `URL_PARAMS` / `UrlParamDescriptor` are used identically across tasks. `restoreQueryFromSession` returns `Record<string,string> | null`; Callback handles the null branch.
- **No placeholders:** every code step shows complete code; every run step shows the expected result.
