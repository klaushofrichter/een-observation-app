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
