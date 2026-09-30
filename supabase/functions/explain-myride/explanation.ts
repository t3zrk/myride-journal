export type ModelResponse = {
  output_text?: unknown
  output?: Array<{ content?: Array<{ type?: string; text?: unknown }> }>
}

function outputText(response: ModelResponse) {
  if (typeof response.output_text === 'string') return response.output_text.trim()
  return response.output?.flatMap((item) => item.content ?? [])
    .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
    .map((item) => String(item.text))
    .join(' ').trim() ?? ''
}

export function safeExplanation(response: ModelResponse) {
  const explanation = outputText(response)
  if (!explanation || explanation === 'NONE' || explanation.length > 220 || /[\r\n]/.test(explanation)) return ''
  const numericClaim = /\d|[%\u20b9$\u20ac\u00a3]|\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|trillion|first|second|third)\b/i
  return numericClaim.test(explanation) ? '' : explanation
}
