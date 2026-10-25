import type { RoomView } from '../../shared/types'

export type SoundKind = 'deal' | 'place' | 'sweep' | 'tick' | 'turn' | 'win'
export interface SoundEvent { kind: SoundKind; delayMs: number }

/** Resumen mínimo del estado visible, para detectar qué ha pasado entre dos actualizaciones. */
export interface Snap {
  gameNumber: number
  round: number
  players: number
  trickCards: number
  trickSeq: number
  bids: number
  yourTurn: boolean
  finished: boolean
  iWon: boolean
}

export function snapOf(room: RoomView | null): Snap | null {
  const g = room?.game
  if (!room || !g) return null
  return {
    gameNumber: room.gameNumber, round: g.round, players: g.seats.length, trickCards: g.trick.length,
    trickSeq: g.lastTrick?.seq ?? 0, bids: g.seats.filter(s => s.bid !== null).length,
    yourTurn: g.yourTurn, finished: g.status === 'FINISHED',
    iWon: g.ranking?.some(r => r.playerId === g.viewerId && r.rank === 1 && !r.abandoned) ?? false,
  }
}

/** Qué sonidos corresponden al paso de `prev` a `next` (reparto, carta jugada, baza recogida, apuesta, tu turno, victoria). */
export function soundEventsFromDiff(prev: Snap | null, next: Snap): SoundEvent[] {
  if (!prev) return []
  const ev: SoundEvent[] = []
  const newGame = next.gameNumber !== prev.gameNumber
  const newRound = newGame || next.round !== prev.round
  let t = 0
  if (next.trickSeq !== prev.trickSeq && !newGame) { // se jugó la carta que completa la baza y se recoge
    ev.push({ kind: 'place', delayMs: t }); t += 380
    ev.push({ kind: 'sweep', delayMs: t }); t += 300
  } else if (!newRound && next.trickCards > prev.trickCards) {
    for (let i = 0; i < Math.min(3, next.trickCards - prev.trickCards); i++) { ev.push({ kind: 'place', delayMs: t }); t += 150 }
  }
  if (newRound) {
    for (let i = 0; i < Math.min(8, next.players * 2); i++) { ev.push({ kind: 'deal', delayMs: t }); t += 70 }
    t += 150
  } else if (next.bids > prev.bids) {
    for (let i = 0; i < Math.min(3, next.bids - prev.bids); i++) { ev.push({ kind: 'tick', delayMs: t }); t += 140 }
  }
  if (next.finished && !prev.finished) { if (next.iWon) ev.push({ kind: 'win', delayMs: t + 200 }) }
  else if (next.yourTurn && !prev.yourTurn) ev.push({ kind: 'turn', delayMs: t + 120 })
  return ev
}
