import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { initEenToolkit } from 'een-api-toolkit'
import App from './App.vue'
import router from './router'
import './assets/main.css'

const app = createApp(App)

// Install Pinia FIRST (required before initEenToolkit)
app.use(createPinia())

// Initialize EEN API Toolkit
// Use current origin for redirect URI to support both local dev and GitHub Pages
const redirectUri = import.meta.env.DEV
  ? 'http://127.0.0.1:3333'
  : (window.location.origin + import.meta.env.BASE_URL).replace(/\/$/, '')

console.log('[EEN Init] DEV mode:', import.meta.env.DEV)
console.log('[EEN Init] BASE_URL:', import.meta.env.BASE_URL)
console.log('[EEN Init] origin:', window.location.origin)
console.log('[EEN Init] redirectUri:', redirectUri)

initEenToolkit({
  proxyUrl: import.meta.env.VITE_PROXY_URL,
  clientId: import.meta.env.VITE_EEN_CLIENT_ID,
  redirectUri,
  storageStrategy: 'localStorage',
  debug: true
})

// Install router
app.use(router)

app.mount('#app')
