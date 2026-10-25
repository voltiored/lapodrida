import { randomInt } from 'node:crypto'
import {
  GameError, abandonPlayer, bid as engineBid, buildGameView, newGame, playCard as enginePlay, ranking, shuffle, secureRng, type Rng,
} from '../../shared/engine'
import { CONNECTED_WINDOW_MS, MAX_PLAYERS, MIN_PLAYERS, type MatchPlayer, type MatchRecord, type RoomStatus, type RoomView } from '../../shared/types'
import type { RoomPlayer, RoomRow, RoomStore } from './store'

export { CONNECTED_WINDOW_MS }
/** Si un jugador lleva tanto tiempo sin aparecer, pasa a piloto automático y cuenta como abandono (se comprueba de forma perezosa). */
export const ABANDON_AFTER_MS = 180_000
/** Para que cuente el abandono de otro, quien lo detecta debe haber estado conectado hasta ahora. */
export const VIEWER_GRACE_MS = 45_000
/** No se escribe `seen` en base de datos más a menudo que esto. */
export const SEEN_WRITE_EVERY_MS = 5_000

export interface AuthUser { id: string; name: string | null; isAnonymous: boolean }
export interface ServiceOptions {
  notify?: (code: string, version: number) => Promise<void>
  now?: () => number
  rng?: Rng
}
interface Outcome { dirty?: boolean; notify?: boolean; match?: MatchRecord }

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : 0)

export function cleanName(raw: unknown, fallback = 'Jugador'): string {
  if (typeof raw !== 'string') return fallback
  const s = raw.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24)
  return s || fallback
}
export function normalizeCode(raw: unknown): string {
  const code = typeof raw === 'string' ? raw.trim().toUpperCase() : ''
  if (!/^[A-Z0-9]{6}$/.test(code)) throw new GameError('No existe esa sala.', 404)
  return code
}
function randomCode() {
  let c = ''
  for (let i = 0; i < 6; i++) c += ALPHABET[randomInt(0, ALPHABET.length)]
  return c
}
const active = (row: RoomRow) => row.players.filter(p => !p.left)

export class RoomService {
  private now: () => number
  private rng: Rng

  constructor(private db: RoomStore, private opts: ServiceOptions = {}) {
    this.now = opts.now ?? Date.now
    this.rng = opts.rng ?? secureRng
  }

  // ------------------------------------------------------------------ sala
  async create(user: AuthUser, rawName: unknown, rawOptions: unknown): Promise<RoomView> {
    const name = cleanName(rawName, cleanName(user.name))
    const doubleLap = Boolean((rawOptions as { doubleLap?: unknown } | null)?.doubleLap)
    const nowIso = new Date(this.now()).toISOString()
    for (let i = 0; i < 12; i++) {
      const row: RoomRow = {
        code: randomCode(), status: 'WAITING', host_id: user.id, game: null, game_number: 1, version: 0, options: { doubleLap },
        players: [{ id: user.id, name, seen: nowIso, left: false, abandoned: false, rematch: false }],
      }
      if (await this.db.insert(row)) return this.toView(row, user.id)
    }
    throw new GameError('No se pudo generar un código de sala. Inténtalo de nuevo.', 409)
  }

  async join(user: AuthUser, rawCode: unknown, rawName: unknown): Promise<RoomView> {
    const code = normalizeCode(rawCode)
    for (let attempt = 0; attempt < 5; attempt++) {
      const row = await this.db.get(code)
      if (!row) throw new GameError('No existe esa sala.', 404)
      if (row.players.some(p => p.id === user.id)) return this.view(user, code) // ya eres de esta sala: reconexión
      if (row.status === 'CLOSED') throw new GameError('Esa sala ya no está disponible.', 409)
      if (row.status !== 'WAITING') throw new GameError('La partida ya ha empezado.', 409)
      if (active(row).length >= MAX_PLAYERS) throw new GameError(`La sala está llena (máximo ${MAX_PLAYERS} jugadores).`, 409)
      const expected = row.version
      row.players.push({ id: user.id, name: cleanName(rawName, cleanName(user.name)), seen: new Date(this.now()).toISOString(), left: false, abandoned: false, rematch: false })
      const saved = await this.db.update(row, expected)
      if (!saved) continue
      await this.ping(code, saved.version)
      return this.toView(saved, user.id)
    }
    throw new GameError('La sala está ocupada, inténtalo de nuevo.', 409)
  }

  /** Solo el anfitrión, con 3 a 6 jugadores. Los asientos se sortean. */
  async start(user: AuthUser, rawCode: unknown): Promise<RoomView> {
    const row = await this.mutate(normalizeCode(rawCode), user.id, row => {
      if (row.host_id !== user.id) throw new GameError('Solo el anfitrión puede empezar la partida.', 403)
      if (row.status !== 'WAITING') throw new GameError('La partida ya ha empezado.', 409)
      const n = active(row).length
      if (n < MIN_PLAYERS) throw new GameError(`Hacen falta al menos ${MIN_PLAYERS} jugadores para empezar.`, 409)
      this.startGame(row, shuffle([...active(row)], this.rng))
      return { dirty: true, notify: true }
    })
    return this.toView(row, user.id)
  }

  /** Consulta el estado. También actúa de "latido" y retira a quien lleve demasiado tiempo sin aparecer. */
  async view(user: AuthUser, rawCode: unknown): Promise<RoomView> {
    const row = await this.mutate(normalizeCode(rawCode), user.id, (row, me, ctx) => {
      if (row.status !== 'PLAYING' || !row.game) return
      let out: Outcome | undefined
      for (const p of row.players) {
        if (p.id === me.id || p.left || p.abandoned) continue
        if (ctx.nowMs - ms(p.seen) > ABANDON_AFTER_MS && ctx.nowMs - ctx.prevSeenMs < VIEWER_GRACE_MS) {
          this.applyAbandon(row, p.id)
          out = { dirty: true, notify: true, match: this.finish(row) ?? out?.match }
        }
      }
      return out
    })
    return this.toView(row, user.id)
  }

  // ------------------------------------------------------------------ jugadas
  async bid(user: AuthUser, rawCode: unknown, value: unknown): Promise<RoomView> {
    const row = await this.mutate(normalizeCode(rawCode), user.id, row => {
      if (row.status !== 'PLAYING' || !row.game) throw new GameError('La partida no está en curso.', 409)
      engineBid(row.game, user.id, Number(value), this.rng)
      return { dirty: true, notify: true, match: this.finish(row) }
    })
    return this.toView(row, user.id)
  }

  async play(user: AuthUser, rawCode: unknown, cardId: unknown): Promise<RoomView> {
    const row = await this.mutate(normalizeCode(rawCode), user.id, row => {
      if (row.status !== 'PLAYING' || !row.game) throw new GameError('La partida no está en curso.', 409)
      enginePlay(row.game, user.id, typeof cardId === 'string' ? cardId : '', this.rng)
      return { dirty: true, notify: true, match: this.finish(row) }
    })
    return this.toView(row, user.id)
  }

  // ------------------------------------------------------------------ abandono, revancha y salida
  async abandon(user: AuthUser, rawCode: unknown): Promise<RoomView> {
    const row = await this.mutate(normalizeCode(rawCode), user.id, row => {
      if (row.status !== 'PLAYING' || !row.game) throw new GameError('La partida no está en curso.', 409)
      this.applyAbandon(row, user.id)
      return { dirty: true, notify: true, match: this.finish(row) }
    })
    return this.toView(row, user.id)
  }

  /** Revancha: empieza otra partida cuando la piden todos los que siguen en la sala (y quedan al menos 3). */
  async rematch(user: AuthUser, rawCode: unknown): Promise<RoomView> {
    const row = await this.mutate(normalizeCode(rawCode), user.id, (row, me) => {
      if (row.status !== 'FINISHED') throw new GameError('Solo se puede pedir revancha cuando la partida ha terminado.', 409)
      if (active(row).length < MIN_PLAYERS) throw new GameError(`Para la revancha hacen falta al menos ${MIN_PLAYERS} jugadores en la sala.`, 409)
      me.rematch = true
      if (active(row).every(p => p.rematch)) {
        row.players = active(row)
        row.game_number += 1
        this.startGame(row, shuffle([...row.players], this.rng))
      }
      return { dirty: true, notify: true }
    })
    return this.toView(row, user.id)
  }

  /** Salir de la sala. Si la partida estaba en curso cuenta como abandono; el resto de jugadores sigue. */
  async leave(user: AuthUser, rawCode: unknown): Promise<RoomView> {
    const row = await this.mutate(normalizeCode(rawCode), user.id, (row, me) => {
      if (me.left) return
      let match: MatchRecord | undefined
      if (row.status === 'PLAYING' && row.game) {
        this.applyAbandon(row, me.id)
        match = this.finish(row)
      }
      me.left = true
      me.rematch = false
      const rest = active(row)
      if (rest.length === 0) row.status = 'CLOSED'
      else if (row.host_id === me.id) row.host_id = rest[0].id
      if (row.status === 'WAITING' && rest.length === 0) row.status = 'CLOSED'
      return { dirty: true, notify: true, match }
    })
    return this.toView(row, user.id)
  }

  // ------------------------------------------------------------------ internos
  private startGame(row: RoomRow, seats: RoomPlayer[]) {
    const nowMs = this.now()
    row.game = newGame(row.code, seats.map(p => ({ id: p.id, name: p.name })), row.options.doubleLap, this.rng, new Date(nowMs))
    row.status = 'PLAYING'
    for (const p of row.players) { p.rematch = false; p.abandoned = false }
  }

  private applyAbandon(row: RoomRow, playerId: string) {
    if (!row.game || row.game.status !== 'IN_PROGRESS') return
    abandonPlayer(row.game, playerId, this.rng)
    const p = row.players.find(x => x.id === playerId)
    if (p) p.abandoned = true
  }

  /** Si la partida acaba de terminar, sincroniza la sala y devuelve el registro para el historial. */
  private finish(row: RoomRow): MatchRecord | undefined {
    const g = row.game
    if (!g || g.status !== 'FINISHED' || row.status !== 'PLAYING') return undefined
    row.status = 'FINISHED'
    const rk = ranking(g)
    const topScorers = rk.filter(r => r.rank === 1 && !r.abandoned).length
    const players: MatchPlayer[] = rk.map(r => ({
      id: r.playerId, name: r.name, score: r.score, rank: r.rank, abandoned: r.abandoned,
      result: r.abandoned ? 'LOSS' : r.rank === 1 ? (topScorers > 1 ? 'DRAW' : 'WIN') : 'LOSS',
    }))
    return {
      room_code: row.code, game_number: row.game_number, player_ids: players.map(p => p.id), players,
      rounds: g.history.length, double_lap: g.doubleLap, ended_by_abandon: g.endReason === 'ABANDON',
      started_at: g.startedAt, ended_at: g.endedAt ?? new Date(this.now()).toISOString(),
    }
  }

  /**
   * Lee la sala, aplica `fn` sobre una copia y guarda con control de versión (reintenta si hubo una carrera).
   * Además marca al jugador como "visto" (latido) y avisa al resto cuando alguien vuelve tras estar desconectado.
   */
  private async mutate(
    code: string, userId: string,
    fn: (row: RoomRow, me: RoomPlayer, ctx: { nowMs: number; prevSeenMs: number }) => Outcome | void,
  ): Promise<RoomRow> {
    for (let attempt = 0; attempt < 6; attempt++) {
      const row = await this.db.get(code)
      if (!row) throw new GameError('No existe esa sala.', 404)
      const me = row.players.find(p => p.id === userId)
      if (!me) throw new GameError('No perteneces a esta sala.', 403)

      const nowMs = this.now()
      const prevSeenMs = ms(me.seen)
      const expected = row.version
      const out = fn(row, me, { nowMs, prevSeenMs }) ?? {}

      let touched = false
      if (nowMs - prevSeenMs >= SEEN_WRITE_EVERY_MS) { me.seen = new Date(nowMs).toISOString(); touched = true }
      const wasAway = nowMs - prevSeenMs > CONNECTED_WINDOW_MS
      if (!out.dirty && !touched) return row

      const saved = await this.db.update(row, expected)
      if (!saved) continue
      if (out.match) {
        try { await this.db.recordMatch(out.match) }
        catch (e) { console.error('No se pudo registrar la partida en el historial', e) }
      }
      if (out.notify || wasAway) await this.ping(code, saved.version)
      return saved
    }
    throw new GameError('La sala está muy ocupada, inténtalo de nuevo.', 409)
  }

  private async ping(code: string, version: number) {
    if (!this.opts.notify) return
    try { await this.opts.notify(code, version) } catch (e) { console.error('Aviso en tiempo real fallido', e) }
  }

  toView(row: RoomRow, viewerId: string): RoomView {
    const me = row.players.find(p => p.id === viewerId)
    if (!me) throw new GameError('No perteneces a esta sala.', 403)
    const nowMs = this.now()
    const status: RoomStatus =
      row.status === 'PLAYING' ? 'IN_PROGRESS' : row.status === 'FINISHED' ? 'FINISHED' : row.status === 'CLOSED' ? 'CLOSED' : 'WAITING'
    const listed = row.status === 'WAITING' ? active(row) : row.players
    const inGame = row.game?.players.some(p => p.id === viewerId)
    return {
      roomCode: row.code, status, gameNumber: row.game_number, version: row.version, viewerId, hostId: row.host_id, doubleLap: row.options.doubleLap,
      players: listed.map(p => {
        const awayMs = Math.max(0, nowMs - ms(p.seen))
        return { id: p.id, name: p.name, isHost: p.id === row.host_id, connected: p.id === viewerId || awayMs <= CONNECTED_WINDOW_MS, awayMs, left: p.left, abandoned: p.abandoned, rematch: p.rematch }
      }),
      canStart: row.status === 'WAITING' && row.host_id === viewerId && active(row).length >= MIN_PLAYERS,
      canRematch: row.status === 'FINISHED' && active(row).length >= MIN_PLAYERS,
      abandonAfterMs: ABANDON_AFTER_MS,
      game: row.game && inGame ? buildGameView(row.game, viewerId) : null,
    }
  }
}
