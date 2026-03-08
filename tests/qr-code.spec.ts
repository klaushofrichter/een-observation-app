import { test, expect, Page } from '@playwright/test'
import dotenv from 'dotenv'

dotenv.config()

/**
 * E2E tests for Mobile Companion QR Code Popup
 *
 * Tests:
 * 1. QR icon is hidden when not authenticated
 * 2. QR icon appears after camera selection
 * 3. Click QR icon opens popup immediately
 * 4. Popup shows QR code image, title, and token validity
 * 5. Hover on QR icon opens popup after delay
 * 6. Popup stays open when mouse moves to it
 * 7. Copy button shows copied feedback
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

test.describe('Mobile Companion QR Code', () => {
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
      console.log('OAuth proxy not accessible - QR code tests will be skipped')
    }
  })

  test.afterEach(async ({ page }) => {
    await clearAuthState(page)
  })

  const qrIconSelector = '[title="Click or hover to show QR code"]'
  const qrPopupSelector = '.absolute.right-0.top-full'

  test('should not show QR icon when not authenticated', async ({ page }) => {
    skipIfNoProxy()

    // Navigate to login page without authenticating
    await page.goto('/login')

    // QR icon should not be visible when not authenticated
    await expect(page.locator(qrIconSelector)).not.toBeVisible()
  })

  test('should show QR icon after camera selection', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()
    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // Select a camera
    const sidebar = page.locator('.camera-sidebar')
    const cameraCards = sidebar.locator('.camera-card')
    await expect(cameraCards.first()).toBeVisible({ timeout: TIMEOUTS.CAMERA_LOAD })
    await cameraCards.first().click()

    // QR icon should now be visible
    await expect(page.locator(qrIconSelector)).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
  })

  test('should open popup immediately on click and show QR code content', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()
    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // Select a camera
    const sidebar = page.locator('.camera-sidebar')
    const cameraCards = sidebar.locator('.camera-card')
    await expect(cameraCards.first()).toBeVisible({ timeout: TIMEOUTS.CAMERA_LOAD })
    await cameraCards.first().click()

    // Click the QR icon
    const qrIcon = page.locator(qrIconSelector)
    await expect(qrIcon).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    await qrIcon.click()

    // Popup should appear immediately
    const popup = page.locator(qrPopupSelector)
    await expect(popup).toBeVisible({ timeout: 2000 })

    // Verify popup contents
    await expect(popup.locator('text=Mobile Companion')).toBeVisible()
    await expect(popup.locator('text=Experimental')).toBeVisible()
    await expect(popup.locator('img[alt="QR Code"]')).toBeVisible()
    await expect(popup.locator('text=Scan with iPhone camera')).toBeVisible()
    await expect(popup.locator('text=Token valid for')).toBeVisible()
  })

  test('should show hover popup after delay', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()
    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // Select a camera
    const sidebar = page.locator('.camera-sidebar')
    const cameraCards = sidebar.locator('.camera-card')
    await expect(cameraCards.first()).toBeVisible({ timeout: TIMEOUTS.CAMERA_LOAD })
    await cameraCards.first().click()

    // Hover over the QR icon container (parent div with mouseenter handler)
    const qrIcon = page.locator(qrIconSelector)
    await expect(qrIcon).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    await qrIcon.hover()

    // Popup should NOT be visible immediately
    const popup = page.locator(qrPopupSelector)
    await expect(popup).not.toBeVisible()

    // After the 1-second delay, popup should appear
    await expect(popup).toBeVisible({ timeout: 2000 })
  })

  test('should keep popup open when mouse moves to it', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()
    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // Select a camera
    const sidebar = page.locator('.camera-sidebar')
    const cameraCards = sidebar.locator('.camera-card')
    await expect(cameraCards.first()).toBeVisible({ timeout: TIMEOUTS.CAMERA_LOAD })
    await cameraCards.first().click()

    // Click the QR icon to open popup
    const qrIcon = page.locator(qrIconSelector)
    await expect(qrIcon).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    await qrIcon.click()

    const popup = page.locator(qrPopupSelector)
    await expect(popup).toBeVisible({ timeout: 2000 })

    // Move mouse to the popup
    await popup.hover()

    // Wait longer than the 300ms close delay
    await page.waitForTimeout(500)

    // Popup should still be visible
    await expect(popup).toBeVisible()
  })

  test('should show copy feedback on copy button click', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()
    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // Grant clipboard permissions
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])

    // Select a camera
    const sidebar = page.locator('.camera-sidebar')
    const cameraCards = sidebar.locator('.camera-card')
    await expect(cameraCards.first()).toBeVisible({ timeout: TIMEOUTS.CAMERA_LOAD })
    await cameraCards.first().click()

    // Click the QR icon to open popup
    const qrIcon = page.locator(qrIconSelector)
    await expect(qrIcon).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    await qrIcon.click()

    const popup = page.locator(qrPopupSelector)
    await expect(popup).toBeVisible({ timeout: 2000 })

    // Click the copy button (initially shows "Copy URL" title)
    const copyButton = popup.locator('button[title="Copy URL"]')
    await expect(copyButton).toBeVisible()
    await copyButton.click()

    // Button should show "Copied!" feedback
    await expect(popup.locator('button[title="Copied!"]')).toBeVisible({ timeout: 2000 })
  })
})
