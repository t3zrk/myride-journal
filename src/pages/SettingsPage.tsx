import { useState } from 'react'
import type { FormEvent } from 'react'
import { DataManagement } from '../components/DataManagement'
import { OpenAiKeySettings } from '../components/OpenAiKeySettings'
import { Button } from '../components/ui/Button'
import { Field, Input, Select } from '../components/ui/Field'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'
import { useDashboardData, useInvalidateMyRide, useSettings } from '../hooks/useMyRideData'
import { isSupabaseConfigured } from '../lib/supabase'
import { repository } from '../repositories/localRepository'
import { getCurrentGpsPosition } from '../services/gps/geolocation'
import { syncNow } from '../services/sync/sync'
import { useUiStore } from '../stores/uiStore'
import type { UserSettings } from '../types/myride'

export function SettingsPage() {
  const { data: settings } = useSettings()
  const { data: dashboard } = useDashboardData()
  const invalidate = useInvalidateMyRide()
  const syncMessage = useUiStore((state) => state.syncMessage)
  const [syncError, setSyncError] = useState('')
  const [gpsMessage, setGpsMessage] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [draft, setForm] = useState<Pick<UserSettings, 'currency' | 'distanceUnit' | 'fuelUnit' | 'temperatureUnit' | 'dateFormat' | 'gpsIntervalSeconds' | 'safeRangeReservePercent' | 'aiEnabled' | 'aiProvider' | 'maintenanceRemindersEnabled'> | null>(null)
  const form = draft ?? {
    currency: settings?.currency ?? 'INR',
    distanceUnit: settings?.distanceUnit ?? 'km',
    fuelUnit: settings?.fuelUnit ?? 'litre',
    temperatureUnit: settings?.temperatureUnit ?? 'C',
    dateFormat: settings?.dateFormat ?? 'local',
    gpsIntervalSeconds: settings?.gpsIntervalSeconds ?? 60,
    safeRangeReservePercent: settings?.safeRangeReservePercent ?? 15,
    aiEnabled: settings?.aiEnabled ?? false,
    aiProvider: settings?.aiProvider ?? 'local',
    maintenanceRemindersEnabled: settings?.maintenanceRemindersEnabled ?? false,
  }
  const hasRecordedCosts = Boolean(dashboard?.expenses.length || dashboard?.fuelLogs.some((log) => log.totalCost !== undefined || log.pricePerLitre !== undefined))

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!settings) return
    setSaveMessage('')
    try {
      await repository.settings.save(settings.id, form)
      await invalidate()
      setForm(null)
      setSaveMessage('Settings saved.')
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : 'Settings could not be saved.')
    }
  }

  async function checkLocation() {
    setGpsMessage('Checking location...')
    try {
      const position = await getCurrentGpsPosition()
      setGpsMessage(`Location available within ${Math.round(position.accuracy ?? 0)} m.`)
    } catch {
      setGpsMessage('Location unavailable. Check browser and device permissions.')
    }
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-6 md:gap-8">
      <PageHeader eyebrow="Settings" title="Application Settings" />

      <form onSubmit={save} className="surface-panel grid gap-2 p-5 md:p-6">
        <Section title="General" className="border-b border-stone-200">
          <div className="max-w-sm"><Field label="Date display"><Select value={form.dateFormat} onChange={(e) => setForm({ ...form, dateFormat: e.target.value as UserSettings['dateFormat'] })}><option value="local">Local</option><option value="iso">ISO</option></Select></Field></div>
        </Section>
        <Section title="Units" className="border-b border-stone-200">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Distance display"><Select value={form.distanceUnit} onChange={(e) => setForm({ ...form, distanceUnit: e.target.value as UserSettings['distanceUnit'] })}><option value="km">Kilometres</option><option value="mi">Miles</option></Select></Field>
            <Field label="Fuel display"><Select value={form.fuelUnit} onChange={(e) => setForm({ ...form, fuelUnit: e.target.value as UserSettings['fuelUnit'] })}><option value="litre">Litres</option><option value="gallon">US gallons</option></Select></Field>
            <Field label="Temperature display"><Select value={form.temperatureUnit} onChange={(e) => setForm({ ...form, temperatureUnit: e.target.value as UserSettings['temperatureUnit'] })}><option value="C">Celsius</option><option value="F">Fahrenheit</option></Select></Field>
          </div>
        </Section>
        <Section title="Trip Recording" className="border-b border-stone-200">
          <div className="max-w-sm"><Field label="GPS recording interval"><Select value={form.gpsIntervalSeconds} onChange={(e) => setForm({ ...form, gpsIntervalSeconds: Number(e.target.value) as UserSettings['gpsIntervalSeconds'] })}><option value={30}>30 sec</option><option value={60}>60 sec</option><option value={120}>120 sec</option></Select></Field></div>
        </Section>
        <Section title="GPS" className="border-b border-stone-200">
          <Button type="button" variant="outline" onClick={() => void checkLocation()}>Check current location</Button>
          {gpsMessage ? <p role="status" className="mt-2 text-sm text-stone-600">{gpsMessage}</p> : null}
        </Section>
        <Section title="Fuel" className="border-b border-stone-200">
          <div className="max-w-sm"><Field label="Safe range reserve %"><Input type="number" min="0" max="50" value={form.safeRangeReservePercent} onChange={(e) => setForm({ ...form, safeRangeReservePercent: Number(e.target.value) })} /></Field></div>
        </Section>
        <Section title="Expenses" className="border-b border-stone-200">
          <div className="max-w-sm"><Field label="Currency"><Input maxLength={3} disabled={hasRecordedCosts} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} /></Field></div>
          {hasRecordedCosts ? <p className="mt-2 text-sm text-stone-600">Currency is locked because recorded amounts are not converted.</p> : null}
        </Section>
        <Section title="Sync" className="border-b border-stone-200">
          <p className="text-stone-600">{isSupabaseConfigured ? `Cloud status: ${syncMessage}. Offline changes stay on this device until they sync.` : 'Cloud sync is unavailable until Supabase is configured. Journal data stays on this device.'}</p>
          {isSupabaseConfigured ? <div className="mt-3"><Button type="button" variant="outline" onClick={async () => { setSyncError(''); try { await syncNow(); invalidate() } catch (error) { setSyncError(error instanceof Error ? error.message : 'Sync failed') } }}>Sync now</Button>{syncError ? <p role="alert" className="mt-2 text-sm text-red-700">{syncError}</p> : null}</div> : null}
        </Section>
        <Section title="Notifications" className="border-b border-stone-200">
          <label className="flex min-h-11 items-center gap-3 rounded-md bg-stone-50 px-3 text-sm font-semibold"><input type="checkbox" className="size-5 accent-teal-900" checked={form.maintenanceRemindersEnabled} onChange={(event) => setForm({ ...form, maintenanceRemindersEnabled: event.target.checked })} /> Maintenance reminders</label>
        </Section>
        <Section title="AI">
          <label className="flex min-h-11 items-center gap-3 rounded-md bg-stone-50 px-3 text-sm font-semibold"><input type="checkbox" className="size-5 accent-teal-900" checked={form.aiEnabled} onChange={(e) => setForm({ ...form, aiEnabled: e.target.checked })} /> Enable optional AI assistant</label>
          <div className="mt-3 max-w-sm"><Field label="AI provider"><Select value={form.aiProvider} onChange={(event) => setForm({ ...form, aiProvider: event.target.value as UserSettings['aiProvider'] })}><option value="local">On-device</option><option value="openai">OpenAI</option></Select></Field></div>
          {form.aiProvider === 'openai' ? <OpenAiKeySettings /> : null}
          <p className="mt-2 text-sm text-stone-600">OpenAI receives only the locally computed answer; private safety fields are not included. A saved device key takes priority over a configured server-side provider.</p>
        </Section>
        <Button type="submit" disabled={!settings || !dashboard}>Save settings</Button>
        {saveMessage ? <p role="status" className="text-sm text-teal-900">{saveMessage}</p> : null}
      </form>
      <DataManagement split />
    </div>
  )
}
