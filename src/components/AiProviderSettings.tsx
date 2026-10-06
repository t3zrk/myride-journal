import { useEffect, useState } from 'react'
import type { UserSettings } from '../types/myride'
import { deviceAiProviders, getConfiguredAiProviders, getDeviceAiConfig, removeDeviceAiConfig, saveDeviceAiConfig, type DeviceAiProvider } from '../services/ai/deviceAi'
import { Button } from './ui/Button'
import { Field, Input } from './ui/Field'

export function AiProviderSettings({ provider }: { provider: UserSettings['aiProvider'] }) {
  const active = provider === 'local' ? null : provider as DeviceAiProvider
  const [credential, setCredential] = useState('')
  const [model, setModel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [saved, setSaved] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [configured, setConfigured] = useState<DeviceAiProvider[]>([])

  useEffect(() => {
    setConfigured(getConfiguredAiProviders())
    setCredential('')
    setMessage('')
    setError('')
    if (!active) {
      setModel('')
      setBaseUrl('')
      setSaved(false)
      return
    }
    const config = getDeviceAiConfig(active)
    setModel(config.model)
    setBaseUrl(config.baseUrl ?? '')
    setSaved(Boolean(config.apiKey))
  }, [active])

  if (!active) return <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50/70 p-4 text-sm text-stone-600">On-device mode keeps Ask MyRide fully local. Saved provider credentials remain on this browser when you switch providers.</div>

  const definition = deviceAiProviders[active]

  function save() {
    setMessage('')
    setError('')
    try {
      saveDeviceAiConfig(active, { apiKey: credential, model, baseUrl })
      setCredential('')
      setSaved(true)
      setConfigured(getConfiguredAiProviders())
      setMessage(`${definition.label} saved on this device.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Provider settings could not be saved.')
    }
  }

  function remove() {
    removeDeviceAiConfig(active)
    const next = getDeviceAiConfig(active)
    setCredential('')
    setModel(next.model)
    setBaseUrl(next.baseUrl ?? '')
    setSaved(false)
    setConfigured(getConfiguredAiProviders())
    setMessage(`${definition.label} removed from this device.`)
  }

  return <div className="mt-4 grid gap-4 rounded-xl border border-teal-100 bg-teal-50/55 p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-stone-950">{definition.label}</p><p className="mt-1 text-sm text-stone-600">{definition.description}</p></div><span className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-stone-600">{saved ? 'Configured' : 'Not configured'}</span></div>
    <div className="grid gap-4 md:grid-cols-2"><Field label="Model ID"><Input value={model} spellCheck={false} placeholder={definition.defaultModel || 'provider/model-name'} onChange={(event) => setModel(event.target.value)} /></Field>{active === 'custom' ? <Field label="API base URL"><Input value={baseUrl} spellCheck={false} placeholder="https://api.example.com/v1" onChange={(event) => setBaseUrl(event.target.value)} /></Field> : null}</div>
    <Field label={definition.keyLabel}><Input type="password" value={credential} autoComplete="new-password" spellCheck={false} placeholder={saved ? 'Enter a new value only to replace the saved one' : definition.keyPlaceholder} onChange={(event) => setCredential(event.target.value)} /></Field>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    <div className="flex flex-wrap gap-2"><Button type="button" disabled={!model.trim() || (!saved && !credential.trim()) || (active === 'custom' && !baseUrl.trim())} onClick={save}>Save provider</Button>{saved ? <Button type="button" variant="ghost" onClick={remove}>Remove saved credential</Button> : null}</div>
    <p className="text-xs leading-5 text-stone-600">Provider credentials stay in this browser only. They are not synced or included in MyRide backups.</p>
    {configured.length ? <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase tracking-[0.1em] text-stone-500">Configured</span>{configured.map((item) => <span key={item} className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-700">{deviceAiProviders[item].label}</span>)}</div> : null}
    {message ? <p role="status" className="rounded-md bg-white/80 px-3 py-2 text-sm font-medium text-teal-900">{message}</p> : null}
  </div>
}
