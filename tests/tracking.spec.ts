import { expect, test } from '@playwright/test'

test('active GPS capture continues across pages and stops when the trip ends', async ({ page, context }) => {
  await context.grantPermissions(['geolocation'], { origin: 'http://127.0.0.1:5173' })
  await context.setGeolocation({ latitude: 12.9716, longitude: 77.5946 })
  await page.clock.install()
  await page.goto('/trips/new')
  await page.getByLabel('Trip name').fill('Continuous recording')
  await page.getByLabel('Start location').fill('Bengaluru')
  await page.getByLabel('Destination', { exact: true }).fill('Mysuru')
  await page.getByRole('button', { name: 'Create trip' }).click()
  await expect(page.getByRole('heading', { name: 'Continuous recording' })).toBeVisible()
  const tripId = new URL(page.url()).pathname.split('/').at(-1)!

  async function gpsCount() {
    return page.evaluate((id) => new Promise<number>((resolve, reject) => {
      const open = indexedDB.open('myride-journal')
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const database = open.result
        const request = database.transaction('gpsPoints', 'readonly').objectStore('gpsPoints').index('tripId').count(id)
        request.onsuccess = () => { database.close(); resolve(request.result) }
        request.onerror = () => { database.close(); reject(request.error) }
      }
    }), tripId)
  }

  await page.getByRole('button', { name: 'Start trip' }).click()
  await expect.poll(gpsCount).toBe(1)
  await page.getByRole('complementary', { name: 'Primary navigation' }).getByRole('link', { name: 'Garage' }).click()
  await expect(page.getByRole('heading', { name: 'Motorcycle Dossier' })).toBeVisible()
  await context.setGeolocation({ latitude: 12.9816, longitude: 77.6046 })
  await page.clock.fastForward(61_000)
  await expect.poll(gpsCount).toBe(2)

  await page.goto(`/trips/${tripId}`)
  await expect(page.getByRole('heading', { name: 'Continuous recording' })).toBeVisible()
  await expect(page.getByText('GPS distance').locator('..').locator('dd')).not.toHaveText('0 km')
  await page.getByRole('button', { name: 'End trip' }).click()
  await expect(page.getByText('Completed', { exact: true }).first()).toBeVisible()
  const finalCount = await gpsCount()
  await context.setGeolocation({ latitude: 12.9916, longitude: 77.6146 })
  await page.clock.fastForward(61_000)
  expect(await gpsCount()).toBe(finalCount)
})
