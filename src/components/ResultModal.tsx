import type { RoomView } from '../../shared/types'

interface Props { room: RoomView; busy: boolean; onRematch: () => void; onLeave: () => void; onStats: () => void; onSheet: () => void }

export function ResultModal({ room, busy, onRematch, onLeave, onStats, onSheet }: Props) {
  const g = room.game!
  const rk = g.ranking ?? []
  const me = rk.find(r => r.playerId === g.viewerId)
  const topScorers = rk.filter(r => r.rank === 1 && !r.abandoned)
  const won = me?.rank === 1 && !me.abandoned
  const draw = won && topScorers.length > 1
  const kind = won ? (draw ? 'draw' : 'win') : 'loss'
  const title = draw ? 'EMPATE' : won ? '¡VICTORIA!' : me?.abandoned ? 'HAS ABANDONADO' : `${me?.rank ?? ''}º PUESTO`
  const others = room.players.filter(p => p.id !== g.viewerId && !p.left)
  const waiting = others.filter(p => !p.rematch).map(p => p.name)
  return <div className="result-overlay" role="dialog" aria-modal="true" aria-labelledby="result-title">
    <section className={`result-modal result-${kind}`}>
      <div className="result-emblem">{won ? '♛' : '♠'}</div>
      <p className="result-kicker">PARTIDA {room.gameNumber} TERMINADA{g.endReason === 'ABANDON' ? ' · POR ABANDONOS' : ''}</p>
      <h2 id="result-title">{title}</h2>
      <ol className="pd-ranking">
        {rk.map(r => <li key={r.playerId} className={`${r.playerId === g.viewerId ? 'me' : ''} ${r.abandoned ? 'gone' : ''}`}>
          <span className="pos">{r.abandoned ? '✕' : r.rank === 1 ? '🏆' : r.rank}</span>
          <span className="who">{r.name}{r.abandoned && <small> abandonó</small>}</span>
          <b>{r.score}</b>
        </li>)}
      </ol>
      {room.canRematch
        ? <button className="primary result-home" disabled={busy || room.players.find(p => p.id === g.viewerId)?.rematch} onClick={onRematch}>
            {room.players.find(p => p.id === g.viewerId)?.rematch ? `Esperando a ${waiting.join(', ') || '…'}` : '⟳ Pedir revancha'}
          </button>
        : <p className="small-note">Ya no hay jugadores suficientes para una revancha (mínimo 3).</p>}
      {room.canRematch && room.players.some(p => p.id !== g.viewerId && p.rematch && !p.left) && !room.players.find(p => p.id === g.viewerId)?.rematch &&
        <p className="small-note">{room.players.filter(p => p.id !== g.viewerId && p.rematch).map(p => p.name).join(', ')} quiere{room.players.filter(p => p.id !== g.viewerId && p.rematch).length > 1 ? 'n' : ''} revancha.</p>}
      <div className="result-links">
        <button className="text-action" onClick={onSheet}>Ver puntuación</button>
        <button className="text-action" onClick={onStats}>Estadísticas</button>
        <button className="text-action" disabled={busy} onClick={onLeave}>Salir de la sala</button>
      </div>
    </section>
  </div>
}
