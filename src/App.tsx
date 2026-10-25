import { useCallback, useEffect, useRef, useState } from 'react'
import type { RoomView } from '../shared/types'
import { ResultModal } from './components/ResultModal'
import { Lobby } from './components/Lobby'
import { ScoreSheet } from './components/ScoreSheet'
import { StatsScreen } from './components/StatsScreen'
import { Table } from './components/Table'
import { WaitingRoom } from './components/WaitingRoom'
import { useAuth } from './hooks/useAuth'
import { useNow } from './hooks/useNow'
import { useRoom } from './hooks/useRoom'
import { api, ApiError } from './lib/api'
import { unlockAudio } from './lib/sound'
import { supabaseConfigured } from './lib/supabase'

type Screen = 'home' | 'room' | 'stats'
const LS_ROOM = 'podrida.room'
const LS_NAME = 'podrida.name'
const SS_INVITE = 'podrida.invite'

const readInvite = () => {
  const fromUrl = new URLSearchParams(window.location.search).get('sala')
  if (fromUrl) {
    const code = fromUrl.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    sessionStorage.setItem(SS_INVITE, code)
    window.history.replaceState({}, '', window.location.pathname) // deja la URL limpia
    return code
  }
  return sessionStorage.getItem(SS_INVITE) ?? ''
}
const errText = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Algo salió mal.')

export default function App() {
  const auth = useAuth()
  const [roomCode, setRoomCodeState] = useState<string | null>(() => localStorage.getItem(LS_ROOM))
  const [screen, setScreen] = useState<Screen>(() => (localStorage.getItem(LS_ROOM) ? 'room' : 'home'))
  const [name, setNameState] = useState(() => localStorage.getItem(LS_NAME) ?? '')
  const [inviteCode] = useState(readInvite)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sheet, setSheet] = useState(false)
  const now = useNow(1000)

  // Los navegadores solo permiten audio tras un gesto: el primer toque lo desbloquea.
  useEffect(() => {
    const unlock = () => unlockAudio()
    window.addEventListener('pointerdown', unlock, { once: true })
    return () => window.removeEventListener('pointerdown', unlock)
  }, [])

  const setRoomCode = useCallback((c: string | null) => {
    if (c) localStorage.setItem(LS_ROOM, c); else localStorage.removeItem(LS_ROOM)
    setRoomCodeState(c)
  }, [])
  const setName = (n: string) => { setNameState(n); localStorage.setItem(LS_NAME, n) }

  const { room, fetchedAt, offline, gone, realtimeOk, apply, refresh } = useRoom(auth.me ? roomCode : null)

  useEffect(() => {
    if (!name && auth.me?.name) setName(auth.me.name.split(' ')[0].slice(0, 24))
  }, [auth.me?.name]) // eslint-disable-line react-hooks/exhaustive-deps

  // Si cambia de cuenta (entra/sale de Google), la sala anterior ya no es suya.
  const lastUser = useRef<string | null>(null)
  useEffect(() => {
    const id = auth.me?.id ?? null
    if (lastUser.current && id && id !== lastUser.current) { setRoomCode(null); setScreen('home') }
    if (id) lastUser.current = id
  }, [auth.me?.id, setRoomCode])

  const run = useCallback(async (fn: () => Promise<RoomView>) => {
    setBusy(true); setError('')
    try { apply(await fn()) } catch (e) { setError(errText(e)); void refresh() } finally { setBusy(false) }
  }, [apply, refresh])

  async function enterRoom(fn: () => Promise<RoomView>) {
    setBusy(true); setError('')
    try {
      const v = await fn()
      sessionStorage.removeItem(SS_INVITE)
      setRoomCode(v.roomCode); setScreen('room')
    } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }

  const goHome = () => { setError(''); setScreen('home') }
  const closeRoomAndHome = () => { setRoomCode(null); setError(''); setScreen('home') }
  async function leaveRoom() {
    if (!roomCode) return closeRoomAndHome()
    setBusy(true)
    try { await api.leave(roomCode) } catch { /* si ya no existe, da igual */ }
    setBusy(false); closeRoomAndHome()
  }

  // ---------------------------------------------------------------- pantallas de estado
  if (!supabaseConfigured) return <main className="page"><section className="panel"><h2>Falta configurar Supabase</h2><p className="small-note">Define <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> (archivo <code>.env.local</code> en local, o variables de entorno en Vercel). Mira el README.</p></section></main>
  if (!auth.ready) return <main className="page"><section className="panel waiting-panel"><div className="waiting-pulse"><i /> Conectando…</div></section></main>
  if (!auth.me) return <main className="page"><section className="panel"><h2>No se pudo iniciar sesión</h2><p className="small-note">{auth.error || 'Recarga la página.'}</p><button className="primary" onClick={() => window.location.reload()}>Reintentar</button></section></main>

  if (screen === 'stats') return <StatsScreen me={auth.me} onBack={goHome} onGoogle={() => void auth.signInWithGoogle()} />

  if (screen === 'room' && roomCode) {
    if (gone) return <main className="page"><section className="panel waiting-panel"><h2>Esta sala ya no está disponible</h2><p className="small-note">{gone}</p><button className="primary" onClick={closeRoomAndHome}>Volver al inicio</button></section></main>
    if (!room) return <main className="page"><section className="panel waiting-panel"><div className="waiting-pulse"><i /> {offline ? 'Sin conexión. Reintentando…' : 'Cargando la partida…'}</div><button className="text-action" onClick={goHome}>← Inicio</button></section></main>
    const me = room.players.find(p => p.id === room.viewerId)
    if (room.status === 'CLOSED' || me?.left) return <main className="page"><section className="panel waiting-panel"><h2>La sala se ha cerrado</h2><button className="primary" onClick={closeRoomAndHome}>Volver al inicio</button></section></main>
    if (room.status === 'WAITING' || !room.game) return <WaitingRoom room={room} busy={busy} error={error} onStart={() => void run(() => api.start(room.roomCode))} onLeave={() => void leaveRoom()} onHome={goHome} />
    const finished = room.game.status === 'FINISHED'
    return <>
      <Table
        room={room} game={room.game} busy={busy} error={error} offline={offline} realtimeOk={realtimeOk} nowMs={now} fetchedAt={fetchedAt}
        onClearError={() => setError('')}
        onBid={v => void run(() => api.bid(room.roomCode, v))}
        onPlay={cardId => void run(() => api.play(room.roomCode, cardId))}
        onAbandon={() => void run(() => api.abandon(room.roomCode))}
        onHome={goHome}
      />
      {finished && <ResultModal room={room} busy={busy} onRematch={() => void run(() => api.rematch(room.roomCode))} onLeave={() => void leaveRoom()} onStats={() => setScreen('stats')} onSheet={() => setSheet(true)} />}
      {finished && sheet && <ScoreSheet game={room.game} onClose={() => setSheet(false)} />}
    </>
  }

  return <Lobby
    me={auth.me} name={name} onName={setName} inviteCode={inviteCode} busy={busy} error={error || auth.error}
    activeRoom={roomCode && !gone && room?.status !== 'CLOSED' ? roomCode : null}
    onCreate={doubleLap => void enterRoom(() => api.create(name, { doubleLap }))}
    onJoin={code => void enterRoom(() => api.join(code, name))}
    onResume={() => setScreen('room')}
    onStats={() => setScreen('stats')}
    onGoogle={() => void auth.signInWithGoogle()}
    onSignOut={() => void auth.signOut()}
  />
}
