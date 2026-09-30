import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test('archive restores a trip and saved settings after clearing device data', async ({ page }) => {
  await page.goto('/garage')
  await page.getByLabel('Manufacturer').fill('Honda')
  await page.getByLabel('Model', { exact: true }).fill('CB350')
  await page.getByLabel('Nickname').fill('Archive bike')
  await page.getByRole('button', { name: 'Add motorcycle' }).click()
  await expect(page.getByRole('heading', { name: 'Archive bike' })).toBeVisible()

  await page.goto('/trips/new')
  await page.getByLabel('Trip name').fill('Archive journey')
  await page.getByLabel('Start location').fill('Chennai')
  await page.getByLabel('Destination', { exact: true }).fill('Pondicherry')
  await page.getByLabel('Motorcycle').selectOption({ label: 'Archive bike' })
  await page.getByRole('button', { name: 'Create trip' }).click()
  await expect(page.getByRole('heading', { name: 'Archive journey' })).toBeVisible()
  const tripId = new URL(page.url()).pathname.split('/').at(-1)

  await page.goto('/settings')
  await page.getByLabel('Distance display').selectOption('mi')
  await page.getByLabel('Temperature display').selectOption('F')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Settings saved.')).toBeVisible()

  const firstDownloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export archive' }).click()
  const firstDownload = await firstDownloadPromise
  const archivePath = (await firstDownload.path())!
  const archive = JSON.parse(await readFile(archivePath, 'utf8'))
  expect(archive.records.trips.map((trip: { id: string }) => trip.id)).toContain(tripId)
  expect(archive.records.settings).toHaveLength(1)
  await page.evaluate(() => { localStorage.setItem('myride-weather-test', 'cached location'); localStorage.setItem('unrelated-app-key', 'keep') })

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Clear device data' }).click()
  await expect(page.getByLabel('Distance display')).toHaveValue('km')
  await expect(page.getByLabel('Temperature display')).toHaveValue('C')
  expect(await page.evaluate(() => ({ myRide: localStorage.getItem('myride-weather-test'), unrelated: localStorage.getItem('unrelated-app-key') }))).toEqual({ myRide: null, unrelated: 'keep' })
  await page.goto(`/trips/${tripId}`)
  await expect(page.getByRole('heading', { name: 'Trip could not be loaded' })).toBeVisible()

  await page.goto('/settings')
  await page.locator('input[type="file"]').setInputFiles(archivePath)
  await expect(page.getByText(/records imported/)).toBeVisible()
  await expect(page.getByLabel('Distance display')).toHaveValue('mi')
  await expect(page.getByLabel('Temperature display')).toHaveValue('F')
  await page.goto(`/trips/${tripId}`)
  await expect(page.getByRole('heading', { name: 'Archive journey' })).toBeVisible()

  await page.goto('/settings')
  const secondDownloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export archive' }).click()
  const secondDownload = await secondDownloadPromise
  const restored = JSON.parse(await readFile((await secondDownload.path())!, 'utf8'))
  expect(restored.records.settings).toHaveLength(1)
  expect(restored.records.settings[0].id).toBe(archive.records.settings[0].id)
})
