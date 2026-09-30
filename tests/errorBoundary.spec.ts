import { expect, test } from '@playwright/test'

test('failed route chunk offers a reload that recovers the page', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'MyRide', exact: true })).toBeVisible()
  await page.route('**/src/pages/TripsPage.tsx*', (route) => route.abort('failed'))
  await page.getByRole('complementary', { name: 'Primary navigation' }).getByRole('link', { name: 'Trips' }).click()
  await expect(page.getByRole('heading', { name: 'Page could not be opened' })).toBeVisible()
  await page.unroute('**/src/pages/TripsPage.tsx*')
  await page.getByRole('button', { name: 'Reload page' }).click()
  await expect(page.getByRole('heading', { name: 'Journey Archive' })).toBeVisible()
})
