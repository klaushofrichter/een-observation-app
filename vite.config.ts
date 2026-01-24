import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/een-observation-app/' : '/',
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
})
