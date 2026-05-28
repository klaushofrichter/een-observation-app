export const LABS_PRODUCT_SLUG = 'observation-app'

export type AuthMode = 'labs' | 'dev'

export interface LabsConfig {
  mode: AuthMode
  labsBase: string
  devToken: string | null
  devBaseUrl: string | null
}

export function getLabsConfig(): LabsConfig {
  const rawMode = import.meta.env.VITE_AUTH_MODE
  return {
    mode: rawMode === 'dev' ? 'dev' : 'labs',
    labsBase: import.meta.env.VITE_LABS_BASE || 'https://labs.eagleeyenetworks.com',
    devToken: import.meta.env.VITE_DEV_EEN_TOKEN || null,
    devBaseUrl: import.meta.env.VITE_DEV_EEN_BASE_URL || null
  }
}
