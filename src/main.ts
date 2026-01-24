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
// Port 3333 is required by the EEN IDP
initEenToolkit({
  proxyUrl: import.meta.env.VITE_PROXY_URL,
  clientId: import.meta.env.VITE_EEN_CLIENT_ID,
  redirectUri: 'http://127.0.0.1:3333',
  storageStrategy: 'localStorage',
  debug: true
})

// Install router
app.use(router)

app.mount('#app')
