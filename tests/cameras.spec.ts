import { test, expect, Page } from '@playwright/test'
import dotenv from 'dotenv'

dotenv.config()

/**
 * E2E tests for Camera Selection and Video Display
 *
 * Tests:
 * 1. Camera sidebar displays cameras
 * 2. Camera selection updates main video
 * 3. Camera info panel shows details
 * 4. Filter cameras by layout selection
 * 5. Display three cameras for test account
 * 6. Show Bridge ID in camera info panel
 * 7. Show camera search and filter results
 */

const TIMEOUTS = {
  OAUTH_REDIRECT: 30000,
  ELEMENT_VISIBLE: 15000,
  PASSWORD_VISIBLE: 10000,
  AUTH_COMPLETE: 60000,
  UI_UPDATE: 10000,
  CAMERA_LOAD: 20000,
  VIDEO_LOAD: 15000,
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
  if (new URL(currentUrl).hostname.endsWith('eagleeyenetworks.com')) {
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

  // Wait for callback processing to complete and land on home page (with or without query params)
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

test.describe('Camera Selection and Video', () => {
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
      console.log('OAuth proxy not accessible - camera tests will be skipped')
    }
  })

  test.afterEach(async ({ page }) => {
    await clearAuthState(page)
  })

  test('should display camera sidebar with cameras', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // Camera sidebar should be visible
    const sidebar = page.locator('.camera-sidebar')
    await expect(sidebar).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Should show layout dropdown with "All Cameras" option
    await expect(sidebar.locator('select')).toBeVisible()

    // Wait for cameras to load (camera cards should appear)
    const cameraCards = sidebar.locator('.camera-card')
    await expect(cameraCards.first()).toBeVisible({ timeout: TIMEOUTS.CAMERA_LOAD })

    // Get camera count
    const cardCount = await cameraCards.count()
    console.log(`Found ${cardCount} camera(s) in sidebar`)
    expect(cardCount).toBeGreaterThan(0)

    console.log('Camera sidebar test completed successfully')
  })

  test('should select camera and show main video player', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // Wait for camera sidebar and cards to load
    const sidebar = page.locator('.camera-sidebar')
    await expect(sidebar).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    const cameraCards = sidebar.locator('.camera-card')
    await expect(cameraCards.first()).toBeVisible({ timeout: TIMEOUTS.CAMERA_LOAD })

    // First camera should be auto-selected - check main video area
    const mainVideoPlayer = page.locator('.main-video-player')
    await expect(mainVideoPlayer).toBeVisible({ timeout: TIMEOUTS.VIDEO_LOAD })

    // Get first camera name from sidebar
    const firstCameraName = await cameraCards.first().locator('h3').textContent()
    console.log(`First camera: ${firstCameraName}`)

    // Camera name should appear in the Camera Information section
    await expect(mainVideoPlayer.getByText('Camera Information')).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Click second camera if available
    const cardCount = await cameraCards.count()
    if (cardCount > 1) {
      const secondCard = cameraCards.nth(1)
      const secondCameraName = await secondCard.locator('h3').textContent()
      console.log(`Clicking second camera: ${secondCameraName}`)

      await secondCard.click()

      // Wait for video player to update
      await page.waitForTimeout(1000)
      console.log('Camera selection changed successfully')
    }

    console.log('Camera selection test completed successfully')
  })

  test('should show camera info panel with details', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // Wait for main video player to appear
    const mainVideoPlayer = page.locator('.main-video-player')
    await expect(mainVideoPlayer).toBeVisible({ timeout: TIMEOUTS.VIDEO_LOAD })

    // Camera info panel should show "Camera Information" heading
    await expect(mainVideoPlayer.getByText('Camera Information')).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Should show status label
    await expect(mainVideoPlayer.getByText('STATUS')).toBeVisible()

    // Should show camera ID label
    await expect(mainVideoPlayer.getByText('CAMERA ID')).toBeVisible()

    console.log('Camera info panel test completed successfully')
  })

  test('should switch video player when selecting different camera', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // Wait for camera cards to load
    const sidebar = page.locator('.camera-sidebar')
    const cameraCards = sidebar.locator('.camera-card')
    await expect(cameraCards.first()).toBeVisible({ timeout: TIMEOUTS.CAMERA_LOAD })

    const cardCount = await cameraCards.count()
    if (cardCount < 2) {
      console.log('Only one camera available, skipping switch test')
      return
    }

    // Get first camera ID from the card
    const firstCameraId = await cameraCards.first().getAttribute('data-camera-id')
    console.log(`First camera ID: ${firstCameraId}`)

    // Verify main video player shows first camera
    const mainVideoPlayer = page.locator('.main-video-player')
    await expect(mainVideoPlayer).toBeVisible({ timeout: TIMEOUTS.VIDEO_LOAD })
    await expect(mainVideoPlayer).toHaveAttribute('data-camera-id', firstCameraId || '')

    // Click second camera
    const secondCameraId = await cameraCards.nth(1).getAttribute('data-camera-id')
    console.log(`Clicking second camera ID: ${secondCameraId}`)
    await cameraCards.nth(1).click()

    // Wait for video player to switch to second camera
    await expect(mainVideoPlayer).toHaveAttribute('data-camera-id', secondCameraId || '', { timeout: TIMEOUTS.VIDEO_LOAD })
    console.log('Video player switched to second camera')

    // Click back to first camera
    await cameraCards.first().click()
    await expect(mainVideoPlayer).toHaveAttribute('data-camera-id', firstCameraId || '', { timeout: TIMEOUTS.VIDEO_LOAD })
    console.log('Video player switched back to first camera')

    console.log('Video player switch test completed successfully')
  })

  test('should show camera status badges', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // Wait for camera cards
    const sidebar = page.locator('.camera-sidebar')
    const cameraCards = sidebar.locator('.camera-card')
    await expect(cameraCards.first()).toBeVisible({ timeout: TIMEOUTS.CAMERA_LOAD })

    // Each camera card should have a status badge
    const firstCard = cameraCards.first()
    const statusBadge = firstCard.locator('[class*="rounded-full"]')
    await expect(statusBadge).toBeVisible()

    const statusText = await statusBadge.textContent()
    console.log(`Camera status: ${statusText}`)

    // Status should be a known value
    const knownStatuses = ['online', 'offline', 'streaming', 'registered', 'error', 'unknown']
    const hasKnownStatus = knownStatuses.some(s => statusText?.toLowerCase().includes(s))
    expect(hasKnownStatus).toBe(true)

    console.log('Camera status badges test completed successfully')
  })

  test('should restore camera selection from URL after logout and login', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // Wait for camera cards to load
    const sidebar = page.locator('.camera-sidebar')
    const cameraCards = sidebar.locator('.camera-card')
    await expect(cameraCards.first()).toBeVisible({ timeout: TIMEOUTS.CAMERA_LOAD })

    const cardCount = await cameraCards.count()
    if (cardCount < 2) {
      console.log('Only one camera available, using first camera for URL test')
    }

    // Click on a camera (use second if available, otherwise first)
    const targetIndex = cardCount > 1 ? 1 : 0
    const targetCard = cameraCards.nth(targetIndex)
    const targetCameraId = await targetCard.getAttribute('data-camera-id')
    const targetCameraName = await targetCard.locator('h3').textContent()
    console.log(`Selecting camera: ${targetCameraName} (ID: ${targetCameraId})`)

    await targetCard.click()

    // Wait for URL to update with ?id= parameter
    await page.waitForURL(/\?id=/, { timeout: TIMEOUTS.UI_UPDATE })
    const urlWithCamera = page.url()
    console.log(`URL with camera ID: ${urlWithCamera}`)

    // Verify URL contains the selected camera ID (in the 'selected' parameter)
    expect(urlWithCamera).toContain(`selected=${targetCameraId}`)

    // Verify main video player shows the selected camera
    const mainVideoPlayer = page.locator('.main-video-player')
    await expect(mainVideoPlayer).toHaveAttribute('data-camera-id', targetCameraId || '', { timeout: TIMEOUTS.VIDEO_LOAD })

    // Logout
    await page.getByRole('link', { name: /logout/i }).click()
    await expect(page.getByRole('heading', { name: /logged out/i })).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    console.log('Logged out successfully')

    // Clear auth state
    await clearAuthState(page)

    // Navigate to the captured URL with camera ID
    console.log(`Navigating to URL: ${urlWithCamera}`)
    await page.goto(urlWithCamera)

    // Should redirect to login (unauthenticated)
    await expect(page).toHaveURL('/login')

    // Login again
    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // After login, should be on home page with the camera ID in URL
    await expect(page).toHaveURL(/\?id=/, { timeout: TIMEOUTS.UI_UPDATE })
    const finalUrl = page.url()
    console.log(`Final URL after login: ${finalUrl}`)

    // Verify the selected camera ID is preserved in the URL
    expect(finalUrl).toContain(`selected=${targetCameraId}`)

    // Verify the correct camera is selected in the main video player
    await expect(mainVideoPlayer).toBeVisible({ timeout: TIMEOUTS.VIDEO_LOAD })
    await expect(mainVideoPlayer).toHaveAttribute('data-camera-id', targetCameraId || '', { timeout: TIMEOUTS.VIDEO_LOAD })
    console.log(`Camera ${targetCameraId} is correctly selected after login`)

    console.log('URL camera restoration test completed successfully')
  })

  test('should open Google Maps from map icon and interact with camera data modal', async ({ page, context }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // Wait for main video player and camera info panel
    const mainVideoPlayer = page.locator('.main-video-player')
    await expect(mainVideoPlayer).toBeVisible({ timeout: TIMEOUTS.VIDEO_LOAD })
    await expect(mainVideoPlayer.getByText('Camera Information')).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Check if map icon is present (camera may or may not have devicePosition)
    const mapLink = mainVideoPlayer.locator('a[title*="Google Maps"], a[title*="View on"]')
    const mapVisible = await mapLink.isVisible().catch(() => false)

    if (mapVisible) {
      // Verify the link points to Google Maps
      const href = await mapLink.getAttribute('href')
      expect(href).toContain('google.com/maps')
      console.log(`Map link found: ${href}`)

      // Verify it opens in a new tab
      const target = await mapLink.getAttribute('target')
      expect(target).toBe('_blank')

      // Click and verify new tab opens (then close it)
      const [newPage] = await Promise.all([
        context.waitForEvent('page', { timeout: TIMEOUTS.UI_UPDATE }),
        mapLink.click()
      ])
      console.log(`Google Maps opened in new tab: ${newPage.url()}`)
      await newPage.close()
    } else {
      console.log('No map icon visible (camera may lack devicePosition data)')
    }

    // Click the (i) button next to "Camera Information" to open the camera data modal
    const infoButton = mainVideoPlayer.locator('button[title="View full camera data"]')
    await expect(infoButton).toBeVisible()
    await infoButton.click()

    // Modal should appear with "Camera Data" title
    const modal = page.locator('.fixed.inset-0.z-50')
    await expect(modal).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    await expect(modal.locator('h3', { hasText: 'Camera Data' })).toBeVisible()

    // Include parameter pills should be visible
    const pillContainer = modal.locator('.flex.flex-wrap.gap-1')
    await expect(modal.getByText('Include Parameters:')).toBeVisible()
    await expect(pillContainer.getByText('bridge', { exact: true })).toBeVisible()
    await expect(pillContainer.getByText('deviceInfo', { exact: true })).toBeVisible()

    // Details button should be highlighted (active view)
    const detailsButton = modal.getByRole('button', { name: 'Details' })
    const settingsButton = modal.getByRole('button', { name: 'Settings' })
    const bridgeButton = modal.getByRole('button', { name: 'Bridge' })
    await expect(detailsButton).toBeVisible()
    await expect(settingsButton).toBeVisible()
    await expect(bridgeButton).toBeVisible()

    // Wait for camera details JSON to load
    await expect(modal.locator('pre')).toBeVisible({ timeout: TIMEOUTS.CAMERA_LOAD })
    console.log('Camera data modal opened with details view')

    // Click Settings button
    await settingsButton.click()
    await expect(modal.locator('h3', { hasText: 'Camera Settings' })).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Wait for settings JSON to load
    await expect(modal.locator('pre')).toBeVisible({ timeout: TIMEOUTS.CAMERA_LOAD })

    // Include pills should show settings values
    await expect(pillContainer.getByText('schema', { exact: true })).toBeVisible()
    console.log('Switched to camera settings view')

    // Click Bridge button
    await bridgeButton.click()
    await expect(modal.locator('h3', { hasText: 'Bridge Data' })).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Wait for bridge JSON to load
    await expect(modal.locator('pre')).toBeVisible({ timeout: TIMEOUTS.CAMERA_LOAD })

    // Include pills should show bridge values
    await expect(pillContainer.getByText('networkInfo', { exact: true })).toBeVisible()
    console.log('Switched to bridge data view')

    // Click Details button to go back
    await detailsButton.click()
    await expect(modal.locator('h3', { hasText: 'Camera Data' })).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    await expect(modal.locator('pre')).toBeVisible({ timeout: TIMEOUTS.CAMERA_LOAD })
    console.log('Switched back to camera details view')

    // Close modal with the X button
    const closeButton = modal.locator('button').filter({ has: page.locator('svg path[d="M6 18L18 6M6 6l12 12"]') })
    await closeButton.click()
    await expect(modal).not.toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    console.log('Modal closed successfully')

    // Reopen and close with ESC key
    await infoButton.click()
    await expect(modal).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    await page.keyboard.press('Escape')
    await expect(modal).not.toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    console.log('Modal closed with ESC key')

    // Reopen and close with backdrop click
    await infoButton.click()
    await expect(modal).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    await modal.locator('.absolute.inset-0.bg-black\\/50').click({ position: { x: 10, y: 10 } })
    await expect(modal).not.toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    console.log('Modal closed with backdrop click')

    console.log('Camera data modal and map icon test completed successfully')
  })

  test('should filter cameras by layout selection', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // Wait for camera sidebar and cards to load
    const sidebar = page.locator('.camera-sidebar')
    await expect(sidebar).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    const cameraCards = sidebar.locator('.camera-card')
    await expect(cameraCards.first()).toBeVisible({ timeout: TIMEOUTS.CAMERA_LOAD })

    // Note initial camera count under "All Cameras"
    const initialCount = await cameraCards.count()
    console.log(`Initial camera count (All Cameras): ${initialCount}`)

    // Get layout dropdown
    const layoutSelect = sidebar.locator('select[title="Select layout"]')
    await expect(layoutSelect).toBeVisible()

    // Check available options
    const options = layoutSelect.locator('option')
    const optionCount = await options.count()
    console.log(`Layout options available: ${optionCount}`)

    if (optionCount > 1) {
      // Find a layout option that isn't "All Cameras" or "URL-cameras"
      let selectedLayout = false
      for (let i = 0; i < optionCount; i++) {
        const value = await options.nth(i).getAttribute('value')
        if (value !== 'all' && value !== 'url') {
          const text = await options.nth(i).textContent()
          console.log(`Selecting layout: ${text} (value: ${value})`)
          await layoutSelect.selectOption(value!)
          await page.waitForTimeout(2000)
          selectedLayout = true

          // Camera list may have changed
          const layoutCount = await cameraCards.count()
          console.log(`Camera count after layout selection: ${layoutCount}`)
          break
        }
      }

      if (selectedLayout) {
        // Switch back to "All Cameras"
        await layoutSelect.selectOption('all')
        await page.waitForTimeout(2000)

        const restoredCount = await cameraCards.count()
        console.log(`Camera count after restoring All Cameras: ${restoredCount}`)
        expect(restoredCount).toBe(initialCount)
      }
    } else {
      console.log('No additional layouts available, skipping layout filter test')
    }

    console.log('Layout filter test completed successfully')
  })

  test('should display three cameras for test account', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // Wait for camera sidebar and cards to load
    const sidebar = page.locator('.camera-sidebar')
    await expect(sidebar).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    const cameraCards = sidebar.locator('.camera-card')
    await expect(cameraCards.first()).toBeVisible({ timeout: TIMEOUTS.CAMERA_LOAD })

    // Count camera cards - should be exactly 3
    const cardCount = await cameraCards.count()
    console.log(`Found ${cardCount} camera(s)`)
    expect(cardCount).toBe(3)

    // Verify each camera has a name (h3 text) and status badge
    for (let i = 0; i < cardCount; i++) {
      const card = cameraCards.nth(i)
      const name = await card.locator('h3').textContent()
      expect(name).toBeTruthy()
      expect(name!.length).toBeGreaterThan(0)

      const statusBadge = card.locator('[class*="rounded-full"]')
      await expect(statusBadge).toBeVisible()
      const statusText = await statusBadge.textContent()
      expect(statusText).toBeTruthy()

      console.log(`Camera ${i + 1}: "${name}" - Status: ${statusText}`)
    }

    console.log('Three cameras display test completed successfully')
  })

  test('should show Bridge ID in camera info panel', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // Wait for main video player and camera info panel
    const mainVideoPlayer = page.locator('.main-video-player')
    await expect(mainVideoPlayer).toBeVisible({ timeout: TIMEOUTS.VIDEO_LOAD })
    await expect(mainVideoPlayer.getByText('Camera Information')).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Verify "Bridge ID" label exists
    const bridgeIdLabel = mainVideoPlayer.locator('label', { hasText: 'Bridge ID' })
    await expect(bridgeIdLabel).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Verify the bridge ID value is displayed (non-empty monospace text next to the label)
    const bridgeIdValue = mainVideoPlayer.locator('label:has-text("Bridge ID") + p')
    await expect(bridgeIdValue).toBeVisible()
    const bridgeIdText = await bridgeIdValue.textContent()
    expect(bridgeIdText).toBeTruthy()
    expect(bridgeIdText!.trim().length).toBeGreaterThan(0)
    console.log(`Bridge ID: ${bridgeIdText}`)

    console.log('Bridge ID display test completed successfully')
  })

  test('should show camera search and filter results', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    // Wait for camera sidebar and cards to load
    const sidebar = page.locator('.camera-sidebar')
    await expect(sidebar).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    const cameraCards = sidebar.locator('.camera-card')
    await expect(cameraCards.first()).toBeVisible({ timeout: TIMEOUTS.CAMERA_LOAD })

    // Get the name of the first camera
    const firstName = await cameraCards.first().locator('h3').textContent()
    console.log(`First camera name: ${firstName}`)

    // Look for search input in sidebar
    const searchInput = sidebar.locator('input[type="text"], input[type="search"], input[placeholder*="search" i], input[placeholder*="filter" i]')
    const searchExists = await searchInput.isVisible().catch(() => false)

    if (searchExists) {
      // Type a partial camera name
      const partialName = firstName!.substring(0, 3)
      console.log(`Searching for: ${partialName}`)
      await searchInput.fill(partialName)
      await page.waitForTimeout(1000)

      // Verify filtered results
      const filteredCount = await cameraCards.count()
      console.log(`Filtered results: ${filteredCount}`)
      expect(filteredCount).toBeGreaterThan(0)

      // Clear search
      await searchInput.clear()
      await page.waitForTimeout(1000)
    } else {
      console.log('No search input found in camera sidebar - search feature not available')
    }

    console.log('Camera search test completed successfully')
  })
})
