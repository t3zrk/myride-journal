import { useState } from 'react'
import { Eye, EyeOff, Save, Trash2 } from 'lucide-react'
import { getDeviceOpenAiApiKey, removeDeviceOpenAiApiKey, saveDeviceOpenAiApiKey } from '../services/ai/deviceOpenAi'
import { Button } from './ui/Button'
import { Input } from './ui/Field'

export function OpenAiKeySettings() {
  const [apiKey, setApiKey] = useState('')
  const [hasSavedKey, setHasSavedKey] = useState(() => Boolean(getDeviceOpenAiApiKey()))
  const [showKey, setShowKey] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  function saveKey() {
    setMessage('')
    setError('')
    try {
      saveDeviceOpenAiApiKey(apiKey)
      setApiKey('')
      setShowKey(false)
      setHasSavedKey(true)
      setMessage('API key saved on this device.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The API key could not be saved.')
    }
  }

  function removeKey() {
    setMessage('')
    setError('')
    try {
      removeDeviceOpenAiApiKey()
      setApiKey('')
      setShowKey(false)
      setHasSavedKey(false)
      setMessage('Saved API key removed from this device.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The saved API key could not be removed.')
    }
  }

  return (
    <div className="mt-4 grid max-w-xl gap-4 rounded-md border border-teal-100 bg-teal-50/60 p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="grid min-w-0 gap-2 text-sm font-medium text-stone-800">
          <label htmlFor="openai-api-key">OpenAI API key</label>
          <div className="relative">
            <Input
              id="openai-api-key"
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              autoComplete="new-password"
              spellCheck={false}
              placeholder={hasSavedKey ? 'Enter a new key to replace the saved key' : 'Paste an OpenAI API key'}
              onChange={(event) => setApiKey(event.target.value)}
              className="pr-12"
            />
            <button
              type="button"
              className="absolute right-1 top-1 inline-flex size-10 items-center justify-center rounded-md text-stone-600 hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800"
              aria-label={showKey ? 'Hide API key' : 'Show API key'}
              title={showKey ? 'Hide API key' : 'Show API key'}
              onClick={() => setShowKey((visible) => !visible)}
            >
              {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {error ? <span role="alert" className="text-sm text-red-700">{error}</span> : null}
        </div>
        <Button type="button" disabled={!apiKey.trim()} onClick={saveKey}><Save size={18} /> Save key</Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={`text-sm ${hasSavedKey ? 'font-medium text-teal-950' : 'text-stone-600'}`}>{hasSavedKey ? 'A key is saved in this browser only. It is not synced or included in backups.' : 'No key is saved on this device.'}</p>
        {hasSavedKey ? <Button type="button" variant="ghost" onClick={removeKey}><Trash2 size={18} /> Remove key</Button> : null}
      </div>
      <p className="text-xs text-stone-500">Use this only on a trusted device. The browser sends the locally computed answer directly to OpenAI when this provider is selected.</p>
      {message ? <p role="status" className="rounded-md bg-white/80 px-3 py-2 text-sm font-medium text-teal-900">{message}</p> : null}
    </div>
  )
}
