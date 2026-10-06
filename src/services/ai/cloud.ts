import { supabase } from '../../lib/supabase'
import type { UserSettings } from '../../types/myride'
import { explainWithDeviceAi, getDeviceAiConfig, type DeviceAiProvider } from './deviceAi'

export async function explainWithCloud(facts: string, provider: UserSettings['aiProvider']) {
  if (provider === 'local') return ''
  if (!navigator.onLine) throw new Error('Cloud explanation is unavailable. Showing the local answer.')

  const deviceProvider = provider as DeviceAiProvider
  const config = getDeviceAiConfig(deviceProvider)
  if (config.apiKey) return explainWithDeviceAi(facts, deviceProvider)

  if (provider !== 'openai') throw new Error(`Add a ${provider} API key in Settings. Showing the local answer.`)
  if (!supabase) throw new Error('Add an OpenAI API key in Settings. Showing the local answer.')

  const { data, error } = await supabase.functions.invoke('explain-myride', { body: { facts } })
  if (error || !data || typeof data.explanation !== 'string') throw new Error('Cloud explanation is unavailable. Showing the local answer.')
  return data.explanation.trim()
}
