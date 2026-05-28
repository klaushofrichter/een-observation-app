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

import { bootstrapAuth, refreshLabsAuth, labsLogout } from './labsAuth'

// ---------------------------------------------------------------------------
// bootstrapAuth
// ---------------------------------------------------------------------------
describe('bootstrapAuth', () => {
  beforeEach(() => {
    setToken.mockClear(); setBaseUrl.mockClear()
    ready.mockClear(); vendorRequireAuth.mockClear(); logout.mockClear()
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

// ---------------------------------------------------------------------------
// refreshLabsAuth
// ---------------------------------------------------------------------------
describe('refreshLabsAuth', () => {
  beforeEach(() => {
    setToken.mockClear(); setBaseUrl.mockClear()
    ready.mockClear(); vendorRequireAuth.mockClear(); logout.mockClear()
    sessionStorage.clear()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    sessionStorage.clear()
  })

  it('dev mode returns immediately without calling vendorRequireAuth', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'dev')
    vi.stubEnv('VITE_DEV_EEN_TOKEN', 'tok123')
    vi.stubEnv('VITE_DEV_EEN_BASE_URL', 'https://api.c021.eagleeyenetworks.com')
    await refreshLabsAuth()
    expect(vendorRequireAuth).not.toHaveBeenCalled()
  })

  it('labs success: injects vendor, schedules refresh, clears guard key', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'labs')
    // Seed a guard count to confirm it is cleared on success
    sessionStorage.setItem('labs_refresh_reloads', '1')
    const expiresAt = Math.floor(Date.now() / 1000) + 3600
    vendorRequireAuth.mockResolvedValue({
      een: {
        accessToken: 'new-tok',
        baseUrl: 'https://api.c021.eagleeyenetworks.com',
        expiresAt
      }
    })
    await refreshLabsAuth()
    expect(setBaseUrl).toHaveBeenCalledWith('https://api.c021.eagleeyenetworks.com')
    expect(setToken).toHaveBeenCalledWith('new-tok', expect.any(Number))
    expect(sessionStorage.getItem('labs_refresh_reloads')).toBeNull()
  })

  it('labs null vendors → reloadOrRedirect calls reload (count < MAX_RELOADS)', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'labs')
    const mockReload = vi.fn()
    vi.stubGlobal('location', { reload: mockReload, href: '' })
    sessionStorage.removeItem('labs_refresh_reloads')
    vendorRequireAuth.mockResolvedValue(null)
    await refreshLabsAuth()
    expect(mockReload).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem('labs_refresh_reloads')).toBe('1')
  })

  it('labs null vendors → reloadOrRedirect redirects when count >= MAX_RELOADS', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'labs')
    const mockLocation = { reload: vi.fn(), href: '' }
    vi.stubGlobal('location', mockLocation)
    // Seed count at MAX_RELOADS (2)
    sessionStorage.setItem('labs_refresh_reloads', '2')
    vendorRequireAuth.mockResolvedValue(null)
    await refreshLabsAuth()
    expect(mockLocation.reload).not.toHaveBeenCalled()
    expect(mockLocation.href).toMatch(/\/product\/observation-app$/)
    // Guard key should be cleared after redirect
    expect(sessionStorage.getItem('labs_refresh_reloads')).toBeNull()
  })

  it('labs throw → reloadOrRedirect calls reload (count < MAX_RELOADS)', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'labs')
    const mockReload = vi.fn()
    vi.stubGlobal('location', { reload: mockReload, href: '' })
    sessionStorage.removeItem('labs_refresh_reloads')
    vendorRequireAuth.mockRejectedValue(new Error('network failure'))
    await refreshLabsAuth()
    expect(mockReload).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// labsLogout
// ---------------------------------------------------------------------------
describe('labsLogout', () => {
  beforeEach(() => {
    setToken.mockClear(); setBaseUrl.mockClear()
    ready.mockClear(); vendorRequireAuth.mockClear(); logout.mockClear()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('calls sdk.logout() and redirects to the product page', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'labs')
    const mockLocation = { reload: vi.fn(), href: '' }
    vi.stubGlobal('location', mockLocation)
    await labsLogout()
    expect(logout).toHaveBeenCalledOnce()
    expect(mockLocation.href).toMatch(/\/product\/observation-app$/)
  })

  it('still redirects even when sdk.logout() throws', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'labs')
    const mockLocation = { reload: vi.fn(), href: '' }
    vi.stubGlobal('location', mockLocation)
    logout.mockImplementationOnce(() => { throw new Error('sdk gone') })
    await labsLogout()
    expect(mockLocation.href).toMatch(/\/product\/observation-app$/)
  })
})
