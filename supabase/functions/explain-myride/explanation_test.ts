import { safeExplanation } from './explanation.ts'

Deno.test('cloud explanation accepts only brief non-numeric context', () => {
  const allowed = safeExplanation({ output_text: 'This comparison uses verified full-tank records.' })
  if (allowed !== 'This comparison uses verified full-tank records.') throw new Error('Grounded explanation was rejected')
  const nested = safeExplanation({ output: [{ content: [{ type: 'output_text', text: 'Weather details reflect recorded snapshots.' }] }] })
  if (nested !== 'Weather details reflect recorded snapshots.') throw new Error('Nested response text was not read')
  for (const text of ['The ride covered 600 km.', 'It was the second longest.', 'Costs were twenty dollars.', 'The bill was \u20b9500.', 'NONE']) {
    if (safeExplanation({ output_text: text }) !== '') throw new Error(`Unsafe explanation was accepted: ${text}`)
  }
})
