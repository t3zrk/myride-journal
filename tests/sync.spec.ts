import { expect, test } from '@playwright/test'
import type { BrowserContext, Route } from '@playwright/test'

type CloudRow = Record<string, unknown> & { id: string; user_id: string; created_at: string; updated_at: string }

const userId = '9b496d53-8248-43c6-85e1-5689eae96a95'
const email = 'rider@example.test'
const timestamp = new Date().toISOString()
const user = {
  id: userId, aud: 'authenticated', role: 'authenticated', email,
  email_confirmed_at: timestamp, confirmed_at: timestamp,
  created_at: timestamp, updated_at: timestamp,
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
}
const jwt = [
  Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({ sub: userId, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'),
  'test-signature',
].join('.')

function mockCloud() {
  const tables = new Map<string, Map<string, CloudRow>>()
  const files = new Map<string, Buffer>()
  const requests: string[] = []
  const aiRequests: Array<Record<string, unknown>> = []
  let photoDownloadUnavailable = false
  let failUserLookup = false

  async function install(context: BrowserContext) {
    await context.route('https://myride-cloud.test/**', async (route: Route) => {
      const request = route.request()
      const url = new URL(request.url())
      const method = request.method()
      const headers = {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, x-upsert, prefer, range',
        'content-type': 'application/json',
      }
      requests.push(`${method} ${url.pathname}`)
      if (method === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return }

      if (url.pathname === '/auth/v1/token' && method === 'POST') {
        await route.fulfill({ status: 200, headers, body: JSON.stringify({ access_token: jwt, token_type: 'bearer', expires_in: 3600, refresh_token: 'test-refresh-token', user }) })
        return
      }
      if (url.pathname === '/auth/v1/user' && method === 'GET') {
        if (failUserLookup) {
          failUserLookup = false
          await route.fulfill({ status: 503, headers, body: JSON.stringify({ message: 'Authentication temporarily unavailable' }) })
          return
        }
        await route.fulfill({ status: 200, headers, body: JSON.stringify(user) })
        return
      }

      if (url.pathname === '/functions/v1/explain-myride' && method === 'POST') {
        if (request.headers().authorization !== `Bearer ${jwt}`) { await route.fulfill({ status: 401, headers, body: JSON.stringify({ error: 'Authentication required' }) }); return }
        aiRequests.push(request.postDataJSON() as Record<string, unknown>)
        await route.fulfill({ status: 200, headers, body: JSON.stringify({ explanation: 'The answer reflects only recorded journeys.' }) })
        return
      }

      if (url.pathname.startsWith('/rest/v1/')) {
        const name = url.pathname.slice('/rest/v1/'.length)
        const table = tables.get(name) ?? new Map<string, CloudRow>()
        tables.set(name, table)
        if (method === 'POST') {
          const row = request.postDataJSON() as CloudRow
          if (row.user_id !== userId) { await route.fulfill({ status: 403, headers, body: JSON.stringify({ message: 'Wrong user' }) }); return }
          if (name === 'trips' && row.motorcycle_id && !tables.get('motorcycles')?.has(String(row.motorcycle_id))) {
            await route.fulfill({ status: 409, headers, body: JSON.stringify({ message: 'Missing motorcycle' }) })
            return
          }
          if (name === 'photos' && row.trip_id && !tables.get('trips')?.has(String(row.trip_id))) {
            await route.fulfill({ status: 409, headers, body: JSON.stringify({ message: 'Missing trip' }) })
            return
          }
          table.set(row.id, row)
          await route.fulfill({ status: 201, headers, body: '' })
          return
        }
        if (method === 'GET') {
          let rows = [...table.values()]
          const id = url.searchParams.get('id')?.replace(/^eq\./, '')
          const owner = url.searchParams.get('user_id')?.replace(/^eq\./, '')
          if (id) rows = rows.filter((row) => row.id === id)
          if (owner) rows = rows.filter((row) => row.user_id === owner)
          rows.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
          const range = request.headers()['range']?.match(/^(\d+)-(\d+)$/)
          if (range) rows = rows.slice(Number(range[1]), Number(range[2]) + 1)
          if (url.searchParams.get('select') === 'updated_at') rows = rows.map((row) => ({ updated_at: row.updated_at }) as CloudRow)
          await route.fulfill({ status: 200, headers, body: JSON.stringify(rows) })
          return
        }
      }

      const storagePrefix = '/storage/v1/object/trip-photos/'
      if (url.pathname.startsWith(storagePrefix)) {
        const path = decodeURIComponent(url.pathname.slice(storagePrefix.length))
        if (method === 'POST' || method === 'PUT') {
          files.set(path, request.postDataBuffer() ?? Buffer.alloc(0))
          await route.fulfill({ status: 200, headers, body: JSON.stringify({ Key: path }) })
          return
        }
        if (method === 'GET') {
          if (photoDownloadUnavailable) {
            await route.fulfill({ status: 404, headers, body: JSON.stringify({ message: 'Temporary photo outage' }) })
            return
          }
          const file = files.get(path)
          await route.fulfill(file ? { status: 200, headers: { ...headers, 'content-type': 'image/png' }, body: file } : { status: 404, headers, body: JSON.stringify({ message: 'Not found' }) })
          return
        }
      }
      if (url.pathname === '/storage/v1/object/trip-photos' && method === 'DELETE') {
        const body = request.postDataJSON() as { prefixes?: string[] }
        for (const path of body.prefixes ?? []) files.delete(path)
        await route.fulfill({ status: 200, headers, body: '[]' })
        return
      }
      await route.fulfill({ status: 404, headers, body: JSON.stringify({ message: `Unexpected ${method} ${url.pathname}` }) })
    })
  }

  return { install, tables, files, requests, aiRequests, setPhotoDownloadUnavailable: (unavailable: boolean) => { photoDownloadUnavailable = unavailable }, failNextUserLookup: () => { failUserLookup = true } }
}

test('cloud AI receives only the local answer and falls back offline', async ({ browser }) => {
  const cloud = mockCloud()
  const context = await browser.newContext()
  await cloud.install(context)
  const page = await context.newPage()
  await page.goto('/')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('test-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'MyRide', exact: true })).toBeVisible()

  await page.goto('/profile')
  await page.getByLabel('Name', { exact: true }).first().fill('Private Rider')
  await page.getByLabel('Blood group').fill('O+')
  await page.getByLabel('Medical notes').fill('Private medical note')
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect(page.getByText('Profile saved.')).toBeVisible()
  await page.getByLabel('Name', { exact: true }).last().fill('Private ICE contact')
  await page.getByLabel('Phone').fill('5551234')
  await page.getByRole('button', { name: 'Add contact' }).click()
  await expect(page.getByText('Private ICE contact')).toBeVisible()
  await page.getByLabel('AI provider').selectOption('openai')
  await expect(page.getByText('AI provider saved.')).toBeVisible()
  await page.getByLabel('Enable Ask MyRide').check()
  await expect(page.getByText('AI preference saved.')).toBeVisible()

  await page.goto('/')
  await page.getByLabel('Ask MyRide a question').fill('What was my longest trip?')
  await page.getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(page.getByText('There is no recorded trip distance yet.')).toBeVisible()
  await expect(page.getByText('The answer reflects only recorded journeys.')).toBeVisible()
  expect(cloud.aiRequests).toEqual([{ facts: 'There is no recorded trip distance yet.' }])
  expect(JSON.stringify(cloud.aiRequests)).not.toMatch(/Private Rider|Private ICE contact|Private medical note|5551234|O\+/)

  await page.getByLabel('Ask MyRide a question').fill('What is my blood group?')
  await page.getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(page.getByText(/Sensitive profile access is off/)).toBeVisible()
  await expect(page.getByText('Sensitive answers stay on this device and are not sent to the cloud.')).toBeVisible()
  expect(cloud.aiRequests).toHaveLength(1)

  await page.goto('/profile')
  await page.getByLabel('Allow AI access to sensitive profile fields').check()
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect(page.getByText('Profile saved.')).toBeVisible()
  await page.goto('/')
  await page.getByLabel('Ask MyRide a question').fill('What is my blood group?')
  await page.getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(page.getByText('Your recorded blood group is O+.')).toBeVisible()
  await expect(page.getByText('Sensitive answers stay on this device and are not sent to the cloud.')).toBeVisible()
  expect(cloud.aiRequests).toHaveLength(1)

  await context.setOffline(true)
  await page.getByLabel('Ask MyRide a question').fill('Show my riding milestones')
  await page.getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(page.getByText(/0 completed trips and 0 km completed distance/)).toBeVisible()
  await expect(page.getByText('Cloud explanation is unavailable. Showing the local answer.')).toBeVisible()
  expect(cloud.aiRequests).toHaveLength(1)
  await context.close()
})

test('failed user validation reports sync error and succeeds on retry', async ({ browser }) => {
  const cloud = mockCloud()
  const context = await browser.newContext()
  await cloud.install(context)
  const page = await context.newPage()
  await page.goto('/')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('test-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByText('Synced', { exact: true })).toBeVisible()
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Application Settings' })).toBeVisible()
  cloud.failNextUserLookup()
  await page.getByRole('button', { name: 'Sync now' }).click()
  await expect(page.getByText('Cloud status: Sync error.')).toBeVisible()
  await page.getByRole('button', { name: 'Sync now' }).click()
  await expect(page.getByText('Cloud status: Synced.')).toBeVisible()
  await context.close()
})

test('queued records and photos sync across two browser devices with stable IDs', async ({ browser }) => {
  const cloud = mockCloud()
  const first = await browser.newContext()
  await cloud.install(first)
  const pageA = await first.newPage()
  await pageA.goto('/')
  await pageA.getByLabel('Email').fill(email)
  await pageA.getByLabel('Password').fill('test-password')
  await pageA.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(pageA.getByRole('heading', { name: 'MyRide', exact: true })).toBeVisible()

  await pageA.goto('/garage')
  await pageA.getByLabel('Manufacturer').fill('Honda')
  await pageA.getByLabel('Model', { exact: true }).fill('CB350')
  await pageA.getByLabel('Nickname').fill('Cloud bike')
  await pageA.getByRole('button', { name: 'Add motorcycle' }).click()
  await expect(pageA.getByRole('heading', { name: 'Cloud bike' })).toBeVisible()

  await pageA.goto('/trips/new')
  await pageA.getByLabel('Trip name').fill('Cloud journey')
  await pageA.getByLabel('Start location').fill('Chennai')
  await pageA.getByLabel('Destination', { exact: true }).fill('Pondicherry')
  await pageA.getByLabel('Motorcycle').selectOption({ label: 'Cloud bike' })
  await pageA.getByRole('button', { name: 'Create trip' }).click()
  await expect(pageA.getByRole('heading', { name: 'Cloud journey' })).toBeVisible()
  const tripId = new URL(pageA.url()).pathname.split('/').at(-1)!
  await pageA.getByRole('navigation', { name: 'Trip sections' }).getByRole('link', { name: 'Photos' }).click()
  await pageA.locator('input[type="file"]').setInputFiles({ name: 'cloud-ride.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l7sAAAAASUVORK5CYII=', 'base64') })
  await expect(pageA.getByAltText('Trip photo')).toBeVisible()

  await pageA.goto('/settings')
  await pageA.getByLabel('Distance display').selectOption('mi')
  await pageA.getByRole('button', { name: 'Save settings' }).click()
  await expect(pageA.getByText('Settings saved.')).toBeVisible()
  await pageA.getByRole('button', { name: 'Sync now' }).click()
  await expect(pageA.getByText('Cloud status: Synced.')).toBeVisible()
  await expect.poll(() => cloud.tables.get('trips')?.size).toBe(1)
  expect(cloud.tables.get('trips')?.get(tripId)?.title).toBe('Cloud journey')
  expect(cloud.tables.get('photos')?.size).toBe(1)
  expect(cloud.files.size).toBe(1)
  await expect.poll(() => cloud.tables.get('user_settings')?.size).toBe(1)

  const second = await browser.newContext()
  await cloud.install(second)
  const pageB = await second.newPage()
  await pageB.goto(`/trips/${tripId}`)
  await pageB.getByLabel('Email').fill(email)
  await pageB.getByLabel('Password').fill('test-password')
  await pageB.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(pageB.getByRole('heading', { name: 'Cloud journey' })).toBeVisible()
  await pageB.getByRole('navigation', { name: 'Trip sections' }).getByRole('link', { name: 'Photos' }).click()
  await expect(pageB.getByAltText('Trip photo')).toBeVisible()
  await expect.poll(() => pageB.getByAltText('Trip photo').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0)
  await pageB.goto('/settings')
  await expect(pageB.getByLabel('Distance display')).toHaveValue('mi')

  await pageB.goto(`/trips/${tripId}`)
  await pageB.getByRole('link', { name: 'Edit trip' }).click()
  await expect(pageB.getByLabel('Trip name')).toBeVisible()
  await second.setOffline(true)
  await pageB.getByLabel('Trip name').fill('Cloud journey edited')
  await pageB.getByRole('button', { name: 'Save changes' }).click()
  await expect(pageB.getByRole('heading', { name: 'Cloud journey edited' })).toBeVisible()
  expect(cloud.tables.get('trips')?.get(tripId)?.title).toBe('Cloud journey')
  await second.setOffline(false)
  await pageB.goto('/settings')
  await pageB.getByRole('button', { name: 'Sync now' }).click()
  await expect.poll(() => cloud.tables.get('trips')?.get(tripId)?.title).toBe('Cloud journey edited')

  await pageA.getByRole('button', { name: 'Sync now' }).click()
  await pageA.goto(`/trips/${tripId}`)
  await expect(pageA.getByRole('heading', { name: 'Cloud journey edited' })).toBeVisible()
  expect(cloud.tables.get('trips')?.size).toBe(1)

  await pageB.goto(`/trips/${tripId}`)
  await pageB.getByRole('link', { name: 'Edit trip' }).click()
  await expect(pageB.getByLabel('Trip name')).toBeVisible()
  await second.setOffline(true)
  await pageB.getByLabel('Trip name').fill('Older offline edit')
  await pageB.getByRole('button', { name: 'Save changes' }).click()
  await expect(pageB.getByRole('heading', { name: 'Older offline edit' })).toBeVisible()

  await pageA.getByRole('link', { name: 'Edit trip' }).click()
  await pageA.getByLabel('Trip name').fill('Newer cloud edit')
  await pageA.getByRole('button', { name: 'Save changes' }).click()
  await expect(pageA.getByRole('heading', { name: 'Newer cloud edit' })).toBeVisible()
  await pageA.goto('/settings')
  await pageA.getByRole('button', { name: 'Sync now' }).click()
  await expect.poll(() => cloud.tables.get('trips')?.get(tripId)?.title).toBe('Newer cloud edit')

  await second.setOffline(false)
  await pageB.goto('/settings')
  await pageB.getByRole('button', { name: 'Sync now' }).click()
  await pageB.goto(`/trips/${tripId}`)
  await expect(pageB.getByRole('heading', { name: 'Newer cloud edit' })).toBeVisible()
  expect(cloud.tables.get('trips')?.size).toBe(1)

  cloud.setPhotoDownloadUnavailable(true)
  const retryDevice = await browser.newContext()
  await cloud.install(retryDevice)
  const retryPage = await retryDevice.newPage()
  await retryPage.goto(`/trips/${tripId}`)
  await retryPage.getByLabel('Email').fill(email)
  await retryPage.getByLabel('Password').fill('test-password')
  await retryPage.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(retryPage.getByText('Sync error', { exact: true })).toBeVisible()
  cloud.setPhotoDownloadUnavailable(false)
  await retryPage.goto('/settings')
  await retryPage.getByRole('button', { name: 'Sync now' }).click()
  await expect(retryPage.getByText('Cloud status: Synced.')).toBeVisible()
  await retryPage.goto(`/trips/${tripId}`)
  await retryPage.getByRole('navigation', { name: 'Trip sections' }).getByRole('link', { name: 'Photos' }).click()
  await expect(retryPage.getByAltText('Trip photo')).toBeVisible()
  await expect.poll(() => retryPage.getByAltText('Trip photo').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0)
  await retryDevice.close()

  pageB.once('dialog', (dialog) => dialog.accept())
  await pageB.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(pageB).toHaveURL(/\/trips$/)
  await pageB.goto('/settings')
  await pageB.getByRole('button', { name: 'Sync now' }).click()
  await expect.poll(() => cloud.tables.get('trips')?.get(tripId)?.deleted_at).toEqual(expect.any(String))
  await expect.poll(() => [...(cloud.tables.get('photos')?.values() ?? [])][0]?.deleted_at).toEqual(expect.any(String))
  await pageA.goto('/settings')
  await pageA.getByRole('button', { name: 'Sync now' }).click()
  await pageA.goto(`/trips/${tripId}`)
  await expect(pageA.getByRole('heading', { name: 'Trip could not be loaded' })).toBeVisible()
  await expect.poll(() => cloud.files.size).toBe(0)
  const photoDownloadsBeforeFreshPull = cloud.requests.filter((request) => request.startsWith('GET /storage/v1/object/trip-photos/')).length
  const third = await browser.newContext()
  await cloud.install(third)
  const pageC = await third.newPage()
  await pageC.goto(`/trips/${tripId}`)
  await pageC.getByLabel('Email').fill(email)
  await pageC.getByLabel('Password').fill('test-password')
  await pageC.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(pageC.getByRole('heading', { name: 'Trip could not be loaded' })).toBeVisible()
  await expect(pageC.getByText('Synced', { exact: true })).toBeVisible()
  expect(cloud.requests.filter((request) => request.startsWith('GET /storage/v1/object/trip-photos/'))).toHaveLength(photoDownloadsBeforeFreshPull)
  expect(cloud.requests.some((request) => request.startsWith('POST /storage/v1/object/trip-photos/'))).toBe(true)
  expect(cloud.requests.some((request) => request.startsWith('GET /storage/v1/object/trip-photos/'))).toBe(true)
  await first.close()
  await second.close()
  await third.close()
})
