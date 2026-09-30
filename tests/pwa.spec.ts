import { expect, test } from '@playwright/test'

test('production shell and journal stay available offline', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'MyRide', exact: true })).toBeVisible()
  const iconEvidence = await page.evaluate(async () => {
    const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    if (!manifestLink) throw new Error('Manifest link missing')
    const manifest = await fetch(manifestLink.href).then((response) => response.json()) as { icons?: Array<{ src: string; sizes: string; purpose?: string }> }
    return Promise.all((manifest.icons ?? []).map(async (icon) => {
      const blob = await fetch(new URL(icon.src, location.origin)).then((response) => response.blob())
      const image = await createImageBitmap(blob)
      return { ...icon, width: image.width, height: image.height }
    }))
  })
  expect(iconEvidence).toEqual([
    expect.objectContaining({ sizes: '192x192', width: 192, height: 192, purpose: 'any' }),
    expect.objectContaining({ sizes: '512x512', width: 512, height: 512, purpose: 'any maskable' }),
  ])
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }))
  })
  await page.reload()
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'MyRide', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Trips', exact: true }).first().click()
  await expect(page.getByRole('heading', { name: 'Journey Archive' })).toBeVisible()
  await page.getByRole('link', { name: 'Create first trip' }).click()
  await page.getByLabel('Trip name').fill('Offline PWA Ride')
  await page.getByLabel('Start location').fill('Offline start')
  await page.getByLabel('Destination', { exact: true }).fill('Offline finish')
  await page.getByRole('button', { name: 'Create trip' }).click()
  await expect(page.getByRole('heading', { name: 'Offline PWA Ride' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Offline PWA Ride' })).toBeVisible()
})
