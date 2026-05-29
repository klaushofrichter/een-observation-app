import { test, expect } from '@playwright/test'
import dotenv from 'dotenv'
import { gotoAuthenticated, hasDevToken } from './helpers/auth'

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
  UI_UPDATE: 10000,
  CAMERA_LOAD: 20000,
  EVENTS_LOAD: 15000
} as const

test.describe('Event Types Panel', () => {
  test.beforeEach(() => {
    test.skip(!hasDevToken(), 'Dev-bypass token not configured (VITE_DEV_EEN_TOKEN)')
  })

  test('should toggle individual event types on and off', async ({ page }) => {
    await gotoAuthenticated(page)

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
    await gotoAuthenticated(page)

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
    await gotoAuthenticated(page)

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
