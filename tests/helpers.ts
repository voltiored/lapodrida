import type { Card, GameState, Suit } from '../shared/types'
import { newGame } from '../shared/engine'

/** Mulberry32: RNG determinista para tests reproducibles. */
export function seeded(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export const card = (suit: Suit, rank: number): Card => ({ id: `${suit}${rank}`, suit, rank })
export const ids = (n: number) => ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, n)

export function mkGame(n = 4, opts: { doubleLap?: boolean; seed?: number } = {}): GameState {
  return newGame('PODR42', ids(n).map(id => ({ id, name: `Jugador ${id}` })), opts.doubleLap ?? false, seeded(opts.seed ?? 1))
}
/** Deja una mano controlada: reparte las cartas indicadas, fija triunfo, repartidor y fase. */
export function setup(g: GameState, o: { hands: Record<string, Card[]>; trump: Suit; dealer?: number; phase?: 'BIDDING' | 'PLAYING'; bids?: Record<string, number> }) {
  for (const p of g.players) { p.hand = o.hands[p.id] ?? []; p.bid = o.bids?.[p.id] ?? null; p.tricks = 0 }
  g.trump = o.trump
  g.dealerIndex = o.dealer ?? 0
  g.phase = o.phase ?? 'BIDDING'
  g.turnIndex = (g.dealerIndex + 1) % g.players.length
  g.trick = []; g.leadSuit = null
  g.schedule = [Math.max(...Object.values(o.hands).map(h => h.length))]; g.roundIndex = 0
  return g
}
export function totalCards(g: GameState): number {
  return g.players.reduce((s, p) => s + p.hand.length, 0) + g.trick.length
}
