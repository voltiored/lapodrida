import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useState } from 'react'
import { supabase, supabaseConfigured } from '../lib/supabase'

export interface Me {
  id: string
  isGuest: boolean
  name: string | null
  avatar: string | null
}

/** Sesión de Supabase: cada visitante entra como invitado (anónimo) y puede pasarse a Google cuando quiera. */
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabaseConfigured) { setReady(true); return }
    let alive = true
    const ensureSession = async () => {
      const { data } = await supabase.auth.getSession() // espera a procesar el regreso de Google, si lo hay
      if (!alive) return
      if (data.session) { setSession(data.session); setReady(true); return }
      const { data: anon, error: err } = await supabase.auth.signInAnonymously()
      if (!alive) return
      if (err) setError('No se pudo iniciar la sesión de invitado. ¿Están activados los "anonymous sign-ins" en Supabase? (' + err.message + ')')
      setSession(anon?.session ?? null)
      setReady(true)
    }
    void ensureSession()
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_OUT') { setSession(null); void ensureSession(); return }
      if (s) setSession(s)
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    const { error: err } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
    if (err) setError(err.message)
  }, [])
  const signOut = useCallback(async () => { await supabase.auth.signOut() }, [])

  const u = session?.user
  const meta = (u?.user_metadata ?? {}) as Record<string, unknown>
  const me: Me | null = u
    ? {
        id: u.id,
        isGuest: Boolean(u.is_anonymous),
        name: typeof meta.full_name === 'string' ? meta.full_name : typeof meta.name === 'string' ? meta.name : null,
        avatar: typeof meta.avatar_url === 'string' ? meta.avatar_url : typeof meta.picture === 'string' ? meta.picture : null,
      }
    : null

  return { me, ready, error, signInWithGoogle, signOut }
}
