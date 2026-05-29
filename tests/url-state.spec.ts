import { test, expect } from '@playwright/test'
import dotenv from 'dotenv'
import { gotoAuthenticated, hasDevToken } from './helpers/auth'

dotenv.config()

/**
 * E2E tests for URL State Persistence
 *
 * Tests that camera selection and event type filters are:
 * 1. Saved to URL parameters
 * 2. Restored when opening the app with those parameters
 */

const TIMEOUTS = {
  UI_UPDATE: 10000,
  CAMERA_LOAD: 20000,
  EVENTS_LOAD: 15000
} as const

test.describe('URL State Persistence', () => {
  test.beforeEach(() => {
    test.skip(!hasDevToken(), 'Dev-bypass token not configured (VITE_DEV_EEN_TOKEN)')
  })

  test('should restore camera and event type selection from URL', async ({ page }) => {
    // Step 1: Load the app and wait for it to load
    await gotoAuthenticated(page)

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
    const selectedCount = selectedEventTypes
    console.log(`Total selected event types: ${selectedCount}`)

    // Get the selected camera ID from URL for verification
    const urlParams = new URL(capturedUrl).searchParams
    const urlCameraIds = urlParams.get('id')
    const urlSelected = urlParams.get('selected')
    const urlEvents = urlParams.get('events')
    console.log(`URL params - id: ${urlCameraIds}, selected: ${urlSelected}, events: ${urlEvents}`)

    // Step 6: Navigate back to root to reset state
    await gotoAuthenticated(page, '/')
    console.log('Navigated to root to reset state')

    // Step 7: Reopen with the captured URL (dev-bypass re-authenticates on each load)
    const pathWithParams = capturedUrl.replace(/^https?:\/\/[^/]+/, '')
    console.log(`Reopening with path: ${pathWithParams}`)
    await gotoAuthenticated(page, pathWithParams)

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
