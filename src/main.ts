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

initEenToolkit({
  proxyUrl: import.meta.env.VITE_PROXY_URL,
  clientId: import.meta.env.VITE_EEN_CLIENT_ID,
  redirectUri,
  storageStrategy: 'localStorage',
  debug: false
})

// Install router
app.use(router)

app.mount('#app')
