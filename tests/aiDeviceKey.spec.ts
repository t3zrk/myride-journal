import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test('OpenAI key stays on this device and powers optional explanations', async ({ page }) => {
  const apiKey = 'myride-test-key-not-a-secret'
  let requestBody: Record<string, unknown> | undefined
  let authorization = ''

  await page.route('https://api.openai.com/v1/responses', async (route) => {
    authorization = route.request().headers().authorization ?? ''
    requestBody = route.request().postDataJSON()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ output_text: 'This answer uses verified journal records.' }) })
  })

  await page.goto('/profile')
  await page.getByLabel('AI provider').selectOption('openai')
  await expect(page.getByLabel('OpenAI API key')).toBeVisible()
  await page.getByLabel('OpenAI API key').fill(apiKey)
  await page.getByRole('button', { name: 'Save key' }).click()
  await expect(page.getByText('API key saved on this device.')).toBeVisible()
  await expect(page.getByText('A key is saved in this browser only.')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('myride-openai-api-key'))).toBe(apiKey)

  await page.getByLabel('Enable Ask MyRide').check()
  await page.reload()
  await expect(page.getByText('A key is saved in this browser only.')).toBeVisible()
  await page.setViewportSize({ width: 320, height: 700 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.screenshot({ path: 'test-results/ai-device-key-small-mobile.png', fullPage: true })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await page.getByLabel('Ask MyRide a question').fill('What was my longest trip?')
  await page.getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(page.getByText('This answer uses verified journal records.')).toBeVisible()
  expect(authorization).toBe(`Bearer ${apiKey}`)
  expect(requestBody?.store).toBe(false)
  expect(String(requestBody?.input)).toContain('Verified local journal answer:')

  await page.goto('/profile')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export archive' }).click()
  const archivePath = await (await downloadPromise).path()
  expect(archivePath).toBeTruthy()
  expect(await readFile(archivePath!, 'utf8')).not.toContain(apiKey)

  await page.getByRole('button', { name: 'Remove key' }).click()
  await expect(page.getByText('Saved API key removed from this device.')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('myride-openai-api-key'))).toBeNull()
})
