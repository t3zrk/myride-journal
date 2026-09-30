import { expect, test } from '@playwright/test'

test('trip location search is explicit and preserves manual text when lookup fails', async ({ page }) => {
  const requests: string[] = []
  await page.route(/nominatim\.openstreetmap\.org\/search/, async (route) => {
    const query = new URL(route.request().url()).searchParams.get('q') ?? ''
    requests.push(query)
    if (query === 'Chennai') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ display_name: 'Chennai, Tamil Nadu, India', lat: '13.0827', lon: '80.2707' }]) })
      return
    }
    if (query === 'Mahabalipuram') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ display_name: 'Mahabalipuram, Tamil Nadu, India', lat: '12.6208', lon: '80.1945' }]) })
      return
    }
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
  })

  await page.goto('/trips/new')
  await page.getByLabel('Start location').fill('Chennai')
  await expect.poll(() => requests.length).toBe(0)
  await page.getByRole('button', { name: 'Find origin' }).click()
  await page.getByRole('button', { name: 'Chennai, Tamil Nadu, India' }).click()
  await expect(page.getByLabel('Start location')).toHaveValue('Chennai, Tamil Nadu, India')
  await expect(page.getByLabel('Origin latitude')).toHaveValue('13.0827')
  await expect(page.getByLabel('Origin longitude')).toHaveValue('80.2707')

  await page.getByRole('button', { name: 'Add stop' }).click()
  await page.getByLabel('Location', { exact: true }).fill('Mahabalipuram')
  await page.getByRole('button', { name: 'Find stop 1' }).click()
  await page.getByRole('button', { name: 'Mahabalipuram, Tamil Nadu, India' }).click()
  await expect(page.getByLabel('Location', { exact: true })).toHaveValue('Mahabalipuram, Tamil Nadu, India')
  await expect(page.getByLabel('Latitude', { exact: true })).toHaveValue('12.6208')
  await expect(page.getByLabel('Longitude', { exact: true })).toHaveValue('80.1945')

  await page.getByLabel('Destination', { exact: true }).fill('Keep my original place')
  await page.getByRole('button', { name: 'Find arrival' }).click()
  await expect(page.getByText('Location search unavailable. Your typed location is unchanged.')).toBeVisible()
  await expect(page.getByLabel('Destination', { exact: true })).toHaveValue('Keep my original place')
  expect(requests).toEqual(['Chennai', 'Mahabalipuram', 'Keep my original place'])
})
