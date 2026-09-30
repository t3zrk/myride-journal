import { expect, test } from '@playwright/test'

test('replay keeps full GPS distance when map points are sampled', async ({ page }) => {
  await page.goto('/trips/new')
  await page.getByLabel('Trip name').fill('Winding replay')
  await page.getByLabel('Start location').fill('Start')
  await page.getByLabel('Destination', { exact: true }).fill('Finish')
  await page.getByRole('button', { name: 'Create trip' }).click()
  await expect(page.getByRole('heading', { name: 'Winding replay' })).toBeVisible()
  const tripId = new URL(page.url()).pathname.split('/').at(-1)!

  await page.evaluate((id) => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('myride-journal')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const database = open.result
      const transaction = database.transaction(['gpsPoints', 'photos'], 'readwrite')
      const store = transaction.objectStore('gpsPoints')
      const base = Date.parse('2026-01-01T00:00:00.000Z')
      for (let index = 0; index < 1002; index += 1) {
        const timestamp = new Date(base + index * 60_000).toISOString()
        store.put({
          id: crypto.randomUUID(), userId: 'local-rider', tripId: id,
          createdAt: timestamp, updatedAt: timestamp, syncStatus: 'pending',
          timestamp, latitude: index % 2 ? 0.01 : 0, longitude: index * 0.00001,
        })
      }
      const photoTime = new Date(base + 500 * 60_000).toISOString()
      transaction.objectStore('photos').put({
        id: crypto.randomUUID(), userId: 'local-rider', tripId: id,
        createdAt: photoTime, updatedAt: photoTime, syncStatus: 'pending',
        takenAt: photoTime, caption: 'Replay photo',
        dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l7sAAAAASUVORK5CYII=',
      })
      transaction.oncomplete = () => { database.close(); resolve() }
      transaction.onerror = () => { database.close(); reject(transaction.error) }
    }
  }), tripId)

  await page.goto(`/trips/${tripId}/replay`)
  await expect(page.getByRole('heading', { name: 'Winding replay' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Replay photo' })).toHaveCount(0)
  const slider = page.getByRole('slider', { name: 'Timeline position' })
  await slider.focus()
  await slider.press('End')
  const distance = await page.getByText('Distance', { exact: true }).locator('..').locator('dd').textContent()
  expect(Number(distance?.replace(/[^0-9.]/g, ''))).toBeGreaterThan(1000)
  await expect(page.getByText('Elapsed', { exact: true }).locator('..').locator('dd')).toHaveText('16 h 41 min')
  await expect(page.getByRole('img', { name: 'Replay photo' })).toBeVisible()
})
