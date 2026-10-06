import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { DataManagement } from '../components/DataManagement'
import { AiProviderSettings } from '../components/AiProviderSettings'
import { Button, ButtonLink } from '../components/ui/Button'
import { Field, Input, Select, Textarea } from '../components/ui/Field'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'
import { useDashboardData, useInvalidateMyRide, useMotorcycles, useProfile, useSettings } from '../hooks/useMyRideData'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { repository } from '../repositories/localRepository'
import { compressImageToDataUrl } from '../services/photos/images'
import { syncNow } from '../services/sync/sync'
import { useUiStore } from '../stores/uiStore'
import type { EmergencyContact, UserSettings } from '../types/myride'

export function ProfilePage() {
  const { data: profile } = useProfile()
  const { data: settings } = useSettings()
  const { data: motorcycles = [] } = useMotorcycles()
  const { data: dashboard } = useDashboardData()
  const invalidate = useInvalidateMyRide()
  const syncMessage = useUiStore((state) => state.syncMessage)
  const [draft, setForm] = useState<{ name: string; bio: string; ridingStyle: string; homeBase: string; bloodGroup: string; allergies: string; medicalNotes: string; aiSensitiveAccess: boolean } | null>(null)
  const form = draft ?? {
    name: profile?.name ?? '',
    bio: profile?.bio ?? '',
    ridingStyle: profile?.ridingStyle ?? '',
    homeBase: profile?.homeBase ?? '',
    bloodGroup: profile?.bloodGroup ?? '',
    allergies: profile?.allergies ?? '',
    medicalNotes: profile?.medicalNotes ?? '',
    aiSensitiveAccess: profile?.aiSensitiveAccess ?? false,
  }
  const [photo, setPhoto] = useState<File>()
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [preferencesDraft, setPreferencesDraft] = useState<Pick<UserSettings, 'currency' | 'distanceUnit' | 'temperatureUnit' | 'dateFormat'> | null>(null)
  const preferences = preferencesDraft ?? {
    currency: settings?.currency ?? 'INR',
    distanceUnit: settings?.distanceUnit ?? 'km',
    temperatureUnit: settings?.temperatureUnit ?? 'C',
    dateFormat: settings?.dateFormat ?? 'local',
  }
  const [preferencesMessage, setPreferencesMessage] = useState('')
  const [garageMessage, setGarageMessage] = useState('')
  const [aiMessage, setAiMessage] = useState('')
  const [aiDraft, setAiDraft] = useState<boolean | null>(null)
  const [aiSaving, setAiSaving] = useState(false)
  const [providerDraft, setProviderDraft] = useState<UserSettings['aiProvider'] | null>(null)
  const [providerSaving, setProviderSaving] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [contacts, setContacts] = useState<EmergencyContact[]>([])
  const [editingContactId, setEditingContactId] = useState<string>()
  const [contactForm, setContactForm] = useState({ name: '', relationship: '', phone: '', notes: '' })
  const [contactError, setContactError] = useState('')
  const activeMotorcycle = motorcycles.find((motorcycle) => motorcycle.active)
  const hasRecordedCosts = Boolean(dashboard?.expenses.length || dashboard?.fuelLogs.some((log) => log.totalCost !== undefined || log.pricePerLitre !== undefined))
  const activeAiProvider = providerDraft ?? settings?.aiProvider ?? 'local'

  useEffect(() => {
    const refreshContacts = () => { void repository.emergencyContacts.all().then(setContacts) }
    refreshContacts()
    window.addEventListener('myride:synced', refreshContacts)
    window.addEventListener('myride:data-imported', refreshContacts)
    return () => {
      window.removeEventListener('myride:synced', refreshContacts)
      window.removeEventListener('myride:data-imported', refreshContacts)
    }
  }, [])

  async function savePreferences(event: FormEvent) {
    event.preventDefault()
    if (!settings) return
    setPreferencesMessage('')
    try {
      await repository.settings.save(settings.id, preferences)
      await invalidate()
      setPreferencesDraft(null)
      setPreferencesMessage('Riding preferences saved.')
    } catch (error) {
      setPreferencesMessage(error instanceof Error ? error.message : 'Riding preferences could not be saved.')
    }
  }

  async function setActiveMotorcycle(id: string) {
    setGarageMessage('')
    try {
      await repository.motorcycles.setActive(id)
      await invalidate()
      setGarageMessage('Active motorcycle updated.')
    } catch (error) {
      setGarageMessage(error instanceof Error ? error.message : 'Motorcycle could not be changed.')
    }
  }

  async function setAiEnabled(enabled: boolean) {
    if (!settings) return
    setAiDraft(enabled)
    setAiSaving(true)
    setAiMessage('')
    try {
      await repository.settings.save(settings.id, { aiEnabled: enabled })
      await invalidate()
      setAiMessage('AI preference saved.')
    } catch (error) {
      setAiMessage(error instanceof Error ? error.message : 'AI preference could not be saved.')
    } finally {
      setAiDraft(null)
      setAiSaving(false)
    }
  }

  async function setAiProvider(provider: UserSettings['aiProvider']) {
    if (!settings) return
    setProviderDraft(provider)
    setProviderSaving(true)
    setAiMessage('')
    try {
      await repository.settings.save(settings.id, { aiProvider: provider })
      await invalidate()
      setAiMessage('AI provider saved.')
    } catch (error) {
      setAiMessage(error instanceof Error ? error.message : 'AI provider could not be saved.')
    } finally {
      setProviderDraft(null)
      setProviderSaving(false)
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setSaveMessage('Saving profile...')
    try {
      const photoDataUrl = photo ? await compressImageToDataUrl(photo) : profile?.photoDataUrl
      await repository.profiles.save({ ...form, photoDataUrl })
      setPhoto(undefined)
      await invalidate()
      setForm(null)
      setSaveMessage('Profile saved.')
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : 'Profile could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function saveContact(event: FormEvent) {
    event.preventDefault()
    setContactError('')
    const payload = { name: contactForm.name.trim(), relationship: contactForm.relationship.trim(), phone: contactForm.phone.trim(), notes: contactForm.notes.trim() }
    try {
      if (editingContactId) await repository.emergencyContacts.update(editingContactId, payload)
      else await repository.emergencyContacts.create(payload)
      setContacts(await repository.emergencyContacts.all())
      setEditingContactId(undefined)
      setContactForm({ name: '', relationship: '', phone: '', notes: '' })
    } catch (error) {
      setContactError(error instanceof Error ? error.message : 'Emergency contact could not be saved.')
    }
  }

  async function removeContact(contact: EmergencyContact) {
    if (!window.confirm(`Delete emergency contact ${contact.name}?`)) return
    await repository.emergencyContacts.remove(contact.id)
    setContacts(await repository.emergencyContacts.all())
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-6 md:gap-8">
      <PageHeader eyebrow="Profile" title="Rider Profile" />

      <form onSubmit={save} className="surface-panel grid gap-3 p-5 md:p-6">
        <Section title="Identity">
          <div className="grid gap-4">
            {profile?.photoDataUrl ? <img src={profile.photoDataUrl} alt="Rider profile" className="size-28 rounded-md object-cover" /> : null}
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Name"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Home base"><Input value={form.homeBase} onChange={(e) => setForm({ ...form, homeBase: e.target.value })} /></Field>
              <Field label="Riding style"><Input value={form.ridingStyle} onChange={(e) => setForm({ ...form, ridingStyle: e.target.value })} /></Field>
              <Field label="Profile photo"><Input type="file" accept="image/*" onChange={(event) => { setPhoto(event.currentTarget.files?.[0]); event.currentTarget.value = '' }} /></Field>
            </div>
            <Field label="Bio"><Textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></Field>
          </div>
        </Section>
        <Section title="Private Information">
          <div className="grid gap-4 border-l-4 border-amber-500 bg-amber-50/70 p-4">
            <p className="text-sm font-semibold text-amber-900">PRIVATE. These fields are never sent to AI by default.</p>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Blood group"><Input value={form.bloodGroup} onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })} /></Field>
              <Field label="Allergies"><Input value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} /></Field>
            </div>
            <Field label="Medical notes"><Textarea value={form.medicalNotes} onChange={(e) => setForm({ ...form, medicalNotes: e.target.value })} /></Field>
            <label className="flex min-h-12 items-center gap-3 text-sm font-semibold"><input type="checkbox" className="size-5 accent-teal-900" checked={form.aiSensitiveAccess} onChange={(e) => setForm({ ...form, aiSensitiveAccess: e.target.checked })} /> Allow AI access to sensitive profile fields</label>
          </div>
        </Section>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={saving}>Save profile</Button>
          <ButtonLink to="/settings" variant="outline">Settings</ButtonLink>
          <ButtonLink to="/achievements" variant="outline">Milestones</ButtonLink>
        </div>
        {saveMessage ? <p role="status" className="text-sm text-teal-900">{saveMessage}</p> : null}
      </form>

      <Section title="Riding Preferences" className="surface-panel px-5 md:px-6">
        <form onSubmit={savePreferences} className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Preferred distance unit"><Select value={preferences.distanceUnit} onChange={(event) => setPreferencesDraft({ ...preferences, distanceUnit: event.target.value as UserSettings['distanceUnit'] })}><option value="km">Kilometres</option><option value="mi">Miles</option></Select></Field>
            <Field label="Preferred temperature unit"><Select value={preferences.temperatureUnit} onChange={(event) => setPreferencesDraft({ ...preferences, temperatureUnit: event.target.value as UserSettings['temperatureUnit'] })}><option value="C">Celsius</option><option value="F">Fahrenheit</option></Select></Field>
            <Field label="Preferred currency"><Input maxLength={3} disabled={hasRecordedCosts} value={preferences.currency} onChange={(event) => setPreferencesDraft({ ...preferences, currency: event.target.value.toUpperCase() })} /></Field>
            <Field label="Preferred date format"><Select value={preferences.dateFormat} onChange={(event) => setPreferencesDraft({ ...preferences, dateFormat: event.target.value as UserSettings['dateFormat'] })}><option value="local">Local</option><option value="iso">ISO</option></Select></Field>
          </div>
          {hasRecordedCosts ? <p className="text-sm text-stone-600">Currency is locked because costs have been recorded.</p> : null}
          <div><Button type="submit" disabled={!settings}>Save preferences</Button></div>
          {preferencesMessage ? <p role="status" className="text-sm text-teal-900">{preferencesMessage}</p> : null}
        </form>
      </Section>

      <Section title="My Garage" className="surface-panel px-5 md:px-6">
        <p className="mb-4 text-sm text-stone-600">{motorcycles.length} {motorcycles.length === 1 ? 'motorcycle' : 'motorcycles'}</p>
        {motorcycles.length ? <div className="max-w-md"><Field label="Active motorcycle"><Select value={activeMotorcycle?.id ?? ''} onChange={(event) => void setActiveMotorcycle(event.target.value)}><option value="" disabled>Select motorcycle</option>{motorcycles.map((motorcycle) => <option key={motorcycle.id} value={motorcycle.id}>{motorcycle.nickname || `${motorcycle.manufacturer} ${motorcycle.model}`}</option>)}</Select></Field></div> : null}
        <ButtonLink to="/garage" className="mt-4" variant="outline">Open garage</ButtonLink>
        {garageMessage ? <p role="status" className="mt-3 text-sm text-teal-900">{garageMessage}</p> : null}
      </Section>

      <Section title="Emergency Contacts - Private" className="surface-panel px-5 md:px-6">
        <div className="grid gap-2">{contacts.map((contact) => <article key={contact.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 py-3"><div><p className="font-semibold">{contact.name} | {contact.relationship || 'Emergency contact'}</p><p className="text-sm text-stone-600">{contact.phone}</p></div><div className="flex gap-1"><Button variant="ghost" aria-label={`Edit ${contact.name}`} onClick={() => { setEditingContactId(contact.id); setContactForm({ name: contact.name, relationship: contact.relationship ?? '', phone: contact.phone, notes: contact.notes ?? '' }) }}><Pencil size={18} /></Button><Button variant="ghost" aria-label={`Delete ${contact.name}`} onClick={() => removeContact(contact)}><Trash2 size={18} /></Button></div></article>)}{contacts.length === 0 ? <p className="text-stone-600">No emergency contacts saved.</p> : null}</div>
        <form onSubmit={saveContact} className="mt-5 grid gap-3"><div className="grid gap-3 md:grid-cols-2"><Field label="Name"><Input required value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} /></Field><Field label="Relationship"><Input value={contactForm.relationship} onChange={(e) => setContactForm({ ...contactForm, relationship: e.target.value })} /></Field><Field label="Phone"><Input required type="tel" value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} /></Field></div><Field label="Notes"><Textarea value={contactForm.notes} onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })} /></Field>{contactError ? <p role="alert" className="text-sm text-red-700">{contactError}</p> : null}<div className="flex gap-3"><Button type="submit">{editingContactId ? 'Save contact' : 'Add contact'}</Button>{editingContactId ? <Button type="button" variant="outline" onClick={() => { setEditingContactId(undefined); setContactError(''); setContactForm({ name: '', relationship: '', phone: '', notes: '' }) }}>Cancel</Button> : null}</div></form>
      </Section>

      <Section title="Privacy & Sync" className="surface-panel px-5 md:px-6">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="font-semibold">Local storage</dt><dd className="text-stone-600">Stored on this device</dd></div>
          <div><dt className="font-semibold">Cloud sync</dt><dd className="text-stone-600">{isSupabaseConfigured ? syncMessage : 'Not configured'}</dd></div>
          <div><dt className="font-semibold">Sensitive AI access</dt><dd className="text-stone-600">{profile?.aiSensitiveAccess ? 'Allowed' : 'Off'}</dd></div>
        </dl>
        {isSupabaseConfigured ? <div className="mt-4"><Button variant="outline" onClick={() => { setSyncError(''); void syncNow().then(() => invalidate()).catch((error) => setSyncError(error instanceof Error ? error.message : 'Sync failed.')) }}>Sync now</Button>{syncError ? <p role="alert" className="mt-2 text-sm text-red-700">{syncError}</p> : null}</div> : null}
      </Section>

      <Section title="AI" className="surface-panel px-5 md:px-6">
        <div className="max-w-sm"><Field label="AI provider"><Select value={activeAiProvider} disabled={!settings || providerSaving} onChange={(event) => void setAiProvider(event.target.value as UserSettings['aiProvider'])}><option value="local">On-device</option><option value="openai">OpenAI</option><option value="gemini">Google Gemini</option><option value="anthropic">Anthropic Claude</option><option value="xai">xAI Grok</option><option value="openrouter">OpenRouter</option><option value="custom">Custom / OpenAI-compatible</option></Select></Field></div>
        <label className="mt-3 flex min-h-12 items-center gap-3 text-sm font-semibold"><input type="checkbox" className="size-5 accent-teal-900" disabled={!settings || aiSaving} checked={aiDraft ?? settings?.aiEnabled ?? false} onChange={(event) => void setAiEnabled(event.target.checked)} /> Enable Ask MyRide</label>
        <AiProviderSettings provider={activeAiProvider} />
        <p className="mt-3 text-sm leading-6 text-stone-600">MyRide calculates the journal answer locally first. External providers receive only that computed answer, never private safety fields. Provider credentials and model choices stay in this browser.</p>
        {aiMessage ? <p role="status" className="mt-2 text-sm text-teal-900">{aiMessage}</p> : null}
      </Section>

      <DataManagement />
      {supabase ? <Section title="Account" className="surface-panel px-5 md:px-6"><Button variant="outline" onClick={() => void supabase?.auth.signOut()}>Sign out</Button></Section> : null}
    </div>
  )
}
