// Vista previa de la mesa con datos de ejemplo (solo desarrollo): http://localhost:5173/board-preview.html
// Parámetros: ?n=3..6  ?fase=canto|juego|fin  ?turno=otro  ?cartas=1..17  ?away=1  ?error=1  ?random=1  ?vista=lobby|espera|stats
import React from 'react'
import { createRoot } from 'react-dom/client'
import type { Card, GameView, RoomView, SeatView, Suit } from '../shared/types'
import { Lobby } from './components/Lobby'
import { ResultModal } from './components/ResultModal'
import { Table } from './components/Table'
import { WaitingRoom } from './components/WaitingRoom'
import './style.css'
import './board.css'

const q = new URLSearchParams(location.search)
const n = Math.min(6, Math.max(3, Number(q.get('n') ?? 4)))
const cards = Math.min(17, Math.max(1, Number(q.get('cartas') ?? 9)))
const fase = q.get('fase') ?? 'juego'
const mine = q.get('turno') !== 'otro'
const names = ['Lautaro', 'Primo Lauti', 'Tía Marta', 'Abuelo', 'Sofi', 'Dani']
const SUITS: Suit[] = ['S', 'H', 'D', 'C']
const card = (suit: Suit, rank: number): Card => ({ id: `${suit}${rank}`, suit, rank })
const all = SUITS.flatMap(s => Array.from({ length: 13 }, (_, i) => card(s, i + 2)))
const hand = all.filter((_, i) => i % 3 === 0).slice(0, cards)
const trump: Suit = 'H'
const handSorted = [...hand].sort((a, b) => (a.suit === trump ? -1 : 'SHCD'.indexOf(a.suit)) - (b.suit === trump ? -1 : 'SHCD'.indexOf(b.suit)) || b.rank - a.rank)

const seats: SeatView[] = names.slice(0, n).map((name, i) => ({
  id: `p${i}`, name, handCount: cards, bid: fase === 'canto' && i > 1 ? null : [2, 1, 3, 0, 1, 2][i], tricks: fase === 'canto' ? 0 : [1, 1, 2, 0, 0, 1][i], score: [34, 21, -6, 40, 13, 5][i],
  isDealer: i === n - 1, auto: false, abandoned: i === 3 && q.get('away') === '2',
}))
const trickPlays = fase === 'juego' ? [{ playerId: 'p1', card: card('C', 12) }, { playerId: 'p2', card: card('C', 7) }].slice(0, Math.max(1, n - 2)) : []
const legal = handSorted.filter(c => !trickPlays.length || c.suit === 'C' || !handSorted.some(x => x.suit === 'C')).map(c => c.id)
const history = [1, 2, 3].map(r => ({ round: r, cards: 13 - r + 1, trump: SUITS[r % 4], dealerId: 'p0', results: seats.map((s, i) => ({ playerId: s.id, bid: (i + r) % 3, won: (i + r + (i === 1 ? 1 : 0)) % 3, points: (i === 1 ? -3 : 10 + 3 * ((i + r) % 3)) })) }))

const game: GameView = {
  status: fase === 'fin' ? 'FINISHED' : 'IN_PROGRESS', phase: fase === 'canto' ? 'BIDDING' : 'PLAYING', doubleLap: false, round: 4, totalRounds: 13, cardsThisRound: cards,
  trump, trumpCard: q.get('random') ? null : card('H', 9), randomTrump: Boolean(q.get('random')), dealerId: `p${n - 1}`, turnPlayerId: mine ? 'p0' : 'p1', viewerId: 'p0', seats,
  hand: handSorted, legalCardIds: mine && fase === 'juego' ? legal : [], forbiddenBid: mine && fase === 'canto' ? 2 : null,
  trick: trickPlays, leadSuit: trickPlays.length ? 'C' : null, lastTrick: null, history,
  ranking: fase === 'fin' ? seats.map((s, i) => ({ playerId: s.id, name: s.name, score: s.score, rank: i + 1, abandoned: false })).sort((a, b) => b.score - a.score).map((r, i) => ({ ...r, rank: i + 1 })) : null,
  endReason: fase === 'fin' ? 'NORMAL' : null, moves: 30, yourTurn: mine && fase !== 'fin',
}
const room: RoomView = {
  roomCode: 'K7QM2X', status: fase === 'fin' ? 'FINISHED' : 'IN_PROGRESS', gameNumber: 1, version: 5, viewerId: 'p0', hostId: 'p0', doubleLap: false,
  players: seats.map((s, i) => ({ id: s.id, name: s.name, isHost: i === 0, connected: !(q.get('away') && i === 2), awayMs: q.get('away') && i === 2 ? 70_000 : 1000, left: false, abandoned: s.abandoned, rematch: i === 1 })),
  canStart: true, canRematch: true, abandonAfterMs: 180_000, game,
}
const noop = () => {}
const vista = q.get('vista')

createRoot(document.getElementById('root')!).render(
  vista === 'lobby' ? <Lobby me={{ id: 'p0', isGuest: true, name: null, avatar: null }} name="Lautaro" onName={noop} inviteCode="" busy={false} error="" activeRoom="K7QM2X" onCreate={noop} onJoin={noop} onResume={noop} onStats={noop} onGoogle={noop} onSignOut={noop} />
  : vista === 'espera' ? <WaitingRoom room={{ ...room, status: 'WAITING', game: null, players: room.players.slice(0, 3) }} busy={false} error="" onStart={noop} onLeave={noop} onHome={noop} />
  : <><Table room={room} game={game} busy={false} error={q.get('error') ? 'Debes asistir al palo de salida.' : ''} offline={false} realtimeOk nowMs={Date.now()} fetchedAt={Date.now()}
      onClearError={noop} onBid={v => console.log('bid', v)} onPlay={id => console.log('play', id)} onAbandon={noop} onHome={noop} />
     {fase === 'fin' && <ResultModal room={room} busy={false} onRematch={noop} onLeave={noop} onStats={noop} onSheet={noop} />}</>,
)
