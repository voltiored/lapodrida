import { useState } from 'react'
import { MAX_PLAYERS, MIN_PLAYERS, type RoomView } from '../../shared/types'

export function WaitingRoom({ room, busy, error, onStart, onLeave, onHome }: { room: RoomView; busy: boolean; error: string; onStart: () => void; onLeave: () => void; onHome: () => void }) {
  const [copied, setCopied] = useState('')
  const link = `${window.location.origin}${import.meta.env.BASE_URL}?sala=${room.roomCode}`
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); window.setTimeout(() => setCopied(''), 1800) } catch { window.prompt('Copia esto:', text) }
  }
  const share = () => {
    if (navigator.share) void navigator.share({ title: 'La Podrida', text: `Ven a jugar a La Podrida. Código de sala: ${room.roomCode}`, url: link }).catch(() => {})
    else void copy(link, 'enlace')
  }
  const isHost = room.hostId === room.viewerId
  const n = room.players.length
  const missing = Math.max(0, MIN_PLAYERS - n)
  return <main className="page">
    <header className="topbar"><div className="brand-mark">♠</div><div><div className="brand">LA <span>PODRIDA</span></div><div className="tagline">Sala privada</div></div></header>
    <section className="panel waiting-panel">
      <div className="panel-title"><span className="step">02</span><div><h2>Sala creada</h2><p>Comparte el código o el enlace con los demás jugadores ({MIN_PLAYERS} a {MAX_PLAYERS}).</p></div></div>
      <div className="waiting-code">{room.roomCode}</div>
      <button className="primary" onClick={() => void copy(room.roomCode, 'código')}>{copied === 'código' ? '¡Copiado!' : 'Copiar código de sala'}</button>
      <button className="secondary share-btn" onClick={share}>{copied === 'enlace' ? '¡Enlace copiado!' : '📤 Compartir enlace de invitación'}</button>

      <h3 className="pd-players-title">Jugadores <span>{n}/{MAX_PLAYERS}</span></h3>
      <ul className="pd-players">
        {room.players.map(p => <li key={p.id}>
          <i className={`bd-dot ${p.connected ? '' : 'off'}`} /><span>{p.name}{p.id === room.viewerId && ' (tú)'}</span>{p.isHost && <em>anfitrión</em>}
        </li>)}
      </ul>
      <p className="small-note">Dos vueltas: <b>{room.doubleLap ? 'sí' : 'no'}</b>. {isHost ? 'Cuando estéis todos, pulsa empezar.' : 'Espera a que el anfitrión empiece la partida.'}</p>

      {isHost && <button className="primary" disabled={busy || !room.canStart} onClick={onStart}>{room.canStart ? '▶ Empezar la partida' : `Faltan ${missing} jugador${missing === 1 ? '' : 'es'} para empezar`}</button>}
      {!isHost && <div className="waiting-pulse"><i /> Esperando al anfitrión…</div>}
      {error && <div className="error" role="alert">{error}</div>}
      <button className="text-action" onClick={onHome}>← Volver al inicio (la sala sigue abierta)</button>
      <button className="text-action" disabled={busy} onClick={onLeave}>Salir de la sala</button>
    </section>
  </main>
}
