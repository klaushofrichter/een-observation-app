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
