// Motor de La Podrida (Pocha / Oh Hell): funciones puras sobre GameState (mutan el estado que reciben).
import { randomInt } from 'node:crypto'
import {
  SUITS, MIN_PLAYERS, MAX_PLAYERS,
  type Card, type GameState, type GameView, type PlayerState, type RankingEntry, type RoundResult, type Suit,
} from './types'

export class GameError extends Error {
  constructor(message: string, public status: 400 | 401 | 403 | 404 | 409 = 400) { super(message) }
}
const bad = (m: string) => new GameError(m, 400)
const conflict = (m: string) => new GameError(m, 409)

export type Rng = () => number // [0, 1)
export const secureRng: Rng = () => randomInt(0, 2 ** 40) / 2 ** 40

export function shuffle<T>(arr: T[], rng: Rng = secureRng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function createDeck(): Card[] {
  const cards: Card[] = []
  for (const suit of SUITS) for (let rank = 2; rank <= 14; rank++) cards.push({ id: `${suit}${rank}`, suit, rank })
  return cards
}

/** Cartas por mano: reparte todas las posibles (52 / jugadores) y baja de una en una hasta 1; con "dos vueltas" vuelve a subir hasta el máximo. */
export function roundSchedule(players: number, doubleLap: boolean): number[] {
  const max = Math.floor(52 / players)
  const down = Array.from({ length: max }, (_, i) => max - i)
  const up = doubleLap ? Array.from({ length: max - 1 }, (_, i) => i + 2) : []
  return [...down, ...up]
}

// ---------------------------------------------------------------- arranque y reparto
export function newGame(
  roomCode: string,
  players: { id: string; name: string }[],
  doubleLap: boolean,
  rng: Rng = secureRng,
  now: Date = new Date(),
): GameState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw bad(`La partida es de ${MIN_PLAYERS} a ${MAX_PLAYERS} jugadores.`)
  const g: GameState = {
    roomCode, status: 'IN_PROGRESS', doubleLap,
    players: players.map(p => ({ id: p.id, name: p.name, hand: [], bid: null, tricks: 0, score: 0, auto: false, abandoned: false })),
    schedule: roundSchedule(players.length, doubleLap), roundIndex: 0, dealerIndex: Math.floor(rng() * players.length),
    trump: 'S', trumpCard: null, randomTrump: false, phase: 'BIDDING', turnIndex: 0,
    trick: [], leadSuit: null, trickSeq: 0, lastTrick: null, history: [],
    endReason: null, startedAt: now.toISOString(), endedAt: null, moves: 0,
  }
  deal(g, rng)
  runAutos(g, rng)
  return g
}

function deal(g: GameState, rng: Rng) {
  const n = g.players.length
  const cards = g.schedule[g.roundIndex]
  const deck = shuffle(createDeck(), rng)
  for (const p of g.players) { p.hand = deck.splice(0, cards); p.bid = null; p.tricks = 0 }
  // El triunfo es el palo de la última carta del mazo sobrante; si se han repartido todas las cartas (4 jugadores, mano máxima), es aleatorio.
  if (deck.length > 0) {
    g.trumpCard = deck[deck.length - 1]
    g.trump = g.trumpCard.suit
    g.randomTrump = false
  } else {
    g.trumpCard = null
    g.trump = SUITS[Math.floor(rng() * SUITS.length)]
    g.randomTrump = true
  }
  g.phase = 'BIDDING'
  g.turnIndex = (g.dealerIndex + 1) % n // canta primero quien está a continuación del que reparte; el que reparte canta el último
  g.trick = []
  g.leadSuit = null
}

// ---------------------------------------------------------------- canto
const current = (g: GameState) => g.players[g.turnIndex]
const cardsThisRound = (g: GameState) => g.schedule[g.roundIndex]

/** El último en cantar (quien reparte) no puede decir el número que haga que la suma de apuestas sea igual a las bazas en juego. */
export function forbiddenBid(g: GameState): number | null {
  if (g.status !== 'IN_PROGRESS' || g.phase !== 'BIDDING' || g.turnIndex !== g.dealerIndex) return null
  const others = g.players.filter((_, i) => i !== g.dealerIndex).reduce((s, p) => s + (p.bid ?? 0), 0)
  const f = cardsThisRound(g) - others
  return f >= 0 && f <= cardsThisRound(g) ? f : null
}

export function bid(g: GameState, playerId: string, value: number, rng: Rng = secureRng): void {
  if (g.status !== 'IN_PROGRESS') throw conflict('La partida no está en curso.')
  if (!g.players.some(p => p.id === playerId)) throw new GameError('Ese jugador no pertenece a la sala.', 403)
  if (g.phase !== 'BIDDING') throw conflict('Ahora no se está cantando.')
  if (current(g).id !== playerId) throw conflict('No es tu turno de cantar.')
  applyBid(g, value)
  runAutos(g, rng)
}

function applyBid(g: GameState, value: number) {
  const max = cardsThisRound(g)
  if (!Number.isInteger(value) || value < 0 || value > max) throw bad(`Tu apuesta debe estar entre 0 y ${max}.`)
  if (forbiddenBid(g) === value) throw bad(`Como último en cantar no puedes decir ${value}: las apuestas sumarían las ${max} bazas y nadie perdería.`)
  current(g).bid = value
  g.moves++
  if (g.players.every(p => p.bid !== null)) {
    g.phase = 'PLAYING'
    g.turnIndex = (g.dealerIndex + 1) % g.players.length
  } else {
    g.turnIndex = (g.turnIndex + 1) % g.players.length
  }
}

// ---------------------------------------------------------------- juego de las bazas
/** Cartas que el jugador puede jugar ahora: asistir al palo de salida; si no tiene, triunfo; si tampoco, cualquiera. */
export function legalCards(g: GameState, p: PlayerState): Card[] {
  if (g.leadSuit === null) return [...p.hand]
  const follow = p.hand.filter(c => c.suit === g.leadSuit)
  if (follow.length) return follow
  const trumps = p.hand.filter(c => c.suit === g.trump)
  return trumps.length ? trumps : [...p.hand]
}

export function playCard(g: GameState, playerId: string, cardId: string, rng: Rng = secureRng): void {
  if (g.status !== 'IN_PROGRESS') throw conflict('La partida no está en curso.')
  const p = g.players.find(x => x.id === playerId)
  if (!p) throw new GameError('Ese jugador no pertenece a la sala.', 403)
  if (g.phase !== 'PLAYING') throw conflict('Primero hay que terminar de cantar.')
  if (current(g).id !== playerId) throw conflict('No es tu turno.')
  const card = p.hand.find(c => c.id === cardId)
  if (!card) throw bad('Esa carta no está en tu mano.')
  if (!legalCards(g, p).includes(card)) {
    throw bad(g.leadSuit && p.hand.some(c => c.suit === g.leadSuit)
      ? 'Debes asistir al palo de salida.'
      : 'Si no tienes el palo de salida, debes jugar triunfo.')
  }
  applyPlay(g, p, card, rng)
  runAutos(g, rng)
}

function applyPlay(g: GameState, p: PlayerState, card: Card, rng: Rng) {
  p.hand.splice(p.hand.indexOf(card), 1)
  if (g.trick.length === 0) g.leadSuit = card.suit
  g.trick.push({ playerId: p.id, card })
  g.moves++
  if (g.trick.length < g.players.length) { g.turnIndex = (g.turnIndex + 1) % g.players.length; return }

  // baza completa: gana el triunfo más alto o, si nadie triunfó, la carta más alta del palo de salida
  const winnerPlay = g.trick.reduce((best, cur) => beats(g, cur.card, best.card) ? cur : best)
  const winner = g.players.find(x => x.id === winnerPlay.playerId)!
  winner.tricks++
  g.lastTrick = { plays: g.trick, winnerId: winner.id, seq: ++g.trickSeq }
  g.trick = []
  g.leadSuit = null
  g.turnIndex = g.players.indexOf(winner) // el ganador sale en la siguiente
  if (g.players.every(x => x.hand.length === 0)) endRound(g, rng)
}

function beats(g: GameState, a: Card, b: Card): boolean {
  if (a.suit === b.suit) return a.rank > b.rank
  if (a.suit === g.trump) return true
  if (b.suit === g.trump) return false
  return false // un palo distinto al ganador (que no es triunfo) nunca gana
}

// ---------------------------------------------------------------- puntuación y fin de mano
export function handPoints(bid: number, won: number): number {
  return bid === won ? 10 + 3 * won : -3 * Math.abs(bid - won)
}

function endRound(g: GameState, rng: Rng) {
  const result: RoundResult = {
    round: g.roundIndex + 1, cards: cardsThisRound(g), trump: g.trump, dealerId: g.players[g.dealerIndex].id,
    results: g.players.map(p => {
      const points = handPoints(p.bid ?? 0, p.tricks)
      p.score += points
      return { playerId: p.id, bid: p.bid ?? 0, won: p.tricks, points }
    }),
  }
  g.history.push(result)
  g.roundIndex++
  if (g.roundIndex >= g.schedule.length) {
    g.status = 'FINISHED'
    g.endReason = 'NORMAL'
    g.endedAt = new Date().toISOString()
    return
  }
  g.dealerIndex = (g.dealerIndex + 1) % g.players.length
  deal(g, rng)
}

// ---------------------------------------------------------------- abandono y piloto automático
/** El jugador deja de jugar: sus decisiones las toma el piloto automático hasta el final y queda último en la clasificación. */
export function abandonPlayer(g: GameState, playerId: string, rng: Rng = secureRng): void {
  if (g.status !== 'IN_PROGRESS') throw conflict('La partida no está en curso.')
  const p = g.players.find(x => x.id === playerId)
  if (!p) throw new GameError('Ese jugador no pertenece a la sala.', 403)
  if (p.abandoned) return
  p.auto = true
  p.abandoned = true
  const humans = g.players.filter(x => !x.auto).length
  if (humans < 2) { // si casi todos se han ido, la partida acaba: gana quien queda
    g.status = 'FINISHED'
    g.endReason = 'ABANDON'
    g.endedAt = new Date().toISOString()
    return
  }
  runAutos(g, rng)
}

/** Decisiones simples del piloto automático: cantar según cartas altas y jugar siempre la carta legal más baja. */
function autoAct(g: GameState, rng: Rng) {
  const p = current(g)
  if (g.phase === 'BIDDING') {
    const strong = p.hand.filter(c => c.rank >= 13 || (c.suit === g.trump && c.rank >= 10)).length
    let v = Math.min(cardsThisRound(g), Math.floor(strong / 1.5))
    const f = forbiddenBid(g)
    if (f === v) v = v > 0 ? v - 1 : v + 1
    applyBid(g, v)
  } else {
    const legal = legalCards(g, p)
    const key = (c: Card) => (c.suit === g.trump ? 100 : 0) + c.rank
    const card = legal.reduce((lo, c) => (key(c) < key(lo) ? c : lo))
    applyPlay(g, p, card, rng)
  }
}

export function runAutos(g: GameState, rng: Rng = secureRng): void {
  for (let guard = 0; guard < 2000 && g.status === 'IN_PROGRESS' && current(g).auto; guard++) autoAct(g, rng)
}

// ---------------------------------------------------------------- clasificación y vistas
/** Los que abandonan quedan al final; el resto se ordena por puntos (empates comparten puesto). */
export function ranking(g: GameState): RankingEntry[] {
  const active = g.players.filter(p => !p.abandoned).sort((a, b) => b.score - a.score)
  const gone = g.players.filter(p => p.abandoned).sort((a, b) => b.score - a.score)
  const out: RankingEntry[] = []
  active.forEach((p, i) => {
    const rank = i > 0 && p.score === active[i - 1].score ? out[i - 1].rank : i + 1
    out.push({ playerId: p.id, name: p.name, score: p.score, rank, abandoned: false })
  })
  gone.forEach((p, i) => out.push({ playerId: p.id, name: p.name, score: p.score, rank: active.length + i + 1, abandoned: true }))
  return out
}

const SORT_ORDER: Record<Suit, number> = { S: 0, H: 1, C: 2, D: 3 }
export function sortHand(hand: Card[], trump: Suit): Card[] {
  return [...hand].sort((a, b) => {
    const sa = a.suit === trump ? -1 : SORT_ORDER[a.suit]
    const sb = b.suit === trump ? -1 : SORT_ORDER[b.suit]
    return sa !== sb ? sa - sb : b.rank - a.rank
  })
}

/** Cada jugador solo ve su mano; el resto de la información (apuestas, bazas, triunfo, puntos) es pública. */
export function buildGameView(g: GameState, viewerId: string): GameView {
  const viewer = g.players.find(p => p.id === viewerId)
  if (!viewer) throw new GameError('No perteneces a esta partida.', 403)
  const turn = g.players[g.turnIndex]
  const yourTurn = g.status === 'IN_PROGRESS' && turn.id === viewerId
  return {
    status: g.status, phase: g.phase, doubleLap: g.doubleLap,
    round: Math.min(g.roundIndex + 1, g.schedule.length), totalRounds: g.schedule.length,
    cardsThisRound: g.schedule[Math.min(g.roundIndex, g.schedule.length - 1)],
    trump: g.trump, trumpCard: g.trumpCard, randomTrump: g.randomTrump,
    dealerId: g.players[g.dealerIndex].id, turnPlayerId: turn.id, viewerId,
    seats: g.players.map((p, i) => ({
      id: p.id, name: p.name, handCount: p.hand.length, bid: p.bid, tricks: p.tricks, score: p.score,
      isDealer: i === g.dealerIndex, auto: p.auto, abandoned: p.abandoned,
    })),
    hand: sortHand(viewer.hand, g.trump),
    legalCardIds: yourTurn && g.phase === 'PLAYING' ? legalCards(g, viewer).map(c => c.id) : [],
    forbiddenBid: yourTurn ? forbiddenBid(g) : null,
    trick: g.trick, leadSuit: g.leadSuit, lastTrick: g.lastTrick, history: g.history,
    ranking: g.status === 'FINISHED' ? ranking(g) : null,
    endReason: g.endReason, moves: g.moves, yourTurn,
  }
}
