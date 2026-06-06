# Design: Single Source of Truth for URL-Param Persistence

**Date:** 2026-06-06
**Issue:** [#69](https://github.com/klaushofrichter/een-observation-app/issues/69) (partial — core trio); fixes [#74](https://github.com/klaushofrichter/een-observation-app/issues/74)
**Scope:** Core OAuth-flow trio only (router save, clear util, Callback restore). Home.vue consumption is explicitly deferred.

## Problem

The 12 URL params (`id`, `selected`, `events`, `ed`, `ad`, `er`, `ar`, `live`, `filter`, `dark`, `mute`, `full`) are hand-enumerated independently across five sites. They persist to `sessionStorage` (keys `een_url_*`) before the OAuth redirect and are restored after login, so view state survives the login round-trip.

This duplication has already drifted twice:

- **`mute` is missing from the Callback restore list** → bug #74. The router saves `een_url_mute` and Home reads it, but `Callback.vue` never restores it into the post-login query, unlike `dark`/`full`.
- **`id` uses a non-conventional storage key** (`een_url_camera_ids`, not `een_url_id`) — an exception every site must remember.

Adding or changing a param today requires editing five files in sync; missing one produces a silent bug no type-checker catches (exactly how #74 happened).

## Goal

Introduce one source of truth for the param set and route the OAuth-flow persistence trio through it. This removes the drift class where it has actually caused bugs, fixes #74 structurally, and is behavior-preserving.

Non-goal: restructuring Home.vue's reactive state. Home keeps reading the `een_url_*` keys directly; it can adopt the table in a follow-up pass (#69 remains open with that noted).

## Design

### New module — `src/utils/urlState.ts`

A descriptor table plus three helpers. This is the only place that enumerates the param set.

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

The `presence` flag preserves today's exact save semantics: most params save on a truthy check (`if (to.query.X)`); `dark`/`mute`/`full` save on `!== undefined`. The explicit per-param `storageKey` handles the `id → een_url_camera_ids` exception without a derivation rule.

### Call-site changes

**`src/router/index.ts`** — the ~90-line per-param save ladder (lines 79–169) becomes:

```ts
if (to.path === '/') {
  saveQueryToSession(to.query)
}
```

The separate "empty query → `clearUrlSessionStorage()`" branch is removed: saving an empty query already removes all 12 keys, so it is behavior-identical. The OAuth-callback-first guard at the top of `beforeEach` is unchanged.

**`src/utils/clearUrlSessionStorage.ts`** — deleted. `clearUrlSessionStorage` now lives in `urlState.ts`. The router import is updated. (Any other importer, if found, is repointed; expected to be router-only.)

**`src/views/Callback.vue`** — the `storedX` reads + 11-term `||` + per-key query assembly (lines 36–65) become:

```ts
const restored = restoreQueryFromSession()
router.push(restored ? { path: '/', query: restored } : '/')
```

This fixes #74: `mute` is restored identically to every other param.

### Out of scope

`src/views/Home.vue` (`initialX` getters + `updateUrl` diff) and `src/App.vue` (dark/mute URL-override application) keep reading the `een_url_*` keys directly. The storage-key contract is unchanged, so they continue to work untouched.

## Behavior preservation

- Save semantics per param are preserved via the `presence` flag.
- Storage keys are byte-for-byte identical, so Home/App consumers are unaffected.
- Empty-query clear behavior is preserved (now implicit in `saveQueryToSession`).
- Callback restore gains `mute` (the intended fix); all other params behave as before.

## Testing

- **Existing coverage:** `tests/url-state.spec.ts` and the auth spec's "restore camera selection from URL after logout and login" exercise the save/restore round-trip — primary regression signal.
- **New:** an E2E regression test for #74 — a `mute` URL param survives the OAuth login round-trip.
- Verification is via the Playwright suite + `vue-tsc --noEmit` (no Vitest in this project).

## Follow-ups

- #69 remains open for migrating Home.vue's `initialX` getters and `updateUrl` to consume `URL_PARAMS`.
- Once Home consumes the table, `App.vue`'s per-feature URL-override application (#69 altitude finding) could be generalized too.
