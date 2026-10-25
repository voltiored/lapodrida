import type { Card, GameView, RoomView, SeatView, Suit } from '../shared/types'

export const c = (suit: Suit, rank: number): Card => ({ id: `${suit}${rank}`, suit, rank })

export function mkGameView(o: Partial<GameView> & { n?: number } = {}): GameView {
  const n = o.n ?? 4
  const seats: SeatView[] = ['Ana', 'Beto', 'Carla', 'Dani', 'Eva', 'Fer'].slice(0, n).map((name, i) => ({
    id: `p${i}`, name, handCount: 3, bid: 1, tricks: 0, score: 10 * i, isDealer: i === n - 1, auto: false, abandoned: false,
  }))
  const { n: _n, ...rest } = o
  return {
    status: 'IN_PROGRESS', phase: 'PLAYING', doubleLap: false, round: 2, totalRounds: 13, cardsThisRound: 3, trump: 'H', trumpCard: c('H', 9), randomTrump: false,
    dealerId: `p${n - 1}`, turnPlayerId: 'p0', viewerId: 'p0', seats, hand: [c('H', 14), c('C', 5), c('S', 3)], legalCardIds: ['H14', 'C5', 'S3'], forbiddenBid: null,
    trick: [], leadSuit: null, lastTrick: null, history: [], ranking: null, endReason: null, moves: 4, yourTurn: true, ...rest,
  }
}
export function mkRoom(game: GameView | null, o: Partial<RoomView> = {}): RoomView {
  return {
    roomCode: 'ABC234', status: game ? (game.status === 'FINISHED' ? 'FINISHED' : 'IN_PROGRESS') : 'WAITING', gameNumber: 1, version: 3, viewerId: 'p0', hostId: 'p0', doubleLap: false,
    players: (game?.seats ?? [{ id: 'p0', name: 'Ana' }, { id: 'p1', name: 'Beto' }]).map((s, i) => ({ id: s.id, name: s.name, isHost: i === 0, connected: true, awayMs: 0, left: false, abandoned: false, rematch: false })),
    canStart: false, canRematch: true, abandonAfterMs: 180000, game, ...o,
  }
}
