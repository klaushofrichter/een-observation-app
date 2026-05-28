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
