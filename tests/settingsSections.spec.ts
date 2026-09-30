import { expect, test } from '@playwright/test'

test('settings exposes recording, GPS, storage, and data controls', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (success) => success({
      coords: { latitude: 12.97, longitude: 77.59, accuracy: 7, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
      timestamp: Date.now(),
    })
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        estimate: async () => ({ usage: 2 * 1024 * 1024, quota: 100 * 1024 * 1024 }),
        persisted: async () => false,
        persist: async () => true,
      },
    })
  })
  await page.goto('/settings')

  for (const name of ['General', 'Units', 'Trip Recording', 'GPS', 'Fuel', 'Expenses', 'Notifications', 'Offline Storage', 'Sync', 'AI', 'Data Export', 'Data Import']) {
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  }
  await expect(page.getByLabel('GPS recording interval')).toHaveValue('60')
  await page.getByRole('button', { name: 'Check current location' }).click()
  await expect(page.getByText('Location available within 7 m.')).toBeVisible()
  await expect(page.getByText('2.0 MB')).toBeVisible()
  await expect(page.getByText('100.0 MB')).toBeVisible()
  await page.getByRole('button', { name: 'Request persistent storage' }).click()
  await expect(page.getByText('Persistent storage enabled.')).toBeVisible()
  await expect(page.getByText('Persistent', { exact: true })).toBeVisible()

  await page.getByLabel('Date display').selectOption('iso')
  await page.getByLabel('GPS recording interval').selectOption('120')
  await page.getByLabel('Safe range reserve %').fill('20')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Settings saved.')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Date display')).toHaveValue('iso')
  await expect(page.getByLabel('GPS recording interval')).toHaveValue('120')
  await expect(page.getByLabel('Safe range reserve %')).toHaveValue('20')

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('complementary', { name: 'Primary navigation' })).not.toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
})
