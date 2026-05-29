import { test, expect } from '@playwright/test'
import dotenv from 'dotenv'
import { gotoAuthenticated, hasDevToken } from './helpers/auth'

dotenv.config()

test.describe('Authentication (Labs dev-bypass)', () => {
  test.beforeEach(() => {
    test.skip(!hasDevToken(), 'Dev-bypass token not configured (VITE_DEV_EEN_TOKEN)')
  })

  test('app loads authenticated and stores an EEN token', async ({ page }) => {
    await gotoAuthenticated(page)
    const token = await page.evaluate(() => localStorage.getItem('een_token'))
    expect(token).toBeTruthy()
  })

  test('unauthenticated load redirects to the Labs product page', async ({ page }) => {
    await page.addInitScript(() => localStorage.clear())
    await page.goto('/')
    await expect(
      page.locator('header button[title="View user info and API details"]')
    ).toHaveCount(0, { timeout: 5000 })
  })
})
