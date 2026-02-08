import { test, expect, Page } from '@playwright/test'
import dotenv from 'dotenv'

dotenv.config()

/**
 * E2E tests for User Info Modal
 *
 * Tests:
 * 1. Display base URL and copy it to clipboard
 * 2. Show and copy access token
 * 3. Display token expiration info
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
  if (currentUrl.includes('eagleeyenetworks.com')) {
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

async function openUserInfoModal(page: Page): Promise<void> {
  const usernameButton = page.locator('header button').filter({ hasText: /\w+ \w+/ }).first()
  await expect(usernameButton).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
  await usernameButton.click()
  await expect(page.getByRole('heading', { name: 'User Info' })).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
}

test.describe('User Info Modal', () => {
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
      console.log('OAuth proxy not accessible - user info tests will be skipped')
    }
  })

  test.afterEach(async ({ page }) => {
    await clearAuthState(page)
  })

  test('should display base URL and copy it to clipboard', async ({ page, context }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])

    await performLogin(page, TEST_USER!, TEST_PASSWORD!)
    await openUserInfoModal(page)

    // Verify Base URL section is visible
    await expect(page.getByText('Base URL')).toBeVisible()

    // Find the base URL code element - it should contain a non-empty URL
    const baseUrlCode = page.locator('code').first()
    await expect(baseUrlCode).toBeVisible()
    const baseUrlText = await baseUrlCode.textContent()
    expect(baseUrlText).toBeTruthy()
    expect(baseUrlText!.length).toBeGreaterThan(0)
    console.log(`Base URL displayed: ${baseUrlText}`)

    // Click the copy button next to Base URL
    const copyBaseUrlBtn = page.getByTitle('Copy Base URL')
    await expect(copyBaseUrlBtn).toBeVisible()
    await copyBaseUrlBtn.click()

    // Verify copy feedback - title changes to "Copied!"
    await expect(page.getByTitle('Copied!').first()).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    console.log('Base URL copy test completed successfully')
  })

  test('should show and copy access token', async ({ page, context }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])

    await performLogin(page, TEST_USER!, TEST_PASSWORD!)
    await openUserInfoModal(page)

    // Verify Access Token section is visible
    await expect(page.getByText('Access Token')).toBeVisible()

    // Token should be hidden by default (shows dots)
    const tokenCode = page.locator('code').nth(1)
    await expect(tokenCode).toBeVisible()
    const maskedText = await tokenCode.textContent()
    expect(maskedText).toContain('•')
    console.log('Token is masked by default')

    // Click "Show & Copy" button
    const showCopyBtn = page.getByRole('button', { name: /Show & Copy/i })
    await expect(showCopyBtn).toBeVisible()
    await showCopyBtn.click()

    // Verify token is revealed (no longer dots)
    await page.waitForTimeout(500)
    const revealedText = await tokenCode.textContent()
    expect(revealedText).not.toContain('•')
    expect(revealedText!.length).toBeGreaterThan(10)
    console.log('Token revealed successfully')

    // Verify copy feedback - button text changes
    const copiedOrCopy = page.getByRole('button', { name: /Copied!|^Copy$/i })
    await expect(copiedOrCopy).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    console.log('Access token show and copy test completed successfully')
  })

  test('should display token expiration info', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    await performLogin(page, TEST_USER!, TEST_PASSWORD!)
    await openUserInfoModal(page)

    // Verify expiration timestamp is shown
    await expect(page.getByText('Expires:')).toBeVisible()

    // Verify time remaining is displayed (non-empty text)
    await expect(page.getByText('Time remaining:')).toBeVisible()

    // Get the time remaining text to verify it's meaningful
    const timeRemainingText = await page.getByText('Time remaining:').textContent()
    expect(timeRemainingText).toBeTruthy()
    expect(timeRemainingText!.length).toBeGreaterThan('Time remaining:'.length)
    console.log(`Token expiration info: ${timeRemainingText}`)

    // Close modal
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: 'User Info' })).not.toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    console.log('Token expiration info test completed successfully')
  })
})
