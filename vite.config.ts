import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// Base path is driven by VITE_BASE_PATH so the same build works for Labs
// (/experiments/observation-app/) and any other host. Dev server stays at '/'.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? (process.env.VITE_BASE_PATH || '/experiments/observation-app/') : '/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  server: {
    host: '127.0.0.1',
    port: 3333,
    strictPort: true,
    open: true
  }
}))
