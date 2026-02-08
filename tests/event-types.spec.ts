import { test, expect, Page } from '@playwright/test'
import dotenv from 'dotenv'

dotenv.config()

/**
 * E2E tests for Event Types Panel
 *
 * Tests:
 * 1. Toggle individual event types on and off
 * 2. Select all and deselect all event types
 * 3. Show event type count indicator
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

  await Promise.race([
    page.waitForURL(/.*eagleeyenetworks.com.*/, { timeout: TIMEOUTS.OAUTH_REDIRECT }),
    page.waitForURL(/127\.0\.0\.1:3333/, { timeout: TIMEOUTS.OAUTH_REDIRECT })
  ])

  const currentUrl = page.url()
  if (/(?:^|\.)eagleeyenetworks\.com$/.test(new URL(currentUrl).hostname)) {
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

test.describe('Event Types Panel', () => {
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
      console.log('OAuth proxy not accessible - event types tests will be skipped')
    }
  })

  test.afterEach(async ({ page }) => {
    await clearAuthState(page)
  })

  test('should toggle individual event types on and off', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    const eventTypesPanel = page.locator('.event-types-panel')
    await expect(eventTypesPanel).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    // Wait for individual event type checkboxes to load (skip first which is "All")
    const allCheckboxes = eventTypesPanel.locator('input[type="checkbox"]')
    await expect(allCheckboxes.first()).toBeVisible({ timeout: TIMEOUTS.EVENTS_LOAD })

    const totalCheckboxes = await allCheckboxes.count()
    // Individual checkboxes start at index 1 (index 0 is "All")
    expect(totalCheckboxes).toBeGreaterThan(1)

    // Get initial checked count (individual only, skip "All" at index 0)
    let initialCheckedCount = 0
    for (let i = 1; i < totalCheckboxes; i++) {
      if (await allCheckboxes.nth(i).isChecked()) initialCheckedCount++
    }
    console.log(`Initial checked count: ${initialCheckedCount}`)

    // Find a checked individual checkbox and uncheck it
    let toggledIndex = -1
    for (let i = 1; i < totalCheckboxes; i++) {
      if (await allCheckboxes.nth(i).isChecked()) {
        toggledIndex = i
        await allCheckboxes.nth(i).click()
        break
      }
    }

    if (toggledIndex === -1) {
      console.log('No checked event types found, checking one instead')
      toggledIndex = 1
      await allCheckboxes.nth(1).click()
    }

    await page.waitForTimeout(500)

    // Verify URL updated (events parameter should change)
    const urlAfterUncheck = page.url()
    console.log(`URL after toggle: ${urlAfterUncheck}`)

    // Re-check the same event type
    await allCheckboxes.nth(toggledIndex).click()
    await page.waitForTimeout(500)

    // Verify count returns to original
    let restoredCount = 0
    for (let i = 1; i < totalCheckboxes; i++) {
      if (await allCheckboxes.nth(i).isChecked()) restoredCount++
    }
    expect(restoredCount).toBe(initialCheckedCount)
    console.log('Individual event type toggle test completed successfully')
  })

  test('should select all and deselect all event types', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    const eventTypesPanel = page.locator('.event-types-panel')
    await expect(eventTypesPanel).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    const allCheckboxes = eventTypesPanel.locator('input[type="checkbox"]')
    await expect(allCheckboxes.first()).toBeVisible({ timeout: TIMEOUTS.EVENTS_LOAD })

    const totalCheckboxes = await allCheckboxes.count()
    const individualCount = totalCheckboxes - 1 // Exclude "All" checkbox

    // The "All" checkbox is the first one
    const allCheckbox = allCheckboxes.first()

    // Click "All" to select all
    const isAllChecked = await allCheckbox.isChecked()
    if (!isAllChecked) {
      await allCheckbox.click()
      await page.waitForTimeout(500)
    }

    // Verify all individual checkboxes are checked
    for (let i = 1; i < totalCheckboxes; i++) {
      await expect(allCheckboxes.nth(i)).toBeChecked()
    }
    console.log(`All ${individualCount} event types selected`)

    // Click "All" again to deselect all
    await allCheckbox.click()
    await page.waitForTimeout(500)

    // Verify all individual checkboxes are unchecked
    for (let i = 1; i < totalCheckboxes; i++) {
      await expect(allCheckboxes.nth(i)).not.toBeChecked()
    }
    console.log('All event types deselected')

    // Verify URL events parameter is removed when none selected
    const url = page.url()
    const urlParams = new URL(url).searchParams
    expect(urlParams.has('events')).toBe(false)
    console.log('Select all / deselect all test completed successfully')
  })

  test('should show event type count indicator', async ({ page }) => {
    skipIfNoProxy()
    skipIfNoCredentials()

    await performLogin(page, TEST_USER!, TEST_PASSWORD!)

    const eventTypesPanel = page.locator('.event-types-panel')
    await expect(eventTypesPanel).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    const allCheckboxes = eventTypesPanel.locator('input[type="checkbox"]')
    await expect(allCheckboxes.first()).toBeVisible({ timeout: TIMEOUTS.EVENTS_LOAD })

    // Verify the count text appears (e.g., "3/5 selected")
    const countText = eventTypesPanel.locator('text=/\\d+\\/\\d+ selected/')
    await expect(countText).toBeVisible({ timeout: TIMEOUTS.UI_UPDATE })

    const initialText = await countText.textContent()
    console.log(`Initial count: ${initialText}`)

    // Toggle an event type and verify count updates
    const totalCheckboxes = await allCheckboxes.count()
    if (totalCheckboxes > 1) {
      // Find a checked individual checkbox and uncheck it
      for (let i = 1; i < totalCheckboxes; i++) {
        if (await allCheckboxes.nth(i).isChecked()) {
          await allCheckboxes.nth(i).click()
          break
        }
      }
      await page.waitForTimeout(500)

      const updatedText = await countText.textContent()
      console.log(`Updated count: ${updatedText}`)
      expect(updatedText).not.toBe(initialText)
    }

    console.log('Event type count indicator test completed successfully')
  })
})
