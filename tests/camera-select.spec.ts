import { test, expect, Page } from '@playwright/test'
import dotenv from 'dotenv'

dotenv.config()

/**
 * E2E tests for Camera Selection Modal
 *
 * Tests:
 * 1. Camera select button is visible in sidebar
 * 2. Camera select modal opens and displays cameras
 * 3. Camera selection and navigation via Done button
 * 4. Modal closes via Cancel, ESC, and backdrop click
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

test.describe('Camera Selection Modal', () => {
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
      console.log('OAuth proxy not accessible - camera select tests will be skipped')
    }
  })

  test.afterEach(async ({ page }) => {
    await clearAuthState(page)
  })

  test('should display camera select button in sidebar', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    const sidebar = page.locator('.camera-sidebar')
    await expect(sidebar).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Wait for cameras to load
    const cameraCards = sidebar.locator('.camera-card')
    await expect(cameraCards.first()).toBeVisible({ timeout: TIMEOUTS.CAMERA_LOAD })

    // Camera select button should be visible (clipboard icon with title "Select cameras")
    const selectButton = sidebar.locator('button[title="Select cameras"]')
    await expect(selectButton).toBeVisible()

    console.log('Camera select button is visible in sidebar')
  })

  test('should open modal and display all cameras with checkboxes', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    const sidebar = page.locator('.camera-sidebar')
    const cameraCards = sidebar.locator('.camera-card')
    await expect(cameraCards.first()).toBeVisible({ timeout: TIMEOUTS.CAMERA_LOAD })

    // Click the camera select button
    const selectButton = sidebar.locator('button[title="Select cameras"]')
    await selectButton.click()

    // Modal should appear
    const modal = page.locator('.fixed.inset-0.z-50')
    await expect(modal).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Modal should have "Select Cameras" title
    await expect(modal.locator('h3', { hasText: 'Select Cameras' })).toBeVisible()

    // "Select up to 10 cameras" hint only shown when more than 10 cameras
    // Test account has 3 cameras, so verify it is NOT shown
    await expect(modal.getByText('Select up to 10 cameras')).not.toBeVisible()

    // Should display camera checkboxes
    const checkboxes = modal.locator('input[type="checkbox"]')
    const checkboxCount = await checkboxes.count()
    console.log(`Modal shows ${checkboxCount} camera(s) with checkboxes`)
    expect(checkboxCount).toBeGreaterThan(0)

    // Each camera card should show a name and ID
    const cameraLabels = modal.locator('label')
    const firstLabel = cameraLabels.first()
    await expect(firstLabel.locator('.text-sm.font-medium')).toBeVisible()
    await expect(firstLabel.locator('.text-xs')).toBeVisible()

    // Should show selection count
    await expect(modal.getByText(/\d+ of \d+ selected/)).toBeVisible()

    // Should have Cancel and Done buttons
    await expect(modal.getByRole('button', { name: 'Cancel' })).toBeVisible()
    await expect(modal.getByRole('button', { name: 'Done' })).toBeVisible()

    console.log('Camera select modal displays correctly with all cameras')
  })

  test('should select cameras and navigate to URL with selected IDs', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    const sidebar = page.locator('.camera-sidebar')
    const cameraCards = sidebar.locator('.camera-card')
    await expect(cameraCards.first()).toBeVisible({ timeout: TIMEOUTS.CAMERA_LOAD })

    // Click the camera select button
    const selectButton = sidebar.locator('button[title="Select cameras"]')
    await selectButton.click()

    const modal = page.locator('.fixed.inset-0.z-50')
    await expect(modal).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Deselect all first by clicking "Deselect All" if visible
    const deselectButton = modal.getByRole('button', { name: 'Deselect All' })
    const deselectVisible = await deselectButton.isVisible().catch(() => false)
    if (deselectVisible) {
      await deselectButton.click()
    }

    // Select the first two cameras by clicking their checkboxes
    const checkboxes = modal.locator('input[type="checkbox"]')
    const checkboxCount = await checkboxes.count()
    expect(checkboxCount).toBeGreaterThan(0)

    // Click first checkbox
    await checkboxes.nth(0).click()

    // Click second checkbox if available
    if (checkboxCount > 1) {
      await checkboxes.nth(1).click()
    }

    // Selection count should update
    const expectedCount = checkboxCount > 1 ? 2 : 1
    await expect(modal.getByText(`${expectedCount} of ${checkboxCount} selected`)).toBeVisible()

    // Click Done
    await modal.getByRole('button', { name: 'Done' }).click()

    // Page should navigate to URL with id parameter
    await page.waitForURL(/\?id=/, { timeout: TIMEOUTS.AUTH_COMPLETE })
    const finalUrl = page.url()
    console.log(`Navigated to: ${finalUrl}`)

    // URL should contain comma-separated camera IDs
    expect(finalUrl).toContain('id=')

    // After reload, layout dropdown should show "URL-cameras"
    const layoutSelect = page.locator('.camera-sidebar select[title="Select layout"]')
    await expect(layoutSelect).toBeVisible({ timeout: TIMEOUTS.CAMERA_LOAD })
    const selectedValue = await layoutSelect.inputValue()
    expect(selectedValue).toBe('url')

    console.log('Camera selection and URL navigation test completed successfully')
  })

  test('should close modal via Cancel, ESC, and backdrop click', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    const sidebar = page.locator('.camera-sidebar')
    const cameraCards = sidebar.locator('.camera-card')
    await expect(cameraCards.first()).toBeVisible({ timeout: TIMEOUTS.CAMERA_LOAD })

    const selectButton = sidebar.locator('button[title="Select cameras"]')
    const modal = page.locator('.fixed.inset-0.z-50')

    // Test Cancel button
    await selectButton.click()
    await expect(modal).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    await modal.getByRole('button', { name: 'Cancel' }).click()
    await expect(modal).not.toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    console.log('Modal closed with Cancel button')

    // Test ESC key
    await selectButton.click()
    await expect(modal).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    await page.keyboard.press('Escape')
    await expect(modal).not.toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    console.log('Modal closed with ESC key')

    // Test backdrop click
    await selectButton.click()
    await expect(modal).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    await modal.locator('.absolute.inset-0.bg-black\\/50').click({ position: { x: 10, y: 10 } })
    await expect(modal).not.toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    console.log('Modal closed with backdrop click')

    console.log('Modal close methods test completed successfully')
  })
})
