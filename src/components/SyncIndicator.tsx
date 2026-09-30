import { useEffect, useState } from 'react'
import { Cloud, CloudOff } from 'lucide-react'
import { useDashboardData } from '../hooks/useMyRideData'
import { isSupabaseConfigured } from '../lib/supabase'
import { useUiStore } from '../stores/uiStore'
import { cn } from '../utils/cn'

export function SyncIndicator() {
  const { data } = useDashboardData()
  const queued = data?.queue.length ?? 0
  const [online, setOnline] = useState(navigator.onLine)
  const syncMessage = useUiStore((state) => state.syncMessage)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  const label = !online ? 'Offline' : !isSupabaseConfigured ? 'Local only' : syncMessage === 'Sync error' ? 'Sync error' : syncMessage === 'Syncing...' ? 'Syncing...' : queued > 0 ? `${queued} queued` : 'Synced'
  const tone = !online || queued > 0
    ? 'border-amber-300 bg-amber-50 text-amber-800'
    : syncMessage === 'Sync error'
      ? 'border-red-300 bg-red-50 text-red-800'
      : isSupabaseConfigured
        ? 'border-green-300 bg-green-50 text-green-800'
        : 'border-stone-300 bg-white text-stone-600'

  return (
    <div className={cn('inline-flex items-center justify-self-end gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold shadow-sm sm:px-3', tone)} title={`Storage status: ${label}`}>
      {online ? <Cloud size={14} aria-hidden="true" /> : <CloudOff size={14} aria-hidden="true" />}
      <span>{label}</span>
    </div>
  )
}
