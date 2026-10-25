import { useState } from 'react'
import type { Me } from '../hooks/useAuth'
import { RulesModal } from './RulesModal'

interface Props {
  me: Me
  name: string
  onName: (n: string) => void
  inviteCode: string
  busy: boolean
  error: string
  activeRoom: string | null
  onCreate: (doubleLap: boolean) => void
  onJoin: (code: string) => void
  onResume: () => void
  onStats: () => void
  onGoogle: () => void
  onSignOut: () => void
}

export function Lobby(p: Props) {
  const [joinCode, setJoinCode] = useState(p.inviteCode)
  const [doubleLap, setDoubleLap] = useState(false)
  const [rules, setRules] = useState(false)
  const ready = p.name.trim().length > 0
  return <main className="page">
    <header className="topbar">
      <div className="brand-mark">♠</div>
      <div><div className="brand">LA <span>PODRIDA</span></div><div className="tagline">Aciertas lo que cantas… o se pudre.</div></div>
      <div className="user-chip">
        {p.me.avatar && <img src={p.me.avatar} alt="" referrerPolicy="no-referrer" />}
        <span>{p.me.isGuest ? 'Invitado' : (p.me.name ?? 'Con Google')}</span>
        {p.me.isGuest ? <button onClick={p.onGoogle}>Entrar con Google</button> : <button onClick={p.onSignOut}>Salir</button>}
      </div>
    </header>

    <section className="hero">
      <div className="eyebrow">DE 3 A 6 JUGADORES · UNA MESA</div>
      <h1>Canta tus bazas,<br /><em>y cúmplelas.</em></h1>
      <p>Crea una sala privada y comparte el código con tus amigos. Gana quien acierta exactamente cuántas bazas va a hacer.</p>
      <div className="cards-preview" aria-hidden="true"><div className="playing-card dark tilt-left"><small>K ♠</small><strong>♠</strong><small className="bottom">K ♠</small></div><div className="playing-card red raised"><small>A ♥</small><strong>♥</strong><small className="bottom">A ♥</small></div><div className="playing-card dark tilt-right"><small>7 ♣</small><strong>♣</strong><small className="bottom">7 ♣</small></div></div>
    </section>

    {p.activeRoom && <section className="panel resume-panel">
      <div><strong>Tienes una partida en la sala {p.activeRoom}</strong><p>Si se cortó Internet o cerraste la pestaña, puedes volver y seguirá donde la dejaste.</p></div>
      <button className="primary" onClick={p.onResume}>Volver a la partida</button>
    </section>}

    <section className="panel">
      <div className="panel-title"><span className="step">01</span><div><h2>Entra a la mesa</h2><p>{p.inviteCode ? `Te han invitado a la sala ${p.inviteCode}.` : 'Elige cómo quieres empezar.'}</p></div></div>
      <label htmlFor="name">Tu nombre de jugador</label>
      <input id="name" value={p.name} onChange={e => p.onName(e.target.value)} maxLength={24} placeholder="Ej. Lautaro" autoComplete="nickname" />
      <label className="check"><input type="checkbox" checked={doubleLap} onChange={e => setDoubleLap(e.target.checked)} /><span>Dar las dos vueltas <small>(baja hasta 1 carta y vuelve a subir hasta el máximo)</small></span></label>
      <button className="primary" disabled={p.busy || !ready} onClick={() => p.onCreate(doubleLap)}>{p.busy ? 'Un momento…' : '＋ Crear sala privada'}</button>
      <div className="divider"><span>O ÚNETE A UNA SALA</span></div>
      <div className="join-row">
        <input aria-label="Código de sala" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} placeholder="CÓDIGO" maxLength={6} autoCapitalize="characters" autoComplete="off" />
        <button className="secondary" disabled={p.busy || !ready || joinCode.length < 6} onClick={() => p.onJoin(joinCode)}>Unirme →</button>
      </div>
      {p.error && <div className="error" role="alert">{p.error}</div>}
    </section>

    <section className="panel stats-teaser">
      <div className="teaser-buttons">
        <button className="secondary" onClick={() => setRules(true)}>📖 Reglas</button>
        <button className="secondary" onClick={p.onStats}>📊 Mis estadísticas</button>
      </div>
      {p.me.isGuest && <p className="small-note">Juegas como invitado: tu historial queda en este navegador. <button className="text-action" onClick={p.onGoogle}>Entra con Google</button> para conservarlo en cualquier dispositivo.</p>}
    </section>
    <footer><span>♠ ♥ ♣ ♦</span><p>Partidas de 3 a 6 jugadores</p></footer>
    {rules && <RulesModal onClose={() => setRules(false)} />}
  </main>
}
