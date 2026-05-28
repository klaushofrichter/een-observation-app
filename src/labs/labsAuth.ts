import { useAuthStore } from 'een-api-toolkit'
import { getLabsConfig, LABS_PRODUCT_SLUG } from './config'
import { loadLabsSdk, type EenVendor } from './loadLabsSdk'

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function injectEenVendor(een: EenVendor): void {
  const authStore = useAuthStore()
  if (!een.baseUrl) throw new Error('EEN vendor token missing baseUrl')
  const accepted = authStore.setBaseUrl(een.baseUrl)
  if (!accepted) throw new Error(`Rejected EEN baseUrl: ${een.baseUrl}`)
  const expiresIn = Math.max(0, een.expiresAt - nowSeconds())
  authStore.setToken(een.accessToken, expiresIn)
}

// --- Fix 1: Reload-loop guard ---
const RELOAD_GUARD_KEY = 'labs_refresh_reloads'
const MAX_RELOADS = 2

function reloadOrRedirect(): void {
  const count = parseInt(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? '0', 10)
  if (count >= MAX_RELOADS) {
    sessionStorage.removeItem(RELOAD_GUARD_KEY)
    window.location.href = `${getLabsConfig().labsBase}/product/${LABS_PRODUCT_SLUG}`
  } else {
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(count + 1))
    window.location.reload()
  }
}

// --- Fix 2: Cancellable refresh timer ---
let refreshTimer: ReturnType<typeof setTimeout> | null = null

function cancelRefresh(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
}

function scheduleRefresh(expiresAt: number): void {
  cancelRefresh()
  const ms = Math.max(5000, (expiresAt - nowSeconds() - 60) * 1000)
  refreshTimer = setTimeout(() => {
    void refreshLabsAuth()
  }, ms)
}

/**
 * Establish auth before the app mounts.
 * @returns true if the app should mount; false if the SDK redirected the page.
 */
export async function bootstrapAuth(): Promise<boolean> {
  const cfg = getLabsConfig()

  if (cfg.mode === 'dev') {
    if (!cfg.devToken || !cfg.devBaseUrl) {
      throw new Error(
        'Dev auth mode requires VITE_DEV_EEN_TOKEN and VITE_DEV_EEN_BASE_URL'
      )
    }
    injectEenVendor({
      accessToken: cfg.devToken,
      baseUrl: cfg.devBaseUrl,
      expiresAt: nowSeconds() + 86400
    })
    return true
  }

  const sdk = await loadLabsSdk()
  const res = await sdk.ready({
    product: LABS_PRODUCT_SLUG,
    vendors: ['een'],
    labsBase: cfg.labsBase
  })
  if (!res) return false // SDK redirected the page

  const een = res.vendors.een
  if (!een) throw new Error('Labs did not return an EEN vendor token')
  injectEenVendor(een)
  scheduleRefresh(een.expiresAt)
  return true
}

export async function refreshLabsAuth(): Promise<void> {
  const cfg = getLabsConfig()
  if (cfg.mode === 'dev') return
  try {
    const sdk = await loadLabsSdk()
    const vendors = await sdk.vendorRequireAuth(['een'], {
      product: LABS_PRODUCT_SLUG,
      labsBase: cfg.labsBase
    })
    if (!vendors || !vendors.een) {
      reloadOrRedirect()
      return
    }
    injectEenVendor(vendors.een)
    scheduleRefresh(vendors.een.expiresAt)
    // Clear the guard on a successful refresh so transient failures don't
    // accumulate toward the cap.
    sessionStorage.removeItem(RELOAD_GUARD_KEY)
  } catch {
    reloadOrRedirect()
  }
}

export async function labsLogout(): Promise<void> {
  const cfg = getLabsConfig()
  cancelRefresh()
  try {
    const sdk = await loadLabsSdk()
    sdk.logout()
  } catch {
    // ignore — still redirect
  }
  window.location.href = `${cfg.labsBase}/product/${LABS_PRODUCT_SLUG}`
}
