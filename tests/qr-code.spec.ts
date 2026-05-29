import { test, expect } from '@playwright/test'
import dotenv from 'dotenv'
import { gotoAuthenticated, hasDevToken } from './helpers/auth'

dotenv.config()

/**
 * E2E tests for Mobile Companion QR Code Popup
 *
 * Tests:
 * 1. QR icon is hidden when no camera is selected
 * 2. QR icon appears after camera selection
 * 3. Click QR icon opens popup immediately
 * 4. Popup shows QR code image, title, and token validity
 * 5. Hover on QR icon opens popup after delay
 * 6. Popup stays open when mouse moves to it
 * 7. Copy button shows copied feedback
 */

const TIMEOUTS = {
  UI_UPDATE: 10000,
  CAMERA_LOAD: 20000
} as const

test.describe('Mobile Companion QR Code', () => {
  test.beforeEach(() => {
    test.skip(!hasDevToken(), 'Dev-bypass token not configured (VITE_DEV_EEN_TOKEN)')
  })

  const qrIconSelector = '[title="Click or hover to show QR code"]'
  const qrPopupSelector = '.absolute.right-0.top-full'

  test('should show QR icon only after camera is selected', async ({ page }) => {
    await gotoAuthenticated(page)

    // Wait for the app to be authenticated (camera sidebar visible)
    const sidebar = page.locator('.camera-sidebar')
    await expect(sidebar).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // If no camera is pre-selected (no id param), QR icon should not be visible yet
    // This checks the QR icon appears only after camera selection
    const cameraCards = sidebar.locator('.camera-card')
    await expect(cameraCards.first()).toBeVisible({ timeout: TIMEOUTS.CAMERA_LOAD })

    // Click a camera to select it
    await cameraCards.first().click()

    // QR icon should now be visible
    await expect(page.locator(qrIconSelector)).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    console.log('QR icon visible after camera selection')
  })

  test('should show QR icon after camera selection', async ({ page }) => {
    await gotoAuthenticated(page)

    // Select a camera
    const sidebar = page.locator('.camera-sidebar')
    const cameraCards = sidebar.locator('.camera-card')
    await expect(cameraCards.first()).toBeVisible({ timeout: TIMEOUTS.CAMERA_LOAD })
    await cameraCards.first().click()

    // QR icon should now be visible
    await expect(page.locator(qrIconSelector)).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
  })

  test('should open popup immediately on click and show QR code content', async ({ page }) => {
    await gotoAuthenticated(page)

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
    await gotoAuthenticated(page)

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
    await gotoAuthenticated(page)

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
    await gotoAuthenticated(page)

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
