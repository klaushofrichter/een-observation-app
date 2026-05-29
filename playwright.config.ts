import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'

dotenv.config()

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'html',
  timeout: 60000,
  use: {
    baseURL: 'http://127.0.0.1:3333',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3333',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
    env: {
      VITE_AUTH_MODE: 'dev',
      VITE_DEV_EEN_TOKEN: process.env.VITE_DEV_EEN_TOKEN || '',
      VITE_DEV_EEN_BASE_URL: process.env.VITE_DEV_EEN_BASE_URL || ''
    }
  },
})
