import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const outputDir = join(root, 'docs', 'screenshots')
const host = '127.0.0.1'
const port = 4174
const baseUrl = `http://${host}:${port}`

await mkdir(outputDir, { recursive: true })

const server = await createServer({
  root,
  logLevel: 'error',
  server: { host, port, strictPort: true },
})
await server.listen()

const browser = await chromium.launch()

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(baseUrl)

  const ids = await page.evaluate(async () => {
    const { repository } = await import('/src/repositories/localRepository.ts')

    const motorcycle = await repository.motorcycles.create({
      manufacturer: 'Royal Enfield',
      model: 'Himalayan 450',
      nickname: 'Himalayan',
      year: 2025,
      registration: 'KL 07 MR 4500',
      engineCapacityCc: 452,
      tankCapacityLitres: 17,
      fuelType: 'Petrol',
      currentOdometerKm: 6320,
      serviceIntervalKm: 5000,
      tyreInformation: '90/90-21 front, 140/80 R17 rear',
      active: true,
    })

    const trip = await repository.trips.create({
      title: 'Munnar Highland Ride',
      motorcycleId: motorcycle.id,
      startDate: '2026-09-12T00:30:00.000Z',
      endDate: '2026-09-12T08:15:00.000Z',
      origin: { label: 'Kochi, Kerala', latitude: 9.9312, longitude: 76.2673 },
      destination: { label: 'Munnar, Kerala', latitude: 10.0889, longitude: 77.0595 },
      status: 'Completed',
      notes: 'An early start through the hills with a tea stop before the final climb.',
      distanceKm: 286,
      durationMinutes: 465,
    })

    await repository.plannedStops.create({
      tripId: trip.id,
      label: 'Neriamangalam tea stop',
      latitude: 10.0612,
      longitude: 76.7867,
      plannedAt: '2026-09-12T03:00:00.000Z',
    })

    for (const point of [
      { latitude: 9.9312, longitude: 76.2673, altitude: 8, timestamp: '2026-09-12T00:30:00.000Z' },
      { latitude: 10.0612, longitude: 76.7867, altitude: 46, timestamp: '2026-09-12T03:00:00.000Z' },
      { latitude: 10.0889, longitude: 77.0595, altitude: 1532, timestamp: '2026-09-12T08:15:00.000Z' },
    ]) await repository.gpsPoints.create({ ...point, tripId: trip.id })

    await repository.rideEvents.create({
      tripId: trip.id,
      type: 'checkpoint',
      title: 'Reached the highlands',
      notes: 'Cloud cover lifted near the final climb.',
      timestamp: '2026-09-12T07:40:00.000Z',
      latitude: 10.0751,
      longitude: 77.0356,
      distanceFromStartKm: 268,
      distanceFromPreviousKm: 112,
    })

    await repository.fuelLogs.create({
      motorcycleId: motorcycle.id,
      dateTime: '2026-09-01T02:00:00.000Z',
      odometerKm: 6000,
      litres: 10,
      pricePerLitre: 106,
      totalCost: 1060,
      station: 'Kochi',
      fullTank: true,
    })
    await repository.fuelLogs.create({
      motorcycleId: motorcycle.id,
      tripId: trip.id,
      dateTime: '2026-09-12T08:20:00.000Z',
      odometerKm: 6320,
      litres: 10.2,
      pricePerLitre: 106,
      totalCost: 1081.2,
      station: 'Munnar',
      fullTank: true,
    })

    await repository.expenses.create({
      tripId: trip.id,
      motorcycleId: motorcycle.id,
      amount: 420,
      currency: 'INR',
      date: '2026-09-12T03:10:00.000Z',
      category: 'food',
      paymentMethod: 'UPI',
      notes: 'Breakfast and tea',
    })
    await repository.expenses.create({
      tripId: trip.id,
      motorcycleId: motorcycle.id,
      amount: 180,
      currency: 'INR',
      date: '2026-09-12T05:30:00.000Z',
      category: 'tolls',
      paymentMethod: 'Cash',
    })

    await repository.maintenance.create({
      motorcycleId: motorcycle.id,
      date: '2026-08-25T00:00:00.000Z',
      odometerKm: 5900,
      serviceType: 'Routine service',
      component: 'Engine oil',
      workshop: 'Highland Motors',
      cost: 2450,
    })

    await repository.weather.create({
      tripId: trip.id,
      timestamp: '2026-09-12T07:30:00.000Z',
      latitude: 10.0751,
      longitude: 77.0356,
      temperatureC: 19,
      precipitationMm: 0.2,
      windKph: 11,
      humidityPercent: 78,
      summary: 'Cool and cloudy',
    })

    return { tripId: trip.id }
  })

  await page.goto(baseUrl)
  await page.getByRole('heading', { name: 'Munnar Highland Ride', exact: true }).waitFor()
  await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('aside')?.scrollTo(0, 0) })
  await page.screenshot({ path: join(outputDir, 'dashboard.png'), fullPage: false })

  await page.goto(`${baseUrl}/trips/${ids.tripId}`)
  await page.getByRole('heading', { name: 'Munnar Highland Ride', exact: true }).waitFor()
  await page.locator('.leaflet-container').waitFor()
  await page.waitForTimeout(500)
  await page.evaluate(() => {
    window.scrollTo(0, 0)
    document.documentElement.scrollLeft = 0
    document.body.scrollLeft = 0
    document.querySelector('aside')?.scrollTo(0, 0)
  })
  await page.waitForTimeout(100)
  await page.screenshot({ path: join(outputDir, 'trip-detail.png'), fullPage: false })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(baseUrl)
  await page.getByRole('heading', { name: 'Munnar Highland Ride', exact: true }).waitFor()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: join(outputDir, 'dashboard-mobile.png'), fullPage: true })

  await context.close()
} finally {
  await browser.close()
  await server.close()
}
