import { test, expect, Page } from '@playwright/test'
import dotenv from 'dotenv'

dotenv.config()

/**
 * E2E tests for the EEN Camera Observation App - OAuth Login Flow
 *
 * Tests the OAuth login flow through the UI:
 * 1. Click login button in the app
 * 2. Enter credentials on EEN OAuth page (two-step: email → Next → password → Sign in)
 * 3. Complete the OAuth callback
 * 4. Verify authenticated state
 *
 * Required environment variables:
 * - VITE_PROXY_URL: OAuth proxy URL
 * - VITE_EEN_CLIENT_ID: EEN OAuth client ID
 * - TEST_USER: Test user email
 * - TEST_PASSWORD: Test user password
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

/**
 * Perform EEN OAuth login through the UI
 * EEN uses a two-step login: email → Next → password → Sign in
 */
async function performLogin(page: Page, username: string, password: string): Promise<void> {
  // Go to app and click login button
  await page.goto('/login')
  await page.click('button:has-text("Login with Eagle Eye Networks")')

  // Wait for redirect to EEN OAuth page
  await page.waitForURL(/.*eagleeyenetworks.com.*/, { timeout: TIMEOUTS.OAUTH_REDIRECT })

  // Step 1: Enter email
  const emailInput = page.locator('#authentication--input__email, input[type="email"], input[type="text"]').first()
  await emailInput.waitFor({ state: 'visible', timeout: TIMEOUTS.ELEMENT_VISIBLE })
  await emailInput.fill(username)

  // Click Next button
  await page.getByRole('button', { name: 'Next' }).click()

  // Step 2: Enter password
  const passwordInput = page.locator('#authentication--input__password, input[type="password"]')
  await passwordInput.waitFor({ state: 'visible', timeout: TIMEOUTS.PASSWORD_VISIBLE })
  await passwordInput.fill(password)

  // Click Sign in button
  await page.locator('#next, button:has-text("Sign in")').first().click()

  // Wait for redirect back to app and auth complete
  await page.waitForURL(/127\.0\.0\.1:3333/, { timeout: TIMEOUTS.AUTH_COMPLETE })

  // Wait for callback processing to complete
  await page.waitForURL('**/', { timeout: TIMEOUTS.AUTH_COMPLETE })
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

test.describe('Authentication', () => {
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
      console.log('OAuth proxy not accessible - OAuth tests will be skipped')
    }
  })

  test.afterEach(async ({ page }) => {
    await clearAuthState(page)
  })

  test('should redirect unauthenticated user to login page', async ({ page }) => {
    await page.goto('/')

    // Should redirect to login
    await expect(page).toHaveURL('/login')

    // Should show login button
    await expect(page.getByRole('button', { name: /login with eagle eye/i })).toBeVisible()
  })

  test('should redirect unknown routes to home page', async ({ page }) => {
    // Navigate to an unknown route
    await page.goto('/unknown')

    // Should redirect to home, then to login (since unauthenticated)
    await expect(page).toHaveURL('/login')

    // Should show login button
    await expect(page.getByRole('button', { name: /login with eagle eye/i })).toBeVisible()

    // Try another unknown nested route
    await page.goto('/some/nested/unknown/path')

    // Should also redirect to login
    await expect(page).toHaveURL('/login')
    await expect(page.getByRole('button', { name: /login with eagle eye/i })).toBeVisible()

    console.log('Unknown route redirect test completed successfully')
  })

  test('should complete OAuth login flow', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    console.log('Starting OAuth login test with user:', TEST_USER)

    // Verify initially redirected to login
    await page.goto('/')
    await expect(page).toHaveURL('/login')

    // Perform login
    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // Verify landing URL is home page
    await expect(page).toHaveURL('/')

    // Verify authenticated state - camera sidebar should be visible
    await expect(page.getByText(/logout/i)).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    await expect(page.locator('.camera-sidebar')).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    console.log('Login test completed successfully')
  })

  test('should show user info when authenticated', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    // Perform login first
    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // Verify authenticated state - camera sidebar should be visible
    await expect(page).toHaveURL('/')
    await expect(page.getByText(/logout/i)).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    await expect(page.locator('.camera-sidebar')).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    console.log('User info test completed successfully')
  })

  test('should logout successfully', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    // Perform login first
    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // Verify logged in
    await expect(page.getByText(/logout/i)).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Click logout
    await page.getByRole('link', { name: /logout/i }).click()

    // Should show logged out message
    await expect(page.getByRole('heading', { name: /logged out/i })).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Should redirect to login page
    await expect(page).toHaveURL('/login', { timeout: TIMEOUTS.UI_UPDATE })

    console.log('Logout test completed successfully')
  })

  test('should open user info modal when clicking username', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    // Perform login first
    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // Verify logged in - wait for username button to appear
    const usernameButton = page.locator('header button').filter({ hasText: /\w+ \w+/ }).first()
    await expect(usernameButton).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Click username to open modal
    await usernameButton.click()

    // Modal should open with "User Info" heading
    const modal = page.locator('[class*="fixed inset-0"]')
    await expect(modal).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    await expect(page.getByRole('heading', { name: 'User Info' })).toBeVisible()

    // Modal should show user details section
    await expect(page.getByText('User Details')).toBeVisible()
    await expect(page.getByText('Name:')).toBeVisible()
    await expect(page.getByText('Email:')).toBeVisible()
    await expect(page.getByText('User ID:')).toBeVisible()

    // Modal should show Base URL section
    await expect(page.getByText('Base URL')).toBeVisible()

    // Modal should show Access Token section
    await expect(page.getByText('Access Token')).toBeVisible()
    await expect(page.getByText('Expires:')).toBeVisible()
    await expect(page.getByText('Time remaining:')).toBeVisible()

    // Should have Show & Copy button for token
    await expect(page.getByRole('button', { name: /show.*copy/i })).toBeVisible()

    console.log('User info modal test completed successfully')
  })

  test('should close user info modal with ESC key', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    // Perform login first
    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // Click username to open modal
    const usernameButton = page.locator('header button').filter({ hasText: /\w+ \w+/ }).first()
    await expect(usernameButton).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    await usernameButton.click()

    // Verify modal is open
    await expect(page.getByRole('heading', { name: 'User Info' })).toBeVisible()

    // Press ESC to close modal
    await page.keyboard.press('Escape')

    // Modal should be closed
    await expect(page.getByRole('heading', { name: 'User Info' })).not.toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    console.log('User info modal ESC close test completed successfully')
  })

  test('should close user info modal by clicking outside', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    // Perform login first
    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // Click username to open modal
    const usernameButton = page.locator('header button').filter({ hasText: /\w+ \w+/ }).first()
    await expect(usernameButton).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    await usernameButton.click()

    // Verify modal is open
    await expect(page.getByRole('heading', { name: 'User Info' })).toBeVisible()

    // Click on backdrop to close modal
    const backdrop = page.locator('.bg-black\\/50')
    await backdrop.click({ position: { x: 10, y: 10 } })

    // Modal should be closed
    await expect(page.getByRole('heading', { name: 'User Info' })).not.toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    console.log('User info modal click outside close test completed successfully')
  })
})
