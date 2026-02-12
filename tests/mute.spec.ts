import { test, expect, Page } from '@playwright/test'
import dotenv from 'dotenv'

dotenv.config()

/**
 * E2E tests for Mute Toggle
 *
 * Tests:
 * 1. Toggle mute and verify icon/title changes
 * 2. Verify mute=1 URL parameter appears/disappears
 * 3. Verify mute persists through login flow via sessionStorage
 */

const TIMEOUTS = {
  OAUTH_REDIRECT: 30000,
  ELEMENT_VISIBLE: 15000,
  PASSWORD_VISIBLE: 10000,
  AUTH_COMPLETE: 60000,
  UI_UPDATE: 10000,
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

test.describe('Mute Toggle', () => {
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
      console.log('OAuth proxy not accessible - mute tests will be skipped')
    }
  })

  test.afterEach(async ({ page }) => {
    await clearAuthState(page)
  })

  test('should toggle mute and verify icon/title changes', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // Wait for app to load
    await expect(page.locator('.camera-sidebar')).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Find the mute toggle button (initially unmuted)
    const muteToggle = page.locator('button[title="Sound is on"], button[title="Sound is muted"]')
    await expect(muteToggle).toBeVisible()

    // Verify initial state is unmuted
    await expect(page.locator('button[title="Sound is on"]')).toBeVisible()
    console.log('Initial mute state: unmuted (Sound is on)')

    // Click to mute
    await muteToggle.click()
    await page.waitForTimeout(500)

    // Verify muted state
    await expect(page.locator('button[title="Sound is muted"]')).toBeVisible()
    console.log('Toggled to muted state')

    // Click to unmute
    await page.locator('button[title="Sound is muted"]').click()
    await page.waitForTimeout(500)

    // Verify unmuted state restored
    await expect(page.locator('button[title="Sound is on"]')).toBeVisible()
    console.log('Toggled back to unmuted state')
    console.log('Mute toggle test completed successfully')
  })

  test('should add and remove mute=1 URL parameter', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    await performLogin(page, TEST_USER!, TEST_PASSWORD!)
    await expect(page.locator('.camera-sidebar')).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Initially unmuted - URL should not contain mute=1
    expect(page.url()).not.toContain('mute=1')

    // Click to mute
    const muteToggle = page.locator('button[title="Sound is on"]')
    await expect(muteToggle).toBeVisible()
    await muteToggle.click()
    await page.waitForTimeout(500)

    // Verify URL contains mute=1
    expect(page.url()).toContain('mute=1')
    console.log('Mute enabled, URL contains mute=1')

    // Click to unmute
    await page.locator('button[title="Sound is muted"]').click()
    await page.waitForTimeout(500)

    // Verify mute=1 removed from URL
    expect(page.url()).not.toContain('mute=1')
    console.log('Mute disabled, mute=1 removed from URL')
    console.log('Mute URL parameter test completed successfully')
  })

  test('should persist mute through login flow via sessionStorage', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    await performLogin(page, TEST_USER!, TEST_PASSWORD!)
    await expect(page.locator('.camera-sidebar')).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Enable mute
    const muteToggle = page.locator('button[title="Sound is on"]')
    await expect(muteToggle).toBeVisible()
    await muteToggle.click()
    await page.waitForTimeout(500)

    // Verify URL contains mute=1
    expect(page.url()).toContain('mute=1')
    const muteUrl = page.url()

    // Logout
    await page.getByRole('link', { name: /logout/i }).click()
    await expect(page.getByRole('heading', { name: /logged out/i })).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Clear auth state but preserve sessionStorage for mute
    await page.evaluate(() => {
      try { localStorage.clear() } catch { /* ignore */ }
    })

    // Navigate to the mute URL (triggers sessionStorage save via router guard)
    await page.goto(muteUrl)
    await expect(page).toHaveURL('/login')

    // Login again - mute should be restored from sessionStorage
    await performLogin(page, TEST_USER!, TEST_PASSWORD!)
    await expect(page.locator('.camera-sidebar')).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Verify mute is active (restored from URL parameter via sessionStorage)
    await expect(page.locator('button[title="Sound is muted"]')).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    console.log('Mute restored via URL parameter through login flow')

    console.log('Mute sessionStorage persistence test completed successfully')
  })
})
