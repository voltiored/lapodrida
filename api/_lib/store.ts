import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { GameState, MatchRecord } from '../../shared/types'

export type RoomLifecycle = 'WAITING' | 'PLAYING' | 'FINISHED' | 'CLOSED'

export interface RoomPlayer {
  id: string
  name: string
  seen: string // ISO: última señal de vida
  left: boolean // ha salido de la sala
  abandoned: boolean // abandonó la partida en curso
  rematch: boolean // quiere revancha
}

/** Fila de la tabla `podrida_rooms`. Solo el servidor (service_role) puede leerla: contiene todas las manos y el estado completo. */
export interface RoomRow {
  code: string
  status: RoomLifecycle
  host_id: string
  players: RoomPlayer[]
  options: { doubleLap: boolean }
  game: GameState | null
  game_number: number
  version: number
}

export interface RoomStore {
  get(code: string): Promise<RoomRow | null>
  /** false si el código ya existe. */
  insert(row: RoomRow): Promise<boolean>
  /** Escritura optimista: solo si la versión en base de datos sigue siendo `expectedVersion`. */
  update(row: RoomRow, expectedVersion: number): Promise<RoomRow | null>
  /** Idempotente por (room_code, game_number). */
  recordMatch(match: MatchRecord): Promise<void>
}

// ------------------------------------------------------------------ memoria (tests y desarrollo)
export class MemoryStore implements RoomStore {
  rooms = new Map<string, RoomRow>()
  matches: MatchRecord[] = []
  /** Permite a los tests forzar una carrera: se ejecuta justo antes del siguiente update. */
  beforeUpdate?: () => void

  async get(code: string) { const r = this.rooms.get(code); return r ? structuredClone(r) : null }
  async insert(row: RoomRow) {
    if (this.rooms.has(row.code)) return false
    this.rooms.set(row.code, structuredClone(row))
    return true
  }
  async update(row: RoomRow, expectedVersion: number) {
    if (this.beforeUpdate) { const f = this.beforeUpdate; this.beforeUpdate = undefined; f() }
    const cur = this.rooms.get(row.code)
    if (!cur || cur.version !== expectedVersion) return null
    const next = structuredClone({ ...row, version: expectedVersion + 1 })
    this.rooms.set(row.code, next)
    return structuredClone(next)
  }
  async recordMatch(m: MatchRecord) {
    if (this.matches.some(x => x.room_code === m.room_code && x.game_number === m.game_number)) return
    this.matches.push(structuredClone(m))
  }
}

// ------------------------------------------------------------------ Supabase
export function adminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en las variables de entorno.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export class SupabaseStore implements RoomStore {
  constructor(private db: SupabaseClient) {}

  async get(code: string) {
    const { data, error } = await this.db.from('podrida_rooms').select('*').eq('code', code).maybeSingle()
    if (error) throw new Error(`podrida_rooms.get: ${error.message}`)
    return (data as RoomRow | null) ?? null
  }
  async insert(row: RoomRow) {
    const { error } = await this.db.from('podrida_rooms').insert(row)
    if (!error) return true
    if (error.code === '23505') return false
    throw new Error(`podrida_rooms.insert: ${error.message}`)
  }
  async update(row: RoomRow, expectedVersion: number) {
    const { code, ...rest } = row
    const { data, error } = await this.db
      .from('podrida_rooms')
      .update({ ...rest, version: expectedVersion + 1, updated_at: new Date().toISOString() })
      .eq('code', code)
      .eq('version', expectedVersion)
      .select('*')
    if (error) throw new Error(`podrida_rooms.update: ${error.message}`)
    return data && data.length > 0 ? (data[0] as RoomRow) : null
  }
  async recordMatch(m: MatchRecord) {
    const { error } = await this.db.from('podrida_matches').upsert(m, { onConflict: 'room_code,game_number', ignoreDuplicates: true })
    if (error) throw new Error(`podrida_matches.upsert: ${error.message}`)
  }
}
