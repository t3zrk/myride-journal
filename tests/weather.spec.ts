import { expect, test } from '@playwright/test'
import { analyzeWeatherExposure } from '../src/services/weather/analysis'
import { weatherCondition } from '../src/services/weather/openMeteo'

test('weather exposure requires nearby samples and never infers unsampled hours', () => {
  const base = Date.parse('2026-09-20T08:00:00.000Z')
  const at = (minutes: number) => new Date(base + minutes * 60000).toISOString()
  const track = [0, 10, 20, 30].map((minutes, index) => ({ timestamp: at(minutes), latitude: 12.97, longitude: 77.59 + index * 0.01 }))
  const samples = [
    { timestamp: at(5), weatherCode: 63, precipitationMm: 3, temperatureC: 36, windKph: 42 },
    { timestamp: at(25), weatherCode: 0, precipitationMm: 0, temperatureC: 24, windKph: 8 },
  ]
  const result = analyzeWeatherExposure(track, samples)
  expect(result.sufficient).toBe(true)
  expect(result.coveredMinutes).toBe(30)
  expect(result.rainMinutes).toBe(20)
  expect(result.wetMinutes).toBe(20)
  expect(result.heatMinutes).toBe(20)
  expect(result.windMinutes).toBe(20)
  expect(result.wetRoadPeriods).toBe(1)
  expect(result.wetAverageSpeedKph).toBeGreaterThan(0)
  expect(result.minimumTemperatureC).toBe(24)
  expect(result.maximumTemperatureC).toBe(36)
  expect(analyzeWeatherExposure(track, samples.slice(0, 1)).sufficient).toBe(false)
  expect(analyzeWeatherExposure([], samples).sufficient).toBe(false)
  const snow = analyzeWeatherExposure(track, samples.map((item) => ({ ...item, weatherCode: 71, precipitationMm: 3 })))
  expect(snow.rainMinutes).toBe(0)
  expect(snow.wetMinutes).toBe(30)
  expect(weatherCondition(45)).toBe('Fog')
})

test('weather lookup recovers from a corrupt cache and reuses the repaired observation', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const originalFetch = window.fetch
    let requests = 0
    localStorage.setItem('myride-weather-12.97-77.59', '{broken-json')
    window.fetch = async () => {
      requests += 1
      return new Response(JSON.stringify({ current: { temperature_2m: 28, precipitation: 1, wind_speed_10m: 12, relative_humidity_2m: 70, weather_code: 61 } }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    try {
      const { getCurrentWeather } = await import('/src/services/weather/openMeteo.ts')
      const first = await getCurrentWeather(12.9716, 77.5946)
      const second = await getCurrentWeather(12.9716, 77.5946)
      return { requests, first, second }
    } finally {
      window.fetch = originalFetch
    }
  })

  expect(result.requests).toBe(1)
  expect(result.first).toEqual(result.second)
  expect(result.first.summary).toBe('Rain')
})
