import { useEffect, useState } from 'react'
import type { FormEvent, PropsWithChildren } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from './ui/Button'
import { Field, Input } from './ui/Field'
import { queryKeys } from '../hooks/useMyRideData'
import { supabase } from '../lib/supabase'
import { syncNow } from '../services/sync/sync'

const boundUserKey = 'myride-cloud-user'

export function AuthGate({ children }: PropsWithChildren) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [readyUserId, setReadyUserId] = useState<string>()
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    client.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => listener.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  const boundUser = localStorage.getItem(boundUserKey)
  const wrongUser = Boolean(userId && boundUser && boundUser !== userId)

  useEffect(() => {
    if (!userId || wrongUser || !supabase) return
    if (!boundUser) localStorage.setItem(boundUserKey, userId)
    let cancelled = false
    const run = () => { void syncNow().catch((error) => { if (!cancelled) setMessage(error instanceof Error ? error.message : 'Sync unavailable') }) }
    void syncNow().catch((error) => { if (!cancelled) setMessage(error instanceof Error ? error.message : 'Sync unavailable') }).finally(() => { if (!cancelled) setReadyUserId(userId) })
    window.addEventListener('online', run)
    const timer = window.setInterval(run, 30000)
    return () => { cancelled = true; window.removeEventListener('online', run); window.clearInterval(timer) }
  }, [userId, wrongUser, boundUser])

  useEffect(() => {
    const refresh = () => { void queryClient.invalidateQueries({ queryKey: queryKeys.all }) }
    window.addEventListener('myride:synced', refresh)
    return () => window.removeEventListener('myride:synced', refresh)
  }, [queryClient])

  if (!supabase) return children
  if (session === undefined) return <div className="grid min-h-svh place-items-center bg-stone-50 text-stone-700">Opening MyRide...</div>
  if (wrongUser) return <main className="mx-auto grid min-h-svh max-w-md place-content-center gap-4 px-5"><h1 className="font-serif text-4xl">Different account</h1><p>This device already has a journal linked to another account. Sign in with that account to protect the local records.</p><Button onClick={() => void supabase?.auth.signOut()}>Sign out</Button></main>
  if (session && readyUserId !== userId) return <div className="grid min-h-svh place-items-center bg-stone-50 text-stone-700">Opening your journal...</div>
  if (session) return children

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setMessage('')
    const result = mode === 'sign-in' ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password })
    if (result.error) setMessage(result.error.message)
    else if (mode === 'sign-up' && !result.data.session) setMessage('Check your email to confirm the account, then sign in.')
  }

  return <main className="mx-auto grid min-h-svh max-w-md place-content-center gap-5 px-5 py-10"><div><p className="font-journal text-5xl text-teal-900">MyRide</p><h1 className="mt-6 text-3xl font-semibold">{mode === 'sign-in' ? 'Sign in to your journal' : 'Create your account'}</h1></div><form onSubmit={submit} className="surface-panel grid gap-4 p-5"><Field label="Email"><Input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></Field><Field label="Password"><Input required type="password" minLength={6} autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} /></Field>{message ? <p role="status" className="text-sm text-teal-900">{message}</p> : null}<Button type="submit">{mode === 'sign-in' ? 'Sign in' : 'Create account'}</Button></form><Button variant="ghost" onClick={() => { setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); setMessage('') }}>{mode === 'sign-in' ? 'Create an account' : 'Already have an account? Sign in'}</Button></main>
}
