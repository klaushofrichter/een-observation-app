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
    const el = document.createElement('div')
    el.style.fontFamily = 'sans-serif'
    el.style.padding = '2rem'
    el.style.color = '#b91c1c'
    el.textContent = `Authentication failed to initialize: ${message}`
    document.body.replaceChildren(el)
    return
  }

  if (!mounted) return // Labs SDK redirected the page; do not mount.

  app.use(router)
  app.mount('#app')
}

void start()
