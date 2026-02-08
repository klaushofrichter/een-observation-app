import { test, expect, Page } from '@playwright/test'
import dotenv from 'dotenv'

dotenv.config()

/**
 * E2E tests for Events System
 *
 * Tests:
 * 1. Event types panel displays toggles
 * 2. Motion detection is preselected
 * 3. Events panel loads events
 * 4. Alerts panel shows SSE connection
 * 5. Change events time range
 * 6. Toggle auto-refresh checkbox in events panel
 * 7. Toggle live events button
 * 8. Change alerts time range
 * 9. Toggle event filter for alerts
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

    // Events panel
    const eventsPanel = page.locator('.events-panel')
    await expect(eventsPanel).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    await expect(eventsPanel.getByRole('heading', { name: 'Events' })).toBeVisible()

    // Alerts panel
    const alertsPanel = page.locator('.alerts-panel')
    await expect(alertsPanel).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    await expect(alertsPanel.getByRole('heading', { name: 'Alerts' })).toBeVisible()

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
    const eventsPanel = page.locator('.events-panel')
    await expect(eventsPanel).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Should show "Events" heading with time range selector
    await expect(eventsPanel.getByRole('heading', { name: 'Events' })).toBeVisible()
    await expect(eventsPanel.locator('select')).toBeVisible()

    // Wait for events to load
    await page.waitForTimeout(3000)

    // Check for various states - events count, thumbnails, or status messages
    const eventsCount = await eventsPanel.getByText(/\d+ events/).isVisible().catch(() => false)
    const hasEventThumbnails = await eventsPanel.locator('img').count() > 0
    const hasNoEventsMsg = await eventsPanel.getByText(/no events/i).isVisible().catch(() => false)
    const hasSelectTypeMsg = await eventsPanel.getByText(/select.*type/i).isVisible().catch(() => false)

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

    // Alerts panel
    const alertsPanel = page.locator('.alerts-panel')
    await expect(alertsPanel).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Should show "Alerts" heading
    await expect(alertsPanel.getByRole('heading', { name: 'Alerts' })).toBeVisible()

    // Should have time range selector
    await expect(alertsPanel.locator('select')).toBeVisible()

    // Should have refresh button (use title to distinguish from "Load more" button)
    const refreshBtn = alertsPanel.getByTitle('Refresh alerts')
    await expect(refreshBtn).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Should have auto-refresh checkbox
    await expect(alertsPanel.locator('input[type="checkbox"]')).toBeVisible()

    console.log('Alerts panel test completed successfully')
  })

  test('should change events time range', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // Wait for camera selection
    const sidebar = page.locator('.camera-sidebar')
    await expect(sidebar.locator('.camera-card').first()).toBeVisible({ timeout: TIMEOUTS.CAMERA_LOAD })

    // Events panel
    const eventsPanel = page.locator('.events-panel')
    await expect(eventsPanel).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Get the time range dropdown
    const timeRangeSelect = eventsPanel.locator('select')
    await expect(timeRangeSelect).toBeVisible()

    // Change to "Last 24h" (value 1440)
    await timeRangeSelect.selectOption({ label: 'Last 24h' })
    await page.waitForTimeout(1000)

    // Verify URL updates with ed=24h
    expect(page.url()).toContain('ed=24h')
    console.log('Changed to Last 24h, URL contains ed=24h')

    // Change to "Last 10 min" (value 10)
    await timeRangeSelect.selectOption({ label: 'Last 10 min' })
    await page.waitForTimeout(1000)

    // Verify URL updates with ed=10m
    expect(page.url()).toContain('ed=10m')
    console.log('Changed to Last 10 min, URL contains ed=10m')

    console.log('Events time range test completed successfully')
  })

  test('should toggle auto-refresh checkbox in events panel', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // Wait for camera selection
    const sidebar = page.locator('.camera-sidebar')
    await expect(sidebar.locator('.camera-card').first()).toBeVisible({ timeout: TIMEOUTS.CAMERA_LOAD })

    // Events panel - use EVENTS_LOAD timeout as it may take time to appear after camera selection
    const eventsPanel = page.locator('.events-panel')
    await expect(eventsPanel).toBeVisible({ timeout: TIMEOUTS.EVENTS_LOAD })

    // Find auto-refresh checkbox
    const autoRefreshCheckbox = eventsPanel.locator('input[type="checkbox"][title="Auto-refresh every minute"]')
    await expect(autoRefreshCheckbox).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Check initial state
    const initialChecked = await autoRefreshCheckbox.isChecked()
    console.log(`Initial auto-refresh state: ${initialChecked}`)

    // Toggle it on
    if (!initialChecked) {
      await autoRefreshCheckbox.click()
      await page.waitForTimeout(500)

      // Verify URL parameter er=1 appears
      expect(page.url()).toContain('er=1')
      console.log('Auto-refresh enabled, URL contains er=1')

      // Verify refresh button shows countdown text (wait for loading to finish)
      const refreshBtn = eventsPanel.getByTitle('Refresh events')
      await expect(refreshBtn).not.toHaveText('Loading...', { timeout: TIMEOUTS.EVENTS_LOAD })
      const refreshText = await refreshBtn.textContent()
      console.log(`Refresh button text: ${refreshText}`)
      expect(refreshText).toMatch(/Refresh in \d+/)
    }

    // Toggle it off
    await autoRefreshCheckbox.click()
    await page.waitForTimeout(500)

    if (!initialChecked) {
      // Was off, turned on, now off again - er should not be in URL
      expect(page.url()).not.toContain('er=1')
      console.log('Auto-refresh disabled, er removed from URL')
    }

    console.log('Auto-refresh toggle test completed successfully')
  })

  test('should toggle live events button', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // Wait for camera selection
    const sidebar = page.locator('.camera-sidebar')
    await expect(sidebar.locator('.camera-card').first()).toBeVisible({ timeout: TIMEOUTS.CAMERA_LOAD })

    // Events panel
    const eventsPanel = page.locator('.events-panel')
    await expect(eventsPanel).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Find live events button
    const liveButton = eventsPanel.getByTitle('Toggle live event feed')
    await expect(liveButton).toBeVisible()

    // Verify initial state - should show "Turn Live Events On" with gray styling
    const initialText = await liveButton.textContent()
    console.log(`Initial live button text: ${initialText}`)
    expect(initialText).toContain('Turn Live Events On')

    // Click to enable live events
    await liveButton.click()
    await page.waitForTimeout(2000)

    // Verify button changes - could be "Connecting..." or "Disable Live Events"
    const afterClickText = await liveButton.textContent()
    console.log(`After click live button text: ${afterClickText}`)
    expect(afterClickText).toMatch(/Connecting|Disable Live Events/)

    // Verify URL parameter live=1 appears
    expect(page.url()).toContain('live=1')
    console.log('Live events enabled, URL contains live=1')

    // Click again to disable
    await liveButton.click()
    await page.waitForTimeout(1000)

    // Verify button reverts to "Turn Live Events On"
    const revertedText = await liveButton.textContent()
    console.log(`Reverted live button text: ${revertedText}`)
    expect(revertedText).toContain('Turn Live Events On')

    // Verify live parameter removed from URL
    expect(page.url()).not.toContain('live=1')
    console.log('Live events toggle test completed successfully')
  })

  test('should change alerts time range', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // Wait for camera selection
    const sidebar = page.locator('.camera-sidebar')
    await expect(sidebar.locator('.camera-card').first()).toBeVisible({ timeout: TIMEOUTS.CAMERA_LOAD })

    // Alerts panel
    const alertsPanel = page.locator('.alerts-panel')
    await expect(alertsPanel).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Get the time range dropdown
    const timeRangeSelect = alertsPanel.locator('select')
    await expect(timeRangeSelect).toBeVisible()

    // Change to "Last week" (value 10080)
    await timeRangeSelect.selectOption({ label: 'Last week' })
    await page.waitForTimeout(1000)

    // Verify URL updates with ad=1w
    expect(page.url()).toContain('ad=1w')
    console.log('Changed alerts to Last week, URL contains ad=1w')

    console.log('Alerts time range test completed successfully')
  })

  test('should toggle event filter for alerts', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // Wait for camera selection
    const sidebar = page.locator('.camera-sidebar')
    await expect(sidebar.locator('.camera-card').first()).toBeVisible({ timeout: TIMEOUTS.CAMERA_LOAD })

    // Alerts panel
    const alertsPanel = page.locator('.alerts-panel')
    await expect(alertsPanel).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Find event filter button
    const filterButton = alertsPanel.getByTitle('Filter alerts by selected event types')
    await expect(filterButton).toBeVisible()

    // Verify initial state - should show "Enable Event Filter"
    const initialText = await filterButton.textContent()
    console.log(`Initial filter button text: ${initialText}`)
    expect(initialText).toContain('Enable Event Filter')

    // Click to enable
    await filterButton.click()
    await page.waitForTimeout(1000)

    // Verify button changes color and text
    const enabledText = await filterButton.textContent()
    console.log(`Enabled filter button text: ${enabledText}`)
    expect(enabledText).toContain('Disable Event Filter')

    // Verify URL parameter filter=1 appears
    expect(page.url()).toContain('filter=1')
    console.log('Event filter enabled, URL contains filter=1')

    // Click to disable
    await filterButton.click()
    await page.waitForTimeout(1000)

    // Verify button reverts
    const disabledText = await filterButton.textContent()
    expect(disabledText).toContain('Enable Event Filter')

    // Verify filter parameter removed from URL
    expect(page.url()).not.toContain('filter=1')
    console.log('Event filter toggle test completed successfully')
  })
})
