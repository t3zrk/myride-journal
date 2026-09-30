import { useId, useState } from 'react'
import { MapPin, Search } from 'lucide-react'
import { searchLocations, type LocationSuggestion } from '../services/geocoding/nominatim'
import { Button } from './ui/Button'
import { Input } from './ui/Field'

interface LocationSearchFieldProps {
  label: string
  searchLabel: string
  value: string
  onChange: (value: string) => void
  onSelect: (suggestion: LocationSuggestion) => void
}

export function LocationSearchField({ label, searchLabel, value, onChange, onSelect }: LocationSearchFieldProps) {
  const inputId = useId()
  const [results, setResults] = useState<LocationSuggestion[]>([])
  const [message, setMessage] = useState('')
  const [searching, setSearching] = useState(false)

  async function search() {
    if (value.trim().length < 2) {
      setResults([])
      setMessage('Enter at least two characters to search.')
      return
    }
    setSearching(true)
    setMessage('')
    try {
      const suggestions = await searchLocations(value)
      setResults(suggestions)
      setMessage(suggestions.length ? '' : 'No matching locations found. Your typed location is unchanged.')
    } catch {
      setResults([])
      setMessage('Location search unavailable. Your typed location is unchanged.')
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="grid min-w-0 gap-2 text-sm font-medium text-stone-800">
      <label htmlFor={inputId}>{label}</label>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
        <Input id={inputId} required value={value} onChange={(event) => { onChange(event.target.value); setResults([]); setMessage('') }} />
        <Button type="button" variant="outline" aria-label={searchLabel} disabled={searching} onClick={() => void search()}>
          <Search size={18} />
          <span className="hidden sm:inline">{searching ? 'Searching' : 'Search'}</span>
        </Button>
      </div>
      {results.length ? (
        <ul className="overflow-hidden rounded-md border border-stone-200 bg-white shadow-sm" aria-label={`${label} suggestions`}>
          {results.map((result) => (
            <li key={`${result.latitude}-${result.longitude}-${result.label}`} className="border-b border-stone-100 last:border-b-0">
              <button type="button" className="flex min-h-12 w-full items-start gap-3 px-3 py-3 text-left font-normal text-stone-700 transition hover:bg-teal-50 hover:text-stone-950 focus-visible:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-teal-800" onClick={() => { onSelect(result); setResults([]); setMessage('Location selected.') }}>
                <MapPin size={17} className="mt-0.5 shrink-0 text-teal-900" />
                <span className="leading-5">{result.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {message ? <p role="status" className="text-xs font-normal text-stone-600">{message}</p> : null}
    </div>
  )
}
