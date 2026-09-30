import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test('profile preferences, garage, privacy, and archive controls work together', async ({ page }) => {
  await page.goto('/profile')
  for (const name of ['Identity', 'Riding Preferences', 'My Garage', 'Privacy & Sync', 'AI', 'Data']) {
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  }
  await expect(page.getByLabel('Allow AI access to sensitive profile fields')).not.toBeChecked()
  await page.getByLabel('Name', { exact: true }).first().fill('Rider Profile Test')
  await page.getByLabel('Blood group').fill('O+')
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect(page.getByText('Profile saved.')).toBeVisible()

  await page.getByLabel('Preferred distance unit').selectOption('mi')
  await page.getByLabel('Preferred temperature unit').selectOption('F')
  await page.getByLabel('Preferred currency').fill('USD')
  await page.getByLabel('Preferred date format').selectOption('iso')
  await page.getByRole('button', { name: 'Save preferences' }).click()
  await expect(page.getByText('Riding preferences saved.')).toBeVisible()
  await page.getByLabel('Enable Ask MyRide').check()
  await expect(page.getByText('AI preference saved.')).toBeVisible()

  await page.getByLabel('Name', { exact: true }).last().fill('ICE Person')
  await page.getByLabel('Phone').fill('5550101')
  await page.getByRole('button', { name: 'Add contact' }).click()
  await expect(page.getByText('ICE Person')).toBeVisible()

  await page.goto('/garage')
  for (const nickname of ['First bike', 'Second bike']) {
    await page.getByLabel('Manufacturer').fill('Honda')
    await page.getByLabel('Model', { exact: true }).fill('CB350')
    await page.getByLabel('Nickname').fill(nickname)
    await page.getByRole('button', { name: 'Add motorcycle' }).click()
    await expect(page.getByRole('heading', { name: nickname })).toBeVisible()
  }
  await page.goto('/profile')
  await page.getByLabel('Active motorcycle').selectOption({ label: 'Second bike' })
  await expect(page.getByText('Active motorcycle updated.')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Active motorcycle')).toHaveValue(await page.getByLabel('Active motorcycle').locator('option', { hasText: 'Second bike' }).getAttribute('value') ?? '')
  await expect(page.getByLabel('Preferred currency')).toHaveValue('USD')
  await expect(page.getByLabel('Enable Ask MyRide')).toBeChecked()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export archive' }).click()
  const archivePath = (await (await downloadPromise).path())!
  const archive = JSON.parse(await readFile(archivePath, 'utf8'))
  expect(archive.records.settings[0].currency).toBe('USD')
  expect(archive.records.profiles[0].bloodGroup).toBe('O+')
  expect(archive.records.motorcycles).toHaveLength(2)
  expect(archive.records.emergencyContacts).toHaveLength(1)

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Clear device data' }).click()
  await expect(page.getByLabel('Preferred currency')).toHaveValue('INR')
  await expect(page.getByText('ICE Person')).toHaveCount(0)
  await expect(page.getByText('0 motorcycles')).toBeVisible()
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(archivePath)
  await expect(page.getByText(/records imported/)).toBeVisible()
  await expect(page.getByLabel('Preferred currency')).toHaveValue('USD')
  await expect(page.getByText('ICE Person')).toBeVisible()
  await expect(page.getByLabel('Active motorcycle')).toHaveValue(await page.getByLabel('Active motorcycle').locator('option', { hasText: 'Second bike' }).getAttribute('value') ?? '')

  await page.goto('/expenses')
  await page.getByLabel('Amount').fill('25')
  await page.getByRole('button', { name: 'Add expense' }).click()
  await expect(page.getByText('USD 25', { exact: true }).first()).toBeVisible()
  await page.goto('/profile')
  await expect(page.getByLabel('Preferred currency')).toBeDisabled()
  const currencyResult = await page.evaluate(async () => {
    const { repository } = await import('/src/repositories/localRepository.ts')
    const settings = await repository.settings.get()
    try {
      await repository.settings.save(settings.id, { currency: 'EUR' })
      return 'changed'
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  })
  expect(currencyResult).toBe('Currency cannot change after costs have been recorded.')

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('complementary', { name: 'Primary navigation' })).not.toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  await page.screenshot({ path: 'test-results/profile-sections-mobile.png', fullPage: true })
})
