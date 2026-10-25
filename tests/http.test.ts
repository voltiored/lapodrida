// Prueba de extremo a extremo del endpoint real (api/game.ts) a través de HTTP, con el SupabaseStore real
// hablando con un servidor falso que imita la API de Supabase (Auth + PostgREST + Realtime).
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import handler from '../api/game'

const USERS: Record<string, { id: string; is_anonymous: boolean; user_metadata: object }> = {
  'tok-ana': { id: 'ana-uid', is_anonymous: true, user_metadata: {} },
  'tok-beto': { id: 'beto-uid', is_anonymous: false, user_metadata: { full_name: 'Beto Pérez' } },
  'tok-carla': { id: 'carla-uid', is_anonymous: true, user_metadata: {} },
  'tok-dani': { id: 'dani-uid', is_anonymous: true, user_metadata: {} },
}
const rooms = new Map<string, any>()
const matches: any[] = []
const broadcasts: any[] = []

const readBody = async (req: IncomingMessage) => { const c: Buffer[] = []; for await (const x of req) c.push(x as Buffer); return Buffer.concat(c).toString() }
const send = (res: ServerResponse, status: number, body?: unknown) => {
  res.statusCode = status
  if (body !== undefined) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)) } else res.end()
}
const matchFilters = (row: any, url: URL) => {
  for (const [k, v] of url.searchParams) {
    if (['select', 'on_conflict', 'columns'].includes(k)) continue
    if (v.startsWith('eq.') && String(row[k]) !== v.slice(3)) return false
  }
  return true
}

function fakeSupabase(): Server {
  return createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://x')
    const raw = await readBody(req)
    if (url.pathname === '/auth/v1/user') {
      const user = USERS[(req.headers.authorization ?? '').replace('Bearer ', '')]
      return user ? send(res, 200, user) : send(res, 401, { message: 'invalid JWT' })
    }
    if (url.pathname === '/realtime/v1/api/broadcast') { broadcasts.push(JSON.parse(raw)); return send(res, 202) }
    if (url.pathname === '/rest/v1/podrida_rooms') {
      if (req.method === 'GET') {
        const rows = [...rooms.values()].filter(r => matchFilters(r, url)).map(r => structuredClone(r))
        if (String(req.headers.accept).includes('vnd.pgrst.object')) return rows.length === 1 ? send(res, 200, rows[0]) : send(res, 406, { code: 'PGRST116', message: 'no rows' })
        return send(res, 200, rows)
      }
      if (req.method === 'POST') {
        const row = JSON.parse(raw)
        if (rooms.has(row.code)) return send(res, 409, { code: '23505', message: 'duplicate key value' })
        rooms.set(row.code, { ...row, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        return send(res, 201)
      }
      if (req.method === 'PATCH') {
        const patch = JSON.parse(raw); const hit: any[] = []
        for (const [code, r] of rooms) if (matchFilters(r, url)) { const next = { ...r, ...patch }; rooms.set(code, next); hit.push(structuredClone(next)) }
        return send(res, 200, hit)
      }
    }
    if (url.pathname === '/rest/v1/podrida_matches' && req.method === 'POST') {
      const m = JSON.parse(raw)
      if (!matches.some(x => x.room_code === m.room_code && x.game_number === m.game_number)) matches.push(m)
      return send(res, 201)
    }
    send(res, 404, { message: 'no implementado en el simulador: ' + req.method + ' ' + url.pathname })
  })
}

let supa: Server, app: Server, base = ''

beforeAll(async () => {
  supa = fakeSupabase()
  await new Promise<void>(r => supa.listen(0, '127.0.0.1', r))
  process.env.SUPABASE_URL = `http://127.0.0.1:${(supa.address() as AddressInfo).port}`
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key'
  app = createServer(async (req, res) => {
    const raw = await readBody(req)
    const url = new URL(req.url!, 'http://x')
    const vreq: any = Object.assign(req, { body: raw ? JSON.parse(raw) : undefined, query: Object.fromEntries(url.searchParams) })
    const vres: any = Object.assign(res, {
      status(c: number) { res.statusCode = c; return vres },
      json(p: unknown) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(p)); return vres },
    })
    await handler(vreq, vres)
  })
  await new Promise<void>(r => app.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(app.address() as AddressInfo).port}/api/game`
})
afterAll(() => { supa.close(); app.close() })

const post = (token: string | null, body: object) =>
  fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })
const get = (token: string | null, code: string) => fetch(`${base}?code=${code}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })

describe('API HTTP + Supabase (simulado)', () => {
  let code = ''
  const tokens = ['tok-ana', 'tok-beto', 'tok-carla', 'tok-dani']

  it('rechaza peticiones sin sesión o con sesión falsa (401)', async () => {
    expect((await get(null, 'ABC234')).status).toBe(401)
    expect((await get('tok-falso', 'ABC234')).status).toBe(401)
    expect((await post(null, { action: 'create', name: 'X' })).status).toBe(401)
  })

  it('crea la sala, se unen tres más y el anfitrión empieza la partida', async () => {
    const created = await (await post('tok-ana', { action: 'create', name: 'Ana', options: { doubleLap: true } })).json()
    code = created.roomCode
    expect(created).toMatchObject({ status: 'WAITING', doubleLap: true })
    expect(rooms.get(code).host_id).toBe('ana-uid')
    expect((await post('tok-beto', { action: 'start', code })).status).toBe(403) // no es el anfitrión
    for (const t of tokens.slice(1)) {
      const r = await post(t, { action: 'join', code: code.toLowerCase(), name: '' })
      expect(r.status).toBe(200)
    }
    expect(rooms.get(code).players.find((p: any) => p.id === 'beto-uid').name).toBe('Beto Pérez') // nombre vacío → el de su cuenta
    const started = await (await post('tok-ana', { action: 'start', code })).json()
    expect(started.status).toBe('IN_PROGRESS'); expect(started.game.seats).toHaveLength(4); expect(started.game.totalRounds).toBe(25)
    expect(broadcasts.some(b => b.messages[0].topic === `podrida-room:${code}` && b.messages[0].event === 'tick')).toBe(true)
  })

  it('cada jugador ve solo su mano y un extraño no puede entrar ni ver la sala', async () => {
    const a = await (await get('tok-ana', code)).json()
    const row = rooms.get(code)
    for (const p of row.game.players.filter((x: any) => x.id !== 'ana-uid')) for (const c of p.hand) expect(JSON.stringify(a)).not.toContain(`"${c.id}"`)
    USERS['tok-extra'] = { id: 'extra-uid', is_anonymous: true, user_metadata: {} }
    expect((await get('tok-extra', code)).status).toBe(403)
    expect((await post('tok-extra', { action: 'join', code, name: 'Extra' })).status).toBe(409) // ya empezó
  })

  it('cantar y jugar: fuera de turno 409, jugada ilegal 400, y una jugada válida avanza el turno', async () => {
    const g = rooms.get(code).game
    const turnId = g.players[g.turnIndex].id
    const tokenOf = (id: string) => Object.entries(USERS).find(([, u]) => u.id === id)![0]
    const other = tokens.find(t => USERS[t].id !== turnId)!
    expect((await post(other, { action: 'bid', code, value: 0 })).status).toBe(409)
    expect((await post(tokenOf(turnId), { action: 'bid', code, value: 99 })).status).toBe(400)
    const ok = await post(tokenOf(turnId), { action: 'bid', code, value: 0 })
    expect(ok.status).toBe(200)
    expect(rooms.get(code).game.players.find((p: any) => p.id === turnId).bid).toBe(0)
    expect((await post(tokenOf(turnId), { action: 'inventada', code })).status).toBe(400)
  })

  it('abandono y salida quedan en el historial; la sala inexistente da 404', async () => {
    await post('tok-beto', { action: 'abandon', code })
    await post('tok-carla', { action: 'abandon', code })
    const v = await (await post('tok-dani', { action: 'abandon', code })).json()
    expect(v.status).toBe('FINISHED')
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({ room_code: code, game_number: 1, ended_by_abandon: true })
    expect(matches[0].player_ids.sort()).toEqual(['ana-uid', 'beto-uid', 'carla-uid', 'dani-uid'])
    expect(matches[0].players.find((p: any) => p.id === 'ana-uid')).toMatchObject({ result: 'WIN', rank: 1 })
    expect((await get('tok-ana', 'ZZZZZZ')).status).toBe(404)
    const left = await (await post('tok-dani', { action: 'leave', code })).json()
    expect(left.players.find((p: any) => p.id === 'dani-uid').left).toBe(true)
  })
})
