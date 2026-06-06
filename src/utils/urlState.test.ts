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
