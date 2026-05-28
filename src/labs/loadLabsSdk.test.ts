import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadLabsSdk, __resetLoadPromiseForTests } from './loadLabsSdk'

describe('loadLabsSdk', () => {
  beforeEach(() => {
    __resetLoadPromiseForTests()
    document.head.innerHTML = ''
    delete window.LabsAuth
    vi.stubEnv('VITE_LABS_BASE', 'https://labs.example.com')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('returns existing window.LabsAuth without injecting a script', async () => {
    const fake = { ready: vi.fn(), vendorRequireAuth: vi.fn(), logout: vi.fn() }
    window.LabsAuth = fake
    const api = await loadLabsSdk()
    expect(api).toBe(fake)
    expect(document.head.querySelector('script')).toBeNull()
  })

  it('injects the script from VITE_LABS_BASE and resolves on load', async () => {
    const promise = loadLabsSdk()
    const script = document.head.querySelector('script')!
    expect(script.src).toBe('https://labs.example.com/sdk/labs-auth.js')
    const fake = { ready: vi.fn(), vendorRequireAuth: vi.fn(), logout: vi.fn() }
    window.LabsAuth = fake
    script.onload!(new Event('load'))
    await expect(promise).resolves.toBe(fake)
  })

  it('rejects when the script fails to load', async () => {
    const promise = loadLabsSdk()
    const script = document.head.querySelector('script')!
    script.onerror!(new Event('error'))
    await expect(promise).rejects.toThrow(/Failed to load/)
  })
})
