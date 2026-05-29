import { Page, expect } from '@playwright/test'

/**
 * In dev-bypass mode the app injects the EEN token from build/runtime env on
 * load, so no login UI is involved. This helper navigates to a path and waits
 * for the authenticated home shell to render.
 */
export async function gotoAuthenticated(page: Page, path = '/'): Promise<void> {
  await page.goto(path)
  // The user button (firstName lastName) only renders when authenticated.
  await expect(page.locator('header button[title="View user info and API details"]'))
    .toBeVisible({ timeout: 30000 })
}

/** True when dev-bypass credentials are configured. */
export function hasDevToken(): boolean {
  return !!process.env.VITE_DEV_EEN_TOKEN && !!process.env.VITE_DEV_EEN_BASE_URL
}
