import { useEffect, useState } from 'react'
import { repository } from '../repositories/localRepository'
import type { ReadinessCheck } from '../types/myride'

const items = ['Tyres', 'Tyre pressure', 'Brakes', 'Chain', 'Engine oil', 'Lights', 'Horn', 'Fuel', 'Documents', 'Luggage', 'Rain gear', 'Tools', 'Emergency information']

export function ReadinessChecklist({ tripId, motorcycleId }: { tripId?: string; motorcycleId?: string }) {
  const [checks, setChecks] = useState<ReadinessCheck[]>([])
  const [pending, setPending] = useState<Record<string, boolean>>({})
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  useEffect(() => {
    void repository.readinessChecks.byScope(tripId, motorcycleId).then(setChecks)
  }, [tripId, motorcycleId])

  async function toggle(item: string, checked: boolean) {
    setPending((current) => ({ ...current, [item]: checked }))
    setError('')
    setStatus('Saving checklist...')
    try {
      await repository.readinessChecks.set({ tripId, motorcycleId }, item, checked)
      setChecks(await repository.readinessChecks.byScope(tripId, motorcycleId))
      setStatus('Checklist saved.')
    } catch {
      setError(`${item} could not be saved.`)
      setStatus('')
    } finally {
      setPending((current) => {
        const next = { ...current }
        delete next[item]
        return next
      })
    }
  }

  return <div><div className="grid gap-2 sm:grid-cols-2">{items.map((item) => {
    const checked = pending[item] ?? checks.find((check) => check.item === item)?.checked ?? false
    return <label key={item} className={`flex min-h-12 items-center gap-3 rounded-md border px-3 text-sm transition ${checked ? 'border-teal-200 bg-teal-50 font-semibold text-teal-950' : 'border-stone-200 bg-white text-stone-800 hover:border-stone-300 hover:bg-stone-50'}`}><input type="checkbox" className="size-5 accent-teal-900" checked={checked} onChange={(event) => void toggle(item, event.target.checked)} />{item}</label>
  })}</div>{status ? <p role="status" className="mt-3 text-sm font-medium text-teal-900">{status}</p> : null}{error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}</div>
}
