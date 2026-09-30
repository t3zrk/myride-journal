import { expect, test } from '@playwright/test'

test('nearby fuel lookup selects the closest valid station and caches the result', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const originalFetch = window.fetch
    let requests = 0
    localStorage.removeItem('myride-fuel-station-12.97-77.59')
    window.fetch = async () => {
      requests += 1
      return new Response(JSON.stringify({ elements: [
        { lat: 200, lon: 77.6, tags: { name: 'Invalid' } },
        { lat: 13.2, lon: 77.8, tags: { name: 'Far station' } },
        { center: { lat: 12.972, lon: 77.595 }, tags: { name: 'Near station', opening_hours: '24/7' } },
      ] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    try {
      const { nearestFuelStation } = await import('/src/services/fuel/stations.ts')
      const first = await nearestFuelStation(12.9716, 77.5946)
      const second = await nearestFuelStation(12.9716, 77.5946)
      return { requests, first, second }
    } finally {
      window.fetch = originalFetch
    }
  })

  expect(result.requests).toBe(1)
  expect(result.first).toEqual(result.second)
  expect(result.first?.name).toBe('Near station')
  expect(result.first?.openingHours).toBe('24/7')
  expect(result.first?.distanceKm).toBeLessThan(0.1)
})
