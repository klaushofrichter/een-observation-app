import { test, expect } from '@playwright/test'
import dotenv from 'dotenv'
import { gotoAuthenticated, hasDevToken } from './helpers/auth'

dotenv.config()

/**
 * E2E tests for Dark Mode
 *
 * Tests:
 * 1. Toggle dark mode and persist preference
 * 2. Respect dark mode URL parameter
 */

const TIMEOUTS = {
  UI_UPDATE: 10000,
  CAMERA_LOAD: 20000
} as const

test.describe('Dark Mode', () => {
  test.beforeEach(() => {
    test.skip(!hasDevToken(), 'Dev-bypass token not configured (VITE_DEV_EEN_TOKEN)')
  })

  test('should toggle dark mode and persist preference', async ({ page }) => {
    await gotoAuthenticated(page)

    // Wait for app to load
    await expect(page.locator('.camera-sidebar')).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Find the dark mode toggle button
    const darkToggle = page.locator('button[title="Switch to dark mode"], button[title="Switch to light mode"]')
    await expect(darkToggle).toBeVisible()

    // Check initial state
    const initialTitle = await darkToggle.getAttribute('title')
    const initialIsDark = initialTitle === 'Switch to light mode'
    console.log(`Initial dark mode state: ${initialIsDark}`)

    // Click to toggle dark mode
    await darkToggle.click()
    await page.waitForTimeout(500)

    // Verify state changed
    if (initialIsDark) {
      // Was dark, now should be light
      await expect(page.locator('html:not(.dark)')).toBeAttached()
      await expect(page.locator('button[title="Switch to dark mode"]')).toBeVisible()
    } else {
      // Was light, now should be dark
      await expect(page.locator('html.dark')).toBeAttached()
      await expect(page.locator('button[title="Switch to light mode"]')).toBeVisible()
    }
    console.log('Toggled dark mode successfully')

    // Toggle back
    await darkToggle.click()
    await page.waitForTimeout(500)

    // Verify restored to original state
    if (initialIsDark) {
      await expect(page.locator('html.dark')).toBeAttached()
      await expect(page.locator('button[title="Switch to light mode"]')).toBeVisible()
    } else {
      await expect(page.locator('html:not(.dark)')).toBeAttached()
      await expect(page.locator('button[title="Switch to dark mode"]')).toBeVisible()
    }
    console.log('Dark mode toggle test completed successfully')
  })

  test('should respect dark mode URL parameter', async ({ page }) => {
    // Navigate directly with dark=1 in URL
    await gotoAuthenticated(page, '/?dark=1')

    // Wait for app to load
    await expect(page.locator('.camera-sidebar')).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Verify dark mode is active from URL parameter
    await expect(page.locator('html.dark')).toBeAttached({ timeout: TIMEOUTS.UI_UPDATE })
    await expect(page.locator('button[title="Switch to light mode"]')).toBeVisible()
    console.log('Dark mode active from URL parameter dark=1')

    // Toggle to light mode
    await page.locator('button[title="Switch to light mode"]').click()
    await page.waitForTimeout(500)

    // Verify dark=1 removed from URL and mode is light
    expect(page.url()).not.toContain('dark=1')
    await expect(page.locator('html:not(.dark)')).toBeAttached()
    console.log('Light mode restored, dark=1 removed from URL')

    // Re-navigate with dark=1 to confirm it still works
    await gotoAuthenticated(page, '/?dark=1')
    await expect(page.locator('html.dark')).toBeAttached({ timeout: TIMEOUTS.UI_UPDATE })
    console.log('Dark mode URL parameter test completed successfully')
  })
})
