import { useEffect, useState } from 'react'
import { Button } from './ui/Button'
import { Section } from './ui/Section'
import { useDashboardData, useInvalidateMyRide } from '../hooks/useMyRideData'
import { isSupabaseConfigured } from '../lib/supabase'
import { clearLocalArchive, exportArchive, importArchive } from '../services/backup'

function storageAmount(bytes?: number) {
  if (bytes === undefined) return 'Unavailable'
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function DataManagement({ split = false }: { split?: boolean }) {
  const { data: dashboard } = useDashboardData()
  const invalidate = useInvalidateMyRide()
  const [message, setMessage] = useState('')
  const [messageArea, setMessageArea] = useState<'storage' | 'export' | 'import'>('storage')
  const [storage, setStorage] = useState<{ usage?: number; quota?: number; persistent?: boolean }>({})

  useEffect(() => {
    let cancelled = false
    void Promise.all([navigator.storage?.estimate?.(), navigator.storage?.persisted?.()]).then(([estimate, persistent]) => {
      if (!cancelled) setStorage({ usage: estimate?.usage, quota: estimate?.quota, persistent })
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  async function handleImport(file?: File) {
    if (!file) return
    setMessageArea('import')
    setMessage('Importing archive...')
    try {
      const count = await importArchive(file)
      await invalidate()
      window.dispatchEvent(new Event('myride:data-imported'))
      setMessage(`${count} records imported. Existing newer records were kept.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Import failed.')
    }
  }

  async function clearDeviceData() {
    setMessageArea('storage')
    if (isSupabaseConfigured && (!dashboard || dashboard.queue.length)) {
      setMessage('Sync your queued changes before clearing this device.')
      return
    }
    const prompt = isSupabaseConfigured
      ? 'Clear local MyRide records? Export a backup first. Synced cloud records will download again.'
      : 'Permanently delete all MyRide records on this device? Export a backup first.'
    if (!window.confirm(prompt)) return
    try {
      await clearLocalArchive()
      window.location.reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Device data could not be cleared.')
    }
  }

  async function requestPersistentStorage() {
    setMessageArea('storage')
    if (!navigator.storage?.persist) { setMessage('Persistent storage is unavailable in this browser.'); return }
    const persistent = await navigator.storage.persist()
    setStorage((current) => ({ ...current, persistent }))
    setMessage(persistent ? 'Persistent storage enabled.' : 'The browser kept standard storage management.')
  }

  const status = message ? <p role="status" className="mt-3 text-sm text-teal-900">{message}</p> : null
  const storageContent = <><dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="font-semibold">Used on this device</dt><dd className="text-stone-600">{storageAmount(storage.usage)}</dd></div><div><dt className="font-semibold">Storage allowance</dt><dd className="text-stone-600">{storageAmount(storage.quota)}</dd></div><div><dt className="font-semibold">Retention</dt><dd className="text-stone-600">{storage.persistent ? 'Persistent' : 'Standard browser storage'}</dd></div></dl><div className="mt-4 flex flex-wrap gap-3">{!storage.persistent ? <Button variant="outline" onClick={() => void requestPersistentStorage()}>Request persistent storage</Button> : null}<Button variant="destructive" onClick={() => void clearDeviceData()}>Clear device data</Button></div>{messageArea === 'storage' ? status : null}</>
  const exportContent = <><p className="text-sm text-stone-600">The archive includes GPS, photos, profile, and private emergency contacts. Keep it secure.</p><div className="mt-4"><Button variant="outline" onClick={() => { setMessageArea('export'); setMessage(''); void exportArchive().catch(() => setMessage('Archive could not be exported.')) }}>Export archive</Button></div>{messageArea === 'export' ? status : null}</>
  const importContent = <><p className="text-sm text-stone-600">Newer existing records are retained when an archive is imported.</p><label className="mt-4 inline-flex min-h-12 cursor-pointer items-center rounded-md border border-stone-300 px-4 text-sm font-semibold">Import archive<input type="file" accept="application/json,.json" className="sr-only" onChange={(event) => { void handleImport(event.target.files?.[0]); event.target.value = '' }} /></label>{messageArea === 'import' ? status : null}</>

  if (split) return <><Section title="Offline Storage" className="surface-panel px-5 md:px-6">{storageContent}</Section><Section title="Data Export" className="surface-panel px-5 md:px-6">{exportContent}</Section><Section title="Data Import" className="surface-panel px-5 md:px-6">{importContent}</Section></>
  return <Section title="Data" className="surface-panel px-5 md:px-6"><div className="grid gap-6"><div>{storageContent}</div><div className="border-t border-stone-200 pt-5">{exportContent}</div><div className="border-t border-stone-200 pt-5">{importContent}</div></div></Section>
}
