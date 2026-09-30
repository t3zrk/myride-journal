import { expect, test } from '@playwright/test'

test('trip dates are ordered and completed duration follows edited dates', async ({ page }) => {
  await page.goto('/trips/new')
  await page.getByLabel('Trip name').fill('Date integrity ride')
  await page.getByLabel('Start location').fill('Start')
  await page.getByLabel('Destination', { exact: true }).fill('Finish')
  await page.getByLabel('Start date').fill('2026-01-02T10:00')
  await page.getByLabel('End date').fill('2026-01-02T09:00')
  await page.getByLabel('Status').selectOption('Completed')
  await page.getByRole('button', { name: 'Create trip' }).click()
  await expect(page.getByRole('alert')).toHaveText('End date must be after the start date.')
  await expect(page).toHaveURL(/\/trips\/new$/)

  await page.getByLabel('End date').fill('2026-01-02T12:00')
  await page.getByRole('button', { name: 'Create trip' }).click()
  await expect(page.getByRole('heading', { name: 'Date integrity ride' })).toBeVisible()
  await expect(page.getByText('Duration').locator('..').locator('dd')).toHaveText('2 h 0 min')

  await page.getByRole('link', { name: 'Edit trip' }).click()
  await page.getByLabel('End date').fill('2026-01-02T13:30')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Duration').locator('..').locator('dd')).toHaveText('3 h 30 min')

  await page.getByRole('link', { name: 'Edit trip' }).click()
  await page.getByLabel('End date').fill('')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('alert')).toHaveText('A completed trip needs an end date.')
})

test('starting a delayed planned trip clears only its stale planned end', async ({ page }) => {
  await page.goto('/trips/new')
  await page.getByLabel('Trip name').fill('Delayed departure')
  await page.getByLabel('Start location').fill('Start')
  await page.getByLabel('Destination', { exact: true }).fill('Finish')
  await page.getByLabel('Start date').fill('2025-01-01T08:00')
  await page.getByLabel('End date').fill('2025-01-01T10:00')
  await page.getByRole('button', { name: 'Create trip' }).click()
  await page.getByRole('button', { name: 'Start trip' }).click()

  await expect(page.getByText('Active', { exact: true }).first()).toBeVisible()
  await page.getByRole('link', { name: 'Edit trip' }).click()
  await expect(page.getByLabel('End date')).toHaveValue('')
})
