import { getLabsConfig } from './config'

export interface EenVendor {
  accessToken: string
  baseUrl: string | null
  expiresAt: number
  requestHeaders?: Record<string, string>
}

export interface LabsCaller {
  kind: 'labs' | 'een'
  eenAccountId?: string
  eenUserId?: string
  labsUserId?: string | null
  isAdmin?: boolean
}

export interface LabsReadyResult {
  caller: LabsCaller
  vendors: Record<string, EenVendor>
  token: string
}

export interface LabsAuthApi {
  ready(opts: {
    product: string
    vendors?: string[]
    overlay?: boolean
    labsBase?: string
  }): Promise<LabsReadyResult | null>
  vendorRequireAuth(
    slugs: string[],
    opts: { product: string; labsBase?: string }
  ): Promise<Record<string, EenVendor> | null>
  logout(): void
}

declare global {
  interface Window {
    LabsAuth?: LabsAuthApi
  }
}

let loadPromise: Promise<LabsAuthApi> | null = null

/** Test-only: reset the memoized load promise between cases. */
export function __resetLoadPromiseForTests(): void {
  loadPromise = null
}

export function loadLabsSdk(): Promise<LabsAuthApi> {
  if (window.LabsAuth) return Promise.resolve(window.LabsAuth)
  if (loadPromise) return loadPromise

  const { labsBase } = getLabsConfig()
  loadPromise = new Promise<LabsAuthApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `${labsBase}/sdk/labs-auth.js`
    script.async = true
    script.onload = () => {
      if (window.LabsAuth) resolve(window.LabsAuth)
      else reject(new Error('labs-auth.js loaded but window.LabsAuth is undefined'))
    }
    script.onerror = () => {
      loadPromise = null
      reject(new Error(`Failed to load labs-auth.js from ${script.src}`))
    }
    document.head.appendChild(script)
  })
  return loadPromise
}
