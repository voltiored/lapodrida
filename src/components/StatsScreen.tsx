import { useEffect, useMemo, useState } from 'react'
import type { MatchRecord } from '../../shared/types'
import type { Me } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { computeStats } from '../lib/stats'

const fmtDate = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const fmtDur = (ms: number) => { const m = Math.round(ms / 60000); return m < 1 ? '<1 min' : `${m} min` }
const streakText = (t: string | null, n: number) => (!t ? '—' : `${n} ${t === 'WIN' ? (n === 1 ? 'victoria' : 'victorias') : t === 'LOSS' ? (n === 1 ? 'derrota' : 'derrotas') : (n === 1 ? 'empate' : 'empates')}`)
const label = (r: string) => (r === 'WIN' ? 'Victoria' : r === 'DRAW' ? 'Empate' : 'Derrota')

export function StatsScreen({ me, onBack, onGoogle }: { me: Me; onBack: () => void; onGoogle: () => void }) {
  const [matches, setMatches] = useState<MatchRecord[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    void supabase.from('podrida_matches').select('*').order('ended_at', { ascending: false }).limit(1000).then(({ data, error: err }) => {
      if (!alive) return
      if (err) setError('No se pudo cargar el historial: ' + err.message)
      else setMatches((data ?? []) as MatchRecord[])
    })
    return () => { alive = false }
  }, [])
  const stats = useMemo(() => (matches ? computeStats(matches, me.id) : null), [matches, me.id])

  return <main className="page stats-page">
    <header className="topbar"><button className="back-button" onClick={onBack}>← Inicio</button><div className="brand">MIS <span>ESTADÍSTICAS</span></div></header>
    {me.isGuest && <div className="banner banner-info"><span>Estás como invitado: estas estadísticas solo existen en este navegador.</span><span className="banner-actions"><button className="secondary" onClick={onGoogle}>Entrar con Google</button></span></div>}
    {error && <div className="error" role="alert">{error}</div>}
    {!stats && !error && <p className="small-note">Cargando…</p>}
    {stats && <>
      <section className="stat-grid">
        <div className="stat"><b>{stats.played}</b><span>Partidas</span></div>
        <div className="stat good"><b>{stats.wins}</b><span>Victorias</span></div>
        <div className="stat bad"><b>{stats.losses}</b><span>Derrotas</span></div>
        <div className="stat"><b>{stats.draws}</b><span>Empates</span></div>
        <div className="stat"><b>{stats.abandons}</b><span>Abandonos</span></div>
        <div className="stat"><b>{stats.bestScore ?? '—'}</b><span>Mejor puntuación</span></div>
        <div className="stat wide"><b>{stats.winRate == null ? '—' : `${stats.winRate}%`}</b><span>Victorias</span></div>
        <div className="stat wide"><b>{streakText(stats.currentStreak.type, stats.currentStreak.count)}</b><span>Racha actual</span></div>
        <div className="stat wide"><b>{stats.bestWinStreak}</b><span>Mejor racha de victorias</span></div>
      </section>
      <section className="panel table-panel">
        <h2>Frente a cada jugador</h2>
        {stats.rivals.length === 0 ? <p className="small-note">Todavía no has terminado ninguna partida.</p> :
          <div className="table-scroll"><table><thead><tr><th>Jugador</th><th>Partidas</th><th>Quedaste delante</th><th>Detrás</th><th>Igual</th></tr></thead>
            <tbody>{stats.rivals.map(r => <tr key={r.id}><td>{r.name}</td><td>{r.games}</td><td>{r.ahead}</td><td>{r.behind}</td><td>{r.tied}</td></tr>)}</tbody></table></div>}
      </section>
      <section className="panel table-panel">
        <h2>Historial</h2>
        {stats.history.length === 0 ? <p className="small-note">Aquí aparecerán tus partidas.</p> :
          <div className="table-scroll"><table><thead><tr><th>Fecha</th><th>Jugadores</th><th>Puesto</th><th>Puntos</th><th>Resultado</th><th>Ganó</th><th>Duración</th></tr></thead>
            <tbody>{stats.history.map(h => <tr key={h.id}>
              <td>{fmtDate(h.endedAt)}</td><td>{h.players}</td><td>{h.rank}º</td><td>{h.score}</td>
              <td><span className={`pill ${h.result === 'WIN' ? 'win' : h.result === 'LOSS' ? 'loss' : 'draw'}`}>{label(h.result)}</span>{h.abandoned ? ' · abandonaste' : ''}</td>
              <td>{h.winnerNames.join(', ') || '—'}</td><td>{fmtDur(h.durationMs)}</td></tr>)}</tbody></table></div>}
      </section>
    </>}
  </main>
}
