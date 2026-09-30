import { access, readdir, readFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const documents = []

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await collect(path)
    else if (extname(entry.name).toLowerCase() === '.md') documents.push(path)
  }
}

await collect(root)

const missing = []
const linkPattern = /!?(?:\[[^\]]*\])\(([^)]+)\)/g

for (const document of documents) {
  const source = await readFile(document, 'utf8')
  for (const match of source.matchAll(linkPattern)) {
    const rawTarget = match[1].trim().replace(/^<|>$/g, '')
    if (!rawTarget || rawTarget.startsWith('#') || /^(?:https?:|mailto:)/i.test(rawTarget)) continue
    const pathPart = decodeURIComponent(rawTarget.split('#')[0])
    const target = resolve(dirname(document), pathPart)
    try {
      await access(target)
    } catch {
      missing.push(`${document.slice(root.length + 1)} -> ${rawTarget}`)
    }
  }
}

if (missing.length) {
  console.error(`Missing local documentation links:\n${missing.join('\n')}`)
  process.exitCode = 1
} else {
  console.log(`Documentation links passed across ${documents.length} Markdown files.`)
}
