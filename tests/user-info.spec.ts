import { test, expect } from '@playwright/test'
import dotenv from 'dotenv'
import { gotoAuthenticated, hasDevToken } from './helpers/auth'

dotenv.config()

/**
 * E2E tests for User Info Modal
 *
 * Tests:
 * 1. Display base URL and copy it to clipboard
 * 2. Show and copy access token
 * 3. Display token expiration info
 */

const TIMEOUTS = {
  UI_UPDATE: 10000
} as const

async function openUserInfoModal(page: import('@playwright/test').Page): Promise<void> {
  const usernameButton = page.locator('header button[title="View user info and API details"]')
  await expect(usernameButton).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
  await usernameButton.click()
  await expect(page.getByRole('heading', { name: 'User Info' })).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
}

test.describe('User Info Modal', () => {
  test.beforeEach(() => {
    test.skip(!hasDevToken(), 'Dev-bypass token not configured (VITE_DEV_EEN_TOKEN)')
  })

  test('should display base URL and copy it to clipboard', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])

    await gotoAuthenticated(page)
    await openUserInfoModal(page)

    // Verify Base URL section is visible
    await expect(page.getByText('Base URL')).toBeVisible()

    // Find the base URL code element - it should contain a non-empty URL
    const baseUrlCode = page.locator('code').first()
    await expect(baseUrlCode).toBeVisible()
    const baseUrlText = await baseUrlCode.textContent()
    expect(baseUrlText).toBeTruthy()
    expect(baseUrlText!.length).toBeGreaterThan(0)
    console.log(`Base URL displayed: ${baseUrlText}`)

    // Click the copy button next to Base URL
    const copyBaseUrlBtn = page.getByTitle('Copy Base URL')
    await expect(copyBaseUrlBtn).toBeVisible()
    await copyBaseUrlBtn.click()

    // Verify copy feedback - title changes to "Copied!"
    await expect(page.getByTitle('Copied!').first()).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    console.log('Base URL copy test completed successfully')
  })

  test('should show and copy access token', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])

    await gotoAuthenticated(page)
    await openUserInfoModal(page)

    // Verify Access Token section is visible
    await expect(page.getByText('Access Token')).toBeVisible()

    // Token should be hidden by default (shows dots)
    const tokenCode = page.locator('code').nth(1)
    await expect(tokenCode).toBeVisible()
    const maskedText = await tokenCode.textContent()
    expect(maskedText).toContain('•')
    console.log('Token is masked by default')

    // Click "Show & Copy" button
    const showCopyBtn = page.getByRole('button', { name: /Show & Copy/i })
    await expect(showCopyBtn).toBeVisible()
    await showCopyBtn.click()

    // Verify token is revealed (no longer dots)
    await page.waitForTimeout(500)
    const revealedText = await tokenCode.textContent()
    expect(revealedText).not.toContain('•')
    expect(revealedText!.length).toBeGreaterThan(10)
    console.log('Token revealed successfully')

    // Verify copy feedback - button text changes
    const copiedOrCopy = page.getByRole('button', { name: /Copied!|^Copy$/i })
    await expect(copiedOrCopy).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    console.log('Access token show and copy test completed successfully')
  })

  test('should display token expiration info', async ({ page }) => {
    await gotoAuthenticated(page)
    await openUserInfoModal(page)

    // Verify expiration timestamp is shown
    await expect(page.getByText('Expires:')).toBeVisible()

    // Verify time remaining is displayed (non-empty text)
    await expect(page.getByText('Time remaining:')).toBeVisible()

    // Get the time remaining text to verify it's meaningful
    const timeRemainingText = await page.getByText('Time remaining:').textContent()
    expect(timeRemainingText).toBeTruthy()
    expect(timeRemainingText!.length).toBeGreaterThan('Time remaining:'.length)
    console.log(`Token expiration info: ${timeRemainingText}`)

    // Close modal
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: 'User Info' })).not.toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })
    console.log('Token expiration info test completed successfully')
  })
})
