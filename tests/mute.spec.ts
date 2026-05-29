import { test, expect } from '@playwright/test'
import dotenv from 'dotenv'
import { gotoAuthenticated, hasDevToken } from './helpers/auth'

dotenv.config()

/**
 * E2E tests for Mute Toggle
 *
 * Tests:
 * 1. Toggle mute and verify icon/title changes
 * 2. Verify mute=1 URL parameter appears/disappears
 * 3. Verify mute URL parameter is respected on fresh navigation
 */

const TIMEOUTS = {
  UI_UPDATE: 10000
} as const

test.describe('Mute Toggle', () => {
  test.beforeEach(() => {
    test.skip(!hasDevToken(), 'Dev-bypass token not configured (VITE_DEV_EEN_TOKEN)')
  })

  test('should toggle mute and verify icon/title changes', async ({ page }) => {
    await gotoAuthenticated(page)

    // Wait for app to load
    await expect(page.locator('.camera-sidebar')).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Find the mute toggle button (initially unmuted)
    const muteToggle = page.locator('button[title="Sound is on"], button[title="Sound is muted"]')
    await expect(muteToggle).toBeVisible()

    // Verify initial state is unmuted
    await expect(page.locator('button[title="Sound is on"]')).toBeVisible()
    console.log('Initial mute state: unmuted (Sound is on)')

    // Click to mute
    await muteToggle.click()
    await page.waitForTimeout(500)

    // Verify muted state
    await expect(page.locator('button[title="Sound is muted"]')).toBeVisible()
    console.log('Toggled to muted state')

    // Click to unmute
    await page.locator('button[title="Sound is muted"]').click()
    await page.waitForTimeout(500)

    // Verify unmuted state restored
    await expect(page.locator('button[title="Sound is on"]')).toBeVisible()
    console.log('Toggled back to unmuted state')
    console.log('Mute toggle test completed successfully')
  })

  test('should add and remove mute=1 URL parameter', async ({ page }) => {
    await gotoAuthenticated(page)
    await expect(page.locator('.camera-sidebar')).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Initially unmuted - URL should not contain mute=1
    expect(page.url()).not.toContain('mute=1')

    // Click to mute
    const muteToggle = page.locator('button[title="Sound is on"]')
    await expect(muteToggle).toBeVisible()
    await muteToggle.click()
    await page.waitForTimeout(500)

    // Verify URL contains mute=1
    expect(page.url()).toContain('mute=1')
    console.log('Mute enabled, URL contains mute=1')

    // Click to unmute
    await page.locator('button[title="Sound is muted"]').click()
    await page.waitForTimeout(500)

    // Verify mute=1 removed from URL
    expect(page.url()).not.toContain('mute=1')
    console.log('Mute disabled, mute=1 removed from URL')
    console.log('Mute URL parameter test completed successfully')
  })

  test('should respect mute URL parameter on fresh navigation', async ({ page }) => {
    // Navigate directly with mute=1 in URL
    await gotoAuthenticated(page, '/?mute=1')
    await expect(page.locator('.camera-sidebar')).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Verify mute is active from URL parameter
    await expect(page.locator('button[title="Sound is muted"]')).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    console.log('Mute active from URL parameter mute=1')

    // Unmute to verify toggle works
    await page.locator('button[title="Sound is muted"]').click()
    await page.waitForTimeout(500)

    // Verify mute=1 removed from URL
    expect(page.url()).not.toContain('mute=1')
    await expect(page.locator('button[title="Sound is on"]')).toBeVisible()
    console.log('Mute URL parameter test completed successfully')
  })
})
