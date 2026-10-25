import { useCallback, useEffect, useRef, useState } from 'react'
import type { RoomView } from '../../shared/types'
import { ApiError, api } from '../lib/api'
import { supabase } from '../lib/supabase'

const POLL_MS = 10_000

/**
 * Mantiene sincronizada la sala:
 *  · Supabase Realtime (broadcast "tick") → al instante cuando el rival juega.
 *  · Sondeo cada 10 s (solo con la pestaña visible) → red de seguridad y "latido" de conexión.
 *  · Al volver la conexión o la pestaña → recarga inmediata (reconexión).
 */
export function useRoom(code: string | null) {
  const [room, setRoom] = useState<RoomView | null>(null)
  const [fetchedAt, setFetchedAt] = useState(Date.now())
  const [offline, setOffline] = useState(false)
  const [gone, setGone] = useState('')
  const [realtimeOk, setRealtimeOk] = useState(false)
  const versionRef = useRef(-1)
  const codeRef = useRef<string | null>(code)
  const inflight = useRef(false)

  const apply = useCallback((r: RoomView) => {
    if (r.roomCode !== codeRef.current) return
    if (r.version < versionRef.current) return // respuesta vieja que llegó tarde
    versionRef.current = r.version
    setRoom(r); setFetchedAt(Date.now()); setOffline(false)
  }, [])

  const refresh = useCallback(async () => {
    const c = codeRef.current
    if (!c || inflight.current) return
    inflight.current = true
    try { apply(await api.view(c)) }
    catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 403)) setGone(e.message)
      else if (e instanceof ApiError && e.status === 401) void supabase.auth.refreshSession()
      else setOffline(true)
    } finally { inflight.current = false }
  }, [apply])

  useEffect(() => {
    codeRef.current = code
    versionRef.current = -1
    setRoom(null); setGone(''); setOffline(false)
    if (!code) return

    void refresh()
    const channel = supabase
      .channel(`podrida-room:${code}`)
      .on('broadcast', { event: 'tick' }, msg => {
        const v = Number((msg.payload as { v?: number } | undefined)?.v ?? Infinity)
        if (v > versionRef.current) void refresh()
      })
      .subscribe(status => setRealtimeOk(status === 'SUBSCRIBED'))

    const timer = window.setInterval(() => { if (!document.hidden) void refresh() }, POLL_MS)
    const onVisible = () => { if (!document.hidden) void refresh() }
    const onOnline = () => void refresh()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    window.addEventListener('focus', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('focus', onVisible)
      void supabase.removeChannel(channel)
    }
  }, [code, refresh])

  return { room, fetchedAt, offline, gone, realtimeOk, apply, refresh }
}
