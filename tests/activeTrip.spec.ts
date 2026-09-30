import { expect, test } from '@playwright/test'

test('only one journey can be active at a time', async ({ page, context }) => {
  await context.grantPermissions(['geolocation'], { origin: 'http://127.0.0.1:5173' })
  await context.setGeolocation({ latitude: 12.9716, longitude: 77.5946 })

  async function createTrip(title: string) {
    await page.goto('/trips/new')
    await page.getByLabel('Trip name').fill(title)
    await page.getByLabel('Start location').fill('Bengaluru')
    await page.getByLabel('Destination', { exact: true }).fill('Mysuru')
    await page.getByRole('button', { name: 'Create trip' }).click()
    await expect(page.getByRole('heading', { name: title })).toBeVisible()
    return new URL(page.url()).pathname.split('/').at(-1)!
  }

  const firstId = await createTrip('First ride')
  await page.getByRole('button', { name: 'Start trip' }).click()
  await expect(page.getByText('Active', { exact: true }).first()).toBeVisible()

  await page.goto('/trips/new')
  await page.getByLabel('Trip name').fill('Second ride')
  await page.getByLabel('Start location').fill('Chennai')
  await page.getByLabel('Destination', { exact: true }).fill('Pondicherry')
  await page.getByLabel('Status').selectOption('Active')
  await page.getByRole('button', { name: 'Create trip' }).click()
  await expect(page.getByText('End First ride before starting another trip.')).toBeVisible()

  await page.getByLabel('Status').selectOption('Planned')
  await page.getByRole('button', { name: 'Create trip' }).click()
  await expect(page.getByRole('heading', { name: 'Second ride' })).toBeVisible()
  const secondId = new URL(page.url()).pathname.split('/').at(-1)!
  await page.getByRole('button', { name: 'Start trip' }).click()
  await expect(page.getByText('End First ride before starting another trip.')).toBeVisible()
  await expect(page.getByText('Planned', { exact: true }).first()).toBeVisible()

  await page.goto(`/trips/${firstId}`)
  await page.getByRole('button', { name: 'End trip' }).click()
  await expect(page.getByText('Completed', { exact: true }).first()).toBeVisible()
  await page.goto(`/trips/${secondId}`)
  await page.getByRole('button', { name: 'Start trip' }).click()
  await expect(page.getByText('Active', { exact: true }).first()).toBeVisible()
})
