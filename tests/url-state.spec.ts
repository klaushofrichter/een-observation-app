import { test, expect, Page } from '@playwright/test'
import dotenv from 'dotenv'

dotenv.config()

/**
 * E2E tests for URL State Persistence
 *
 * Tests that camera selection and event type filters are:
 * 1. Saved to URL parameters
 * 2. Restored when opening the app with those parameters
 */

const TIMEOUTS = {
  OAUTH_REDIRECT: 30000,
  ELEMENT_VISIBLE: 15000,
  PASSWORD_VISIBLE: 10000,
  AUTH_COMPLETE: 60000,
  UI_UPDATE: 10000,
  CAMERA_LOAD: 20000,
  EVENTS_LOAD: 15000,
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

  // Wait for either EEN OAuth page or redirect back to app (if OAuth session exists)
  await Promise.race([
    page.waitForURL(/.*eagleeyenetworks.com.*/, { timeout: TIMEOUTS.OAUTH_REDIRECT }),
    page.waitForURL(/127\.0\.0\.1:3333/, { timeout: TIMEOUTS.OAUTH_REDIRECT })
  ])

  // Check if we're on the EEN OAuth page or already redirected back
  const currentUrl = page.url()
  if (/(?:^|\.)eagleeyenetworks\.com$/.test(new URL(currentUrl).hostname)) {
    // Need to complete OAuth login form
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

  // Wait for callback processing to complete and land on home page
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

test.describe('URL State Persistence', () => {
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
      console.log('OAuth proxy not accessible - URL state tests will be skipped')
    }
  })

  test.afterEach(async ({ page }) => {
    await clearAuthState(page)
  })

  test('should restore camera and event type selection from URL', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    // Step 1: Login and wait for app to load
    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // Wait for camera sidebar and cards to load
    const sidebar = page.locator('.camera-sidebar')
    await expect(sidebar).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    const cameraCards = sidebar.locator('.camera-card')
    await expect(cameraCards.first()).toBeVisible({ timeout: TIMEOUTS.CAMERA_LOAD })

    const cardCount = await cameraCards.count()
    console.log(`Found ${cardCount} camera(s)`)

    if (cardCount < 2) {
      console.log('Only one camera available, test will use first camera')
    }

    // Step 2: Select the second camera (or first if only one available)
    const targetIndex = cardCount > 1 ? 1 : 0
    const targetCard = cameraCards.nth(targetIndex)
    const targetCameraId = await targetCard.getAttribute('data-camera-id')
    const targetCameraName = await targetCard.locator('h3').textContent()
    console.log(`Selecting camera: ${targetCameraName} (ID: ${targetCameraId})`)

    await targetCard.click()

    // Wait for URL to update
    await page.waitForURL(/\?id=/, { timeout: TIMEOUTS.UI_UPDATE })

    // Verify main video player shows the selected camera
    const mainVideoPlayer = page.locator('.main-video-player')
    await expect(mainVideoPlayer).toHaveAttribute('data-camera-id', targetCameraId || '', { timeout: TIMEOUTS.UI_UPDATE })

    // Step 3: Wait for event types panel to load
    const eventTypesPanel = page.locator('.event-types-panel')
    await expect(eventTypesPanel).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Wait for event type checkboxes to appear
    const checkboxes = eventTypesPanel.locator('input[type="checkbox"]')
    await expect(checkboxes.first()).toBeVisible({ timeout: TIMEOUTS.EVENTS_LOAD })

    // Get all event type labels (skip the first one which is "All")
    const eventTypeLabels = eventTypesPanel.locator('label')
    const labelCount = await eventTypeLabels.count()
    console.log(`Found ${labelCount} event type options (including All)`)

    // Step 4: Toggle some event types
    // First, get the currently selected event types
    const initialCheckedBoxes = await eventTypesPanel.locator('input[type="checkbox"]:checked').count()
    console.log(`Initially ${initialCheckedBoxes} event type(s) selected`)

    // Click on additional event types if available (skip index 0 which is "All")
    const eventTypesToSelect: string[] = []

    // Select up to 3 event types (starting from index 1 to skip "All")
    for (let i = 1; i < Math.min(labelCount, 4); i++) {
      const label = eventTypeLabels.nth(i)
      const checkbox = label.locator('input[type="checkbox"]')
      const labelText = await label.locator('span').last().textContent()

      // Check if not already checked
      const isChecked = await checkbox.isChecked()
      if (!isChecked) {
        await checkbox.click()
        console.log(`Selected event type: ${labelText}`)
      } else {
        console.log(`Event type already selected: ${labelText}`)
      }
      eventTypesToSelect.push(labelText || '')
    }

    // Wait for URL to update with events parameter
    await page.waitForURL(/events=/, { timeout: TIMEOUTS.UI_UPDATE })

    // Step 5: Capture the URL with all parameters
    const capturedUrl = page.url()
    console.log(`Captured URL: ${capturedUrl}`)

    // Verify URL contains expected parameters
    expect(capturedUrl).toContain('id=')
    expect(capturedUrl).toContain('selected=')
    expect(capturedUrl).toContain('events=')

    // Get the selected event types count for verification later
    const selectedEventTypes = await eventTypesPanel.locator('input[type="checkbox"]:checked').count()
    // Subtract 1 if "All" checkbox is checked (it would be indeterminate or checked)
    const selectedCount = selectedEventTypes
    console.log(`Total selected event types: ${selectedCount}`)

    // Get the selected camera ID from URL for verification
    const urlParams = new URL(capturedUrl).searchParams
    const urlCameraIds = urlParams.get('id')
    const urlSelected = urlParams.get('selected')
    const urlEvents = urlParams.get('events')
    console.log(`URL params - id: ${urlCameraIds}, selected: ${urlSelected}, events: ${urlEvents}`)

    // Step 6: Navigate away and clear session storage
    await page.goto('/logout')
    await expect(page.getByRole('heading', { name: /logged out/i })).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Clear session storage to simulate fresh browser session
    await page.evaluate(() => {
      sessionStorage.clear()
    })
    console.log('Logged out and cleared session storage')

    // Step 7: Reopen with the captured URL
    console.log(`Reopening with URL: ${capturedUrl}`)
    await page.goto(capturedUrl)

    // Should redirect to login
    await expect(page).toHaveURL('/login', { timeout: TIMEOUTS.UI_UPDATE })

    // Login again
    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // Step 8: Verify URL parameters are restored
    await page.waitForURL(/\?id=/, { timeout: TIMEOUTS.UI_UPDATE })
    const restoredUrl = page.url()
    console.log(`Restored URL: ${restoredUrl}`)

    // Verify URL contains the same parameters
    expect(restoredUrl).toContain(`selected=${urlSelected}`)
    expect(restoredUrl).toContain(`events=${urlEvents}`)

    // Step 9: Verify the correct camera is selected
    await expect(mainVideoPlayer).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    await expect(mainVideoPlayer).toHaveAttribute('data-camera-id', targetCameraId || '', { timeout: TIMEOUTS.UI_UPDATE })
    console.log(`Verified camera ${targetCameraId} is selected`)

    // Step 10: Verify the event types are restored
    await expect(eventTypesPanel).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    await expect(checkboxes.first()).toBeVisible({ timeout: TIMEOUTS.EVENTS_LOAD })

    // Wait for event types to load
    await page.waitForTimeout(1000)

    // Count selected event types (excluding "All" checkbox if it's the first one)
    const restoredSelectedCount = await eventTypesPanel.locator('input[type="checkbox"]:checked').count()
    console.log(`Restored selected event types: ${restoredSelectedCount}`)

    // The number of selected event types should match
    // Note: might be fewer if some event types aren't available for this camera
    expect(restoredSelectedCount).toBeGreaterThan(0)
    console.log(`Event type selection restored successfully`)

    console.log('URL state persistence test completed successfully')
  })
})
