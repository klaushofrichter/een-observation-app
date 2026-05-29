import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { initEenToolkit } from 'een-api-toolkit'
import App from './App.vue'
import router from './router'
import './assets/main.css'
import { bootstrapAuth } from './labs/labsAuth'

async function start(): Promise<void> {
  const app = createApp(App)

  // Pinia must be installed before initEenToolkit and before useAuthStore.
  app.use(createPinia())

  // Labs-only: no proxy/clientId. The token is injected by bootstrapAuth().
  initEenToolkit({
    storageStrategy: 'localStorage',
    debug: false
  })

  let mounted: boolean
  try {
    mounted = await bootstrapAuth()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    document.body.innerHTML =
      `<div style="font-family:sans-serif;padding:2rem;color:#b91c1c">` +
      `Authentication failed to initialize: ${message}</div>`
    return
  }

  if (!mounted) return // Labs SDK redirected the page; do not mount.

  app.use(router)
  app.mount('#app')
}

void start()
