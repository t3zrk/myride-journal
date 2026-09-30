import { supabase } from '../../lib/supabase'
import { explainWithDeviceOpenAi, getDeviceOpenAiApiKey } from './deviceOpenAi'

export async function explainWithCloud(facts: string) {
  if (!navigator.onLine) throw new Error('Cloud explanation is unavailable. Showing the local answer.')
  const deviceApiKey = getDeviceOpenAiApiKey()
  if (deviceApiKey) return explainWithDeviceOpenAi(facts, deviceApiKey)
  if (!supabase) throw new Error('Add an OpenAI API key in Profile or Settings. Showing the local answer.')
  const { data, error } = await supabase.functions.invoke('explain-myride', { body: { facts } })
  if (error || !data || typeof data.explanation !== 'string') throw new Error('Cloud explanation is unavailable. Showing the local answer.')
  return data.explanation.trim()
}
