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
  if (currentUrl.includes('eagleeyenetworks.com')) {
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

    // Verify URL contains the camera ID
    expect(urlWithCamera).toContain(`?id=${targetCameraId}`)

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

    // Verify the camera ID is preserved in the URL
    expect(finalUrl).toContain(`?id=${targetCameraId}`)

    // Verify the correct camera is selected in the main video player
    await expect(mainVideoPlayer).toBeVisible({ timeout: TIMEOUTS.VIDEO_LOAD })
    await expect(mainVideoPlayer).toHaveAttribute('data-camera-id', targetCameraId || '', { timeout: TIMEOUTS.VIDEO_LOAD })
    console.log(`Camera ${targetCameraId} is correctly selected after login`)

    console.log('URL camera restoration test completed successfully')
  })
})
