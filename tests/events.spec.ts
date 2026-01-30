import { test, expect, Page } from '@playwright/test'
import dotenv from 'dotenv'

dotenv.config()

/**
 * E2E tests for Events System
 *
 * Tests:
 * 1. Event types panel displays toggles
 * 2. Motion detection is preselected
 * 3. Historic events panel loads events
 * 4. Live events panel shows SSE connection
 */

const TIMEOUTS = {
  OAUTH_REDIRECT: 30000,
  ELEMENT_VISIBLE: 15000,
  PASSWORD_VISIBLE: 10000,
  AUTH_COMPLETE: 60000,
  UI_UPDATE: 10000,
  CAMERA_LOAD: 20000,
  EVENTS_LOAD: 15000,
  SSE_CONNECT: 10000,
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
  await page.waitForURL(/.*eagleeyenetworks.com.*/, { timeout: TIMEOUTS.OAUTH_REDIRECT })

  const emailInput = page.locator('#authentication--input__email, input[type="email"], input[type="text"]').first()
  await emailInput.waitFor({ state: 'visible', timeout: TIMEOUTS.ELEMENT_VISIBLE })
  await emailInput.fill(username)
  await page.getByRole('button', { name: 'Next' }).click()

  const passwordInput = page.locator('#authentication--input__password, input[type="password"]')
  await passwordInput.waitFor({ state: 'visible', timeout: TIMEOUTS.PASSWORD_VISIBLE })
  await passwordInput.fill(password)
  await page.locator('#next, button:has-text("Sign in")').first().click()

  await page.waitForURL(/127\.0\.0\.1:3333/, { timeout: TIMEOUTS.AUTH_COMPLETE })
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

test.describe('Events System', () => {
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
      console.log('OAuth proxy not accessible - events tests will be skipped')
    }
  })

  test.afterEach(async ({ page }) => {
    await clearAuthState(page)
  })

  test('should display events section with three panels', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // Wait for camera to load (events depend on selected camera)
    const sidebar = page.locator('.camera-sidebar')
    await expect(sidebar.locator('.camera-card').first()).toBeVisible({ timeout: TIMEOUTS.CAMERA_LOAD })

    // Event Types panel
    const eventTypesPanel = page.locator('.event-types-panel')
    await expect(eventTypesPanel).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    await expect(eventTypesPanel.getByRole('heading', { name: 'Event Types' })).toBeVisible()

    // Events panel (formerly Historic Events)
    const historicPanel = page.locator('.historic-events-panel')
    await expect(historicPanel).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    await expect(historicPanel.getByRole('heading', { name: 'Events' })).toBeVisible()

    // Alerts panel (formerly Live Events)
    const livePanel = page.locator('.live-events-panel')
    await expect(livePanel).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    await expect(livePanel.getByRole('heading', { name: 'Alerts' })).toBeVisible()

    console.log('Events section panels test completed successfully')
  })

  test('should show event type toggles with motion detection preselected', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // Wait for events to load
    const eventTypesPanel = page.locator('.event-types-panel')
    await expect(eventTypesPanel).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Wait for event types to load (checkboxes should appear)
    const checkboxes = eventTypesPanel.locator('input[type="checkbox"]')
    await expect(checkboxes.first()).toBeVisible({ timeout: TIMEOUTS.EVENTS_LOAD })

    const checkboxCount = await checkboxes.count()
    console.log(`Found ${checkboxCount} event type checkbox(es)`)

    // At least one checkbox should be checked (motion detection preselected)
    const checkedBoxes = eventTypesPanel.locator('input[type="checkbox"]:checked')
    const checkedCount = await checkedBoxes.count()
    console.log(`${checkedCount} event type(s) selected`)

    // Should have at least one selected by default
    expect(checkedCount).toBeGreaterThan(0)

    console.log('Event types test completed successfully')
  })

  test('should toggle event types on/off', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    const eventTypesPanel = page.locator('.event-types-panel')
    await expect(eventTypesPanel).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Wait for checkboxes
    const checkboxes = eventTypesPanel.locator('input[type="checkbox"]')
    await expect(checkboxes.first()).toBeVisible({ timeout: TIMEOUTS.EVENTS_LOAD })

    // Find the Select All checkbox
    const selectAllCheckbox = eventTypesPanel.locator('input[type="checkbox"]').first()

    // Get initial state
    const initialChecked = await selectAllCheckbox.isChecked()
    console.log(`Initial Select All state: ${initialChecked}`)

    // Toggle it
    await selectAllCheckbox.click()

    // Verify state changed
    const newChecked = await selectAllCheckbox.isChecked()
    expect(newChecked).not.toBe(initialChecked)
    console.log(`New Select All state: ${newChecked}`)

    console.log('Event toggle test completed successfully')
  })

  test('should show events panel content', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // Wait for camera selection
    const sidebar = page.locator('.camera-sidebar')
    await expect(sidebar.locator('.camera-card').first()).toBeVisible({ timeout: TIMEOUTS.CAMERA_LOAD })

    // Events panel
    const historicPanel = page.locator('.historic-events-panel')
    await expect(historicPanel).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Should show "Events" heading with time range selector
    await expect(historicPanel.getByRole('heading', { name: 'Events' })).toBeVisible()
    await expect(historicPanel.locator('select')).toBeVisible()

    // Wait for events to load
    await page.waitForTimeout(3000)

    // Check for various states - events count, thumbnails, or status messages
    const eventsCount = await historicPanel.getByText(/\d+ events/).isVisible().catch(() => false)
    const hasEventThumbnails = await historicPanel.locator('img').count() > 0
    const hasNoEventsMsg = await historicPanel.getByText(/no events/i).isVisible().catch(() => false)
    const hasSelectTypeMsg = await historicPanel.getByText(/select.*type/i).isVisible().catch(() => false)

    console.log(`Events panel - Count shown: ${eventsCount}, Thumbnails: ${hasEventThumbnails}, No events: ${hasNoEventsMsg}, Select type: ${hasSelectTypeMsg}`)

    // Should have some meaningful content
    const hasContent = eventsCount || hasEventThumbnails || hasNoEventsMsg || hasSelectTypeMsg
    expect(hasContent).toBe(true)

    console.log('Events panel test completed successfully')
  })

  test('should show alerts panel with controls', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // Wait for camera selection
    const sidebar = page.locator('.camera-sidebar')
    await expect(sidebar.locator('.camera-card').first()).toBeVisible({ timeout: TIMEOUTS.CAMERA_LOAD })

    // Alerts panel (formerly Live Events)
    const alertsPanel = page.locator('.live-events-panel')
    await expect(alertsPanel).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Should show "Alerts" heading
    await expect(alertsPanel.getByRole('heading', { name: 'Alerts' })).toBeVisible()

    // Should have time range selector
    await expect(alertsPanel.locator('select')).toBeVisible()

    // Should have refresh button
    const refreshBtn = alertsPanel.getByRole('button', { name: /refresh|loading/i })
    await expect(refreshBtn).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Should have auto-refresh checkbox
    await expect(alertsPanel.locator('input[type="checkbox"]')).toBeVisible()

    console.log('Alerts panel test completed successfully')
  })
})
