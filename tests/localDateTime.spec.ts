import { expect, test } from '@playwright/test'

test('fuel and expense editors preserve local wall-clock times', async ({ page }) => {
  await page.goto('/garage')
  await page.getByLabel('Manufacturer').fill('Honda')
  await page.getByLabel('Model', { exact: true }).fill('CB350')
  await page.getByLabel('Nickname').fill('Clock bike')
  await page.getByRole('button', { name: 'Add motorcycle' }).click()
  await expect(page.getByRole('heading', { name: 'Clock bike', exact: true })).toBeVisible()

  await page.goto('/fuel')
  await page.getByLabel('Date and time').fill('2026-01-02T10:15')
  await page.getByLabel('Odometer km').fill('100')
  await page.getByLabel('Litres').fill('5')
  await page.getByRole('button', { name: 'Log fuel' }).click()
  await page.getByRole('button', { name: /Edit fuel fill at 100/ }).click()
  await expect(page.getByLabel('Date and time')).toHaveValue('2026-01-02T10:15')

  await page.goto('/expenses')
  await page.getByLabel('Amount').fill('20')
  await page.getByLabel('Date and time').fill('2026-01-02T10:15')
  await page.getByLabel('Motorcycle').selectOption({ label: 'Clock bike' })
  await page.getByRole('button', { name: 'Add expense' }).click()
  await page.getByRole('button', { name: 'Edit food expense' }).click()
  await expect(page.getByLabel('Date and time')).toHaveValue('2026-01-02T10:15')
})

test('maintenance defaults to the local calendar day and preserves edits', async ({ page }) => {
  await page.goto('/garage')
  await page.getByLabel('Manufacturer').fill('Honda')
  await page.getByLabel('Model', { exact: true }).fill('CB350')
  await page.getByLabel('Nickname').fill('Calendar bike')
  await page.getByRole('button', { name: 'Add motorcycle' }).click()
  await page.getByRole('link', { name: 'Open dossier' }).click()

  const localToday = await page.evaluate(() => {
    const now = new Date()
    const part = (value: number) => String(value).padStart(2, '0')
    return `${now.getFullYear()}-${part(now.getMonth() + 1)}-${part(now.getDate())}`
  })
  await expect(page.getByLabel('Date', { exact: true })).toHaveValue(localToday)

  await page.getByLabel('Date', { exact: true }).fill('2026-05-04')
  await page.getByLabel('Service type').fill('Routine')
  await page.getByLabel('Component').fill('Engine oil')
  await page.getByLabel('Odometer km').fill('1200')
  await page.getByRole('button', { name: 'Log service' }).click()
  await page.getByRole('button', { name: 'Edit Engine oil service' }).click()
  await expect(page.getByLabel('Date', { exact: true })).toHaveValue('2026-05-04')
})
