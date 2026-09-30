import { expect, test } from '@playwright/test'

const pages = [
  ['dashboard', '/', 'MyRide'],
  ['trips', '/trips', 'Journey Archive'],
  ['trip-new', '/trips/new', 'Record a New Journey'],
  ['garage', '/garage', 'Motorcycle Dossier'],
  ['fuel', '/fuel', 'Fuel Journal'],
  ['expenses', '/expenses', 'Riding Costs'],
  ['profile', '/profile', 'Rider Profile'],
  ['settings', '/settings', 'Application Settings'],
  ['achievements', '/achievements', 'Rider Achievements & Milestones'],
] as const

test('primary pages render without horizontal overflow at four responsive widths', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'tablet', width: 768, height: 1024 }, { name: 'mobile', width: 390, height: 844 }, { name: 'small-mobile', width: 320, height: 700 }]) {
    await page.setViewportSize(viewport)
    for (const [name, path, heading] of pages) {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
      const nestedInteractive = await page.locator('a button, button a').count()
      await page.screenshot({ path: `test-results/${name}-${viewport.name}.png`, fullPage: true })
      const overflowing = overflow ? await page.evaluate(() => [...document.querySelectorAll('*')].filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 8).map((element) => `${element.tagName}.${element.className}: ${Math.round(element.getBoundingClientRect().right)}px`)) : []
      expect(overflow, `${name} overflows at ${viewport.width}px: ${overflowing.join(', ')}`).toBe(false)
      expect(nestedInteractive, `${name} contains nested link/button controls`).toBe(0)
    }
  }
  expect(errors).toEqual([])
})
