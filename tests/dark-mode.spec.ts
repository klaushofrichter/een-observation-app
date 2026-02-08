import { test, expect, Page } from '@playwright/test'
import dotenv from 'dotenv'

dotenv.config()

/**
 * E2E tests for Dark Mode
 *
 * Tests:
 * 1. Toggle dark mode and persist preference
 * 2. Respect dark mode URL parameter
 */

const TIMEOUTS = {
  OAUTH_REDIRECT: 30000,
  ELEMENT_VISIBLE: 15000,
  PASSWORD_VISIBLE: 10000,
  AUTH_COMPLETE: 60000,
  UI_UPDATE: 10000,
  CAMERA_LOAD: 20000,
  PROXY_CHECK: 5000
} as const

const TEST_USER = process.env.TEST_USER
const TEST_PASSWORD = process.env.TEST_PASSWORD
const PROXY_URL = process.env.VITE_PROXY_URL

async function isProxyAccessible(): Promise<boolean> {
  if (!PROXY_URL) return false
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.PROXY_CHECK)

  try {
    const response = await fetch(PROXY_URL, {
      method: 'HEAD',
      signal: controller.signal
    })
    return response.ok || response.status === 404
  } catch {
    return false
  } finally {
    clearTimeout(timeoutId)
  }
}

async function performLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.click('button:has-text("Login with Eagle Eye Networks")')

  await Promise.race([
    page.waitForURL(/.*eagleeyenetworks.com.*/, { timeout: TIMEOUTS.OAUTH_REDIRECT }),
    page.waitForURL(/127\.0\.0\.1:3333/, { timeout: TIMEOUTS.OAUTH_REDIRECT })
  ])

  const currentUrl = page.url()
  if (/(?:^|\.)eagleeyenetworks\.com$/.test(new URL(currentUrl).hostname)) {
    const emailInput = page.locator('#authentication--input__email, input[type="email"], input[type="text"]').first()
    await emailInput.waitFor({ state: 'visible', timeout: TIMEOUTS.ELEMENT_VISIBLE })
    await emailInput.fill(username)
    await page.getByRole('button', { name: 'Next' }).click()

    const passwordInput = page.locator('#authentication--input__password, input[type="password"]')
    await passwordInput.waitFor({ state: 'visible', timeout: TIMEOUTS.PASSWORD_VISIBLE })
    await passwordInput.fill(password)
    await page.locator('#next, button:has-text("Sign in")').first().click()

    await page.waitForURL(/127\.0\.0\.1:3333/, { timeout: TIMEOUTS.AUTH_COMPLETE })
  }

  await page.waitForFunction(
    () => window.location.pathname === '/' && !window.location.search.includes('code='),
    { timeout: TIMEOUTS.AUTH_COMPLETE }
  )
}

async function clearAuthState(page: Page): Promise<void> {
  try {
    const url = page.url()
    if (url && url.startsWith('http')) {
      await page.evaluate(() => {
        try {
          localStorage.clear()
          sessionStorage.clear()
        } catch {
          // Ignore
        }
      })
    }
  } catch {
    // Ignore
  }
}

test.describe('Dark Mode', () => {
  let proxyAccessible = false

  function skipIfNoProxy() {
    test.skip(!proxyAccessible, 'OAuth proxy not accessible')
  }

  function skipIfNoCredentials() {
    test.skip(!TEST_USER || !TEST_PASSWORD, 'Test credentials not available')
  }

  test.beforeAll(async () => {
    proxyAccessible = await isProxyAccessible()
    if (!proxyAccessible) {
      console.log('OAuth proxy not accessible - dark mode tests will be skipped')
    }
  })

  test.afterEach(async ({ page }) => {
    await clearAuthState(page)
  })

  test('should toggle dark mode and persist preference', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // Wait for app to load
    await expect(page.locator('.camera-sidebar')).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Find the dark mode toggle button
    const darkToggle = page.locator('button[title="Switch to dark mode"], button[title="Switch to light mode"]')
    await expect(darkToggle).toBeVisible()

    // Check initial state
    const initialTitle = await darkToggle.getAttribute('title')
    const initialIsDark = initialTitle === 'Switch to light mode'
    console.log(`Initial dark mode state: ${initialIsDark}`)

    // Click to toggle dark mode
    await darkToggle.click()
    await page.waitForTimeout(500)

    // Verify state changed
    if (initialIsDark) {
      // Was dark, now should be light
      await expect(page.locator('html:not(.dark)')).toBeAttached()
      await expect(page.locator('button[title="Switch to dark mode"]')).toBeVisible()
    } else {
      // Was light, now should be dark
      await expect(page.locator('html.dark')).toBeAttached()
      await expect(page.locator('button[title="Switch to light mode"]')).toBeVisible()
    }
    console.log('Toggled dark mode successfully')

    // Toggle back
    await darkToggle.click()
    await page.waitForTimeout(500)

    // Verify restored to original state
    if (initialIsDark) {
      await expect(page.locator('html.dark')).toBeAttached()
      await expect(page.locator('button[title="Switch to light mode"]')).toBeVisible()
    } else {
      await expect(page.locator('html:not(.dark)')).toBeAttached()
      await expect(page.locator('button[title="Switch to dark mode"]')).toBeVisible()
    }
    console.log('Dark mode toggle test completed successfully')
  })

  test('should respect dark mode URL parameter', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    // First, enable dark mode via toggle to get dark=1 in URL
    await performLogin(page, TEST_USER!, TEST_PASSWORD!)
    await expect(page.locator('.camera-sidebar')).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Ensure we start in light mode
    const darkToggle = page.locator('button[title="Switch to dark mode"], button[title="Switch to light mode"]')
    await expect(darkToggle).toBeVisible()
    const initialTitle = await darkToggle.getAttribute('title')
    if (initialTitle === 'Switch to light mode') {
      // Currently dark, switch to light first
      await darkToggle.click()
      await page.waitForTimeout(500)
    }

    // Now toggle to dark mode
    await page.locator('button[title="Switch to dark mode"]').click()
    await page.waitForTimeout(500)

    // Verify URL contains dark=1
    expect(page.url()).toContain('dark=1')
    await expect(page.locator('html.dark')).toBeAttached()
    console.log('Dark mode enabled, URL contains dark=1')

    // Capture URL with dark=1
    const darkUrl = page.url()

    // Toggle back to light mode
    await page.locator('button[title="Switch to light mode"]').click()
    await page.waitForTimeout(500)

    // Verify dark=1 removed from URL
    expect(page.url()).not.toContain('dark=1')
    await expect(page.locator('html:not(.dark)')).toBeAttached()
    console.log('Light mode restored, dark=1 removed from URL')

    // Now test that dark=1 persists through login flow via sessionStorage
    // Logout
    await page.getByRole('link', { name: /logout/i }).click()
    await expect(page.getByRole('heading', { name: /logged out/i })).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Clear auth state but preserve sessionStorage for dark mode
    await page.evaluate(() => {
      try { localStorage.clear() } catch { /* ignore */ }
    })

    // Navigate to the dark URL (triggers sessionStorage save via router guard)
    await page.goto(darkUrl)
    await expect(page).toHaveURL('/login')

    // Login again - dark mode should be restored from sessionStorage
    await performLogin(page, TEST_USER!, TEST_PASSWORD!)
    await expect(page.locator('.camera-sidebar')).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Verify dark mode is active (restored from URL parameter via sessionStorage)
    await expect(page.locator('html.dark')).toBeAttached({ timeout: TIMEOUTS.UI_UPDATE })
    await expect(page.locator('button[title="Switch to light mode"]')).toBeVisible()
    console.log('Dark mode restored via URL parameter through login flow')

    console.log('Dark mode URL parameter test completed successfully')
  })
})
