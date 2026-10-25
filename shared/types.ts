// Tipos compartidos entre el servidor (api/) y el cliente (src/). Solo tipos y constantes puras.

export type Suit = 'S' | 'H' | 'D' | 'C' // ♠ ♥ ♦ ♣
export const SUITS: Suit[] = ['S', 'H', 'D', 'C']
export const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' }
export const SUIT_NAME: Record<Suit, string> = { S: 'picas', H: 'corazones', D: 'diamantes', C: 'tréboles' }

/** Rango 2..14 (11=J, 12=Q, 13=K, 14=A). */
export interface Card { id: string; suit: Suit; rank: number }
export const rankLabel = (r: number) => (r === 14 ? 'A' : r === 13 ? 'K' : r === 12 ? 'Q' : r === 11 ? 'J' : String(r))

export const MIN_PLAYERS = 3
export const MAX_PLAYERS = 6
/** Un jugador se considera desconectado si no da señales de vida durante este tiempo. */
export const CONNECTED_WINDOW_MS = 25_000

// ---------------------------------------------------------------- estado interno (con información oculta)
export interface PlayerState {
  id: string
  name: string
  hand: Card[]
  bid: number | null
  tricks: number
  score: number
  /** Juega en "piloto automático" (porque abandonó o se desconectó demasiado tiempo). */
  auto: boolean
  abandoned: boolean
}
export interface TrickPlay { playerId: string; card: Card }
export interface CompletedTrick { plays: TrickPlay[]; winnerId: string; seq: number }
export interface RoundPlayerResult { playerId: string; bid: number; won: number; points: number }
export interface RoundResult { round: number; cards: number; trump: Suit; dealerId: string; results: RoundPlayerResult[] }
export type Phase = 'BIDDING' | 'PLAYING'
export type EndReason = 'NORMAL' | 'ABANDON'
export type GameStatus = 'IN_PROGRESS' | 'FINISHED'

export interface GameState {
  roomCode: string
  status: GameStatus
  doubleLap: boolean
  players: PlayerState[] // en orden de turno
  schedule: number[] // cartas por mano
  roundIndex: number
  dealerIndex: number
  trump: Suit
  trumpCard: Card | null
  randomTrump: boolean
  phase: Phase
  turnIndex: number
  trick: TrickPlay[]
  leadSuit: Suit | null
  trickSeq: number
  lastTrick: CompletedTrick | null
  history: RoundResult[]
  endReason: EndReason | null
  startedAt: string
  endedAt: string | null
  moves: number
}

// ---------------------------------------------------------------- vistas que SÍ viajan al cliente
export interface SeatView {
  id: string
  name: string
  handCount: number
  bid: number | null
  tricks: number
  score: number
  isDealer: boolean
  auto: boolean
  abandoned: boolean
}
export interface RankingEntry { playerId: string; name: string; score: number; rank: number; abandoned: boolean }
export interface GameView {
  status: GameStatus
  phase: Phase
  doubleLap: boolean
  round: number // 1..total
  totalRounds: number
  cardsThisRound: number
  trump: Suit
  trumpCard: Card | null
  randomTrump: boolean
  dealerId: string
  turnPlayerId: string
  viewerId: string
  seats: SeatView[]
  hand: Card[] // solo la del propio jugador, ordenada
  legalCardIds: string[] // cartas que puedes jugar ahora (si es tu turno de jugar)
  forbiddenBid: number | null // si eres el último en cantar, el número que no puedes decir
  trick: TrickPlay[]
  leadSuit: Suit | null
  lastTrick: CompletedTrick | null
  history: RoundResult[]
  ranking: RankingEntry[] | null
  endReason: EndReason | null
  moves: number
  yourTurn: boolean
}

export type RoomStatus = 'WAITING' | 'IN_PROGRESS' | 'FINISHED' | 'CLOSED'
export interface RoomPlayerView {
  id: string
  name: string
  isHost: boolean
  connected: boolean
  awayMs: number
  left: boolean
  abandoned: boolean
  rematch: boolean
}
export interface RoomView {
  roomCode: string
  status: RoomStatus
  gameNumber: number
  version: number
  viewerId: string
  hostId: string
  doubleLap: boolean
  players: RoomPlayerView[]
  canStart: boolean
  canRematch: boolean
  abandonAfterMs: number
  game: GameView | null
}

export type MatchResult = 'WIN' | 'DRAW' | 'LOSS'
export interface MatchPlayer { id: string; name: string; score: number; rank: number; abandoned: boolean; result: MatchResult }
export interface MatchRecord {
  id?: string
  room_code: string
  game_number: number
  player_ids: string[]
  players: MatchPlayer[]
  rounds: number
  double_lap: boolean
  ended_by_abandon: boolean
  started_at: string
  ended_at: string
}
