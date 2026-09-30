import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = fileURLToPath(new URL('..', import.meta.url))
const source = await readFile(join(root, 'public', 'pwa-icon.svg'), 'utf8')
const browser = await chromium.launch()

try {
  for (const size of [180, 192, 512]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}svg{display:block;width:100%;height:100%}</style>${source}`)
    await page.screenshot({ path: join(root, 'public', `pwa-icon-${size}.png`), omitBackground: false })
    await page.close()
  }
} finally {
  await browser.close()
}
