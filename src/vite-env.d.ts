/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface ImportMetaEnv {
  readonly VITE_AUTH_MODE?: string
  readonly VITE_LABS_BASE?: string
  readonly VITE_DEV_EEN_TOKEN?: string
  readonly VITE_DEV_EEN_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
