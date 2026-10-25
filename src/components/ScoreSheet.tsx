import { useEffect } from 'react'
import type { GameView } from '../../shared/types'
import { SuitBadge } from './PlayingCard'

/** Tabla de puntuación: una fila por mano (apostadas/ganadas y puntos) y los totales. */
export function ScoreSheet({ game, onClose }: { game: GameView; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const seats = game.seats
  const live = game.status === 'IN_PROGRESS'
  return <div className="rules-overlay" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={onClose}>
    <section className="rules-modal sheet" onClick={e => e.stopPropagation()}>
      <header><h2 id="sheet-title">Puntuación</h2><button className="rules-x" onClick={onClose} aria-label="Cerrar puntuación">×</button></header>
      <div className="rules-body">
        <div className="table-scroll">
          <table className="score-table">
            <thead><tr><th>Mano</th>{seats.map(s => <th key={s.id} className={s.id === game.viewerId ? 'me' : ''}>{s.name}</th>)}</tr></thead>
            <tbody>
              {game.history.map(h => <tr key={h.round}>
                <td className="round">{h.round}<small> · {h.cards}<SuitBadge suit={h.trump} /></small></td>
                {seats.map(s => {
                  const r = h.results.find(x => x.playerId === s.id)
                  return <td key={s.id} className={r ? (r.bid === r.won ? 'ok' : 'ko') : ''}>{r ? <><span>{r.won}/{r.bid}</span><b>{r.points > 0 ? '+' : ''}{r.points}</b></> : '—'}</td>
                })}
              </tr>)}
              {live && <tr className="current">
                <td className="round">{game.round}<small> · {game.cardsThisRound}<SuitBadge suit={game.trump} /></small></td>
                {seats.map(s => <td key={s.id}><span>{s.bid === null ? '…' : `${s.tricks}/${s.bid}`}</span></td>)}
              </tr>}
            </tbody>
            <tfoot><tr><td>Total</td>{seats.map(s => <td key={s.id}><b>{s.score}</b></td>)}</tr></tfoot>
          </table>
        </div>
        <p className="small-note">En cada celda: bazas ganadas / apostadas y los puntos de esa mano (verde = acierto).</p>
      </div>
      <div className="rules-foot"><button className="primary" onClick={onClose}>Cerrar</button></div>
    </section>
  </div>
}
