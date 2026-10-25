import { beforeEach, describe, expect, it } from 'vitest'
import { GameError } from '../shared/engine'
import type { RoomView } from '../shared/types'
import { ABANDON_AFTER_MS, CONNECTED_WINDOW_MS, RoomService, type AuthUser } from '../api/_lib/service'
import { MemoryStore } from '../api/_lib/store'
import { seeded } from './helpers'

const U = (id: string): AuthUser => ({ id, name: null, isAnonymous: true })
const users = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7'].map(U)
let store: MemoryStore, clock: number, pings: string[], svc: RoomService
const fail = async (p: Promise<unknown>) => { try { await p } catch (e) { return e as GameError } throw new Error('se esperaba un error') }

beforeEach(() => {
  store = new MemoryStore(); clock = Date.parse('2026-10-21T10:00:00Z'); pings = []
  svc = new RoomService(store, { now: () => clock, rng: seeded(5), notify: async code => { pings.push(code) } })
})

async function lobby(n: number, options: unknown = {}) {
  const created = await svc.create(users[0], 'Ana', options)
  for (let i = 1; i < n; i++) await svc.join(users[i], created.roomCode, `Jugador ${i + 1}`)
  return created.roomCode
}
async function started(n: number, options: unknown = {}) {
  const code = await lobby(n, options)
  const v = await svc.start(users[0], code)
  return { code, v }
}
/** El jugador al que le toca hace una jugada simple y válida. */
async function actCurrent(s: RoomService, code: string): Promise<RoomView> {
  const probe = await s.view(users[0], code)
  const turnId = probe.game!.turnPlayerId
  const u = users.find(x => x.id === turnId)!
  const v = await s.view(u, code)
  const g = v.game!
  if (g.phase === 'BIDDING') return s.bid(u, code, g.forbiddenBid === 0 ? 1 : 0)
  return s.play(u, code, g.legalCardIds[0])
}

describe('sala y jugadores', () => {
  it('crear sala: código de 6 caracteres, espera jugadores y guarda la opción de dos vueltas', async () => {
    const v = await svc.create(users[0], 'Ana', { doubleLap: true })
    expect(v.roomCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
    expect(v).toMatchObject({ status: 'WAITING', doubleLap: true, canStart: false })
    expect(v.players).toHaveLength(1); expect(v.players[0]).toMatchObject({ name: 'Ana', isHost: true })
    expect((await svc.create(users[1], 'B', undefined)).doubleLap).toBe(false)
  })
  it('se pueden unir hasta 6 jugadores; el séptimo no, y el anfitrión puede empezar con 3 o más', async () => {
    const code = await lobby(2)
    expect((await svc.view(users[0], code)).canStart).toBe(false)
    await svc.join(users[2], code, 'C')
    expect((await svc.view(users[0], code)).canStart).toBe(true)
    expect((await svc.view(users[1], code)).canStart).toBe(false) // solo el anfitrión
    for (let i = 3; i < 6; i++) await svc.join(users[i], code, `J${i}`)
    expect((await fail(svc.join(users[6], code, 'extra'))).status).toBe(409)
    expect((await svc.view(users[0], code)).players).toHaveLength(6)
  })
  it('reconexión: volver a entrar con la misma cuenta no duplica jugadores', async () => {
    const code = await lobby(3)
    await svc.join(users[1], code, 'otra vez'); await svc.join(users[1], code, 'otra vez')
    expect((await svc.view(users[0], code)).players).toHaveLength(3)
  })
  it('código inexistente o mal formado: 404; entrar con la partida empezada: 409', async () => {
    expect((await fail(svc.join(users[3], 'ZZZZZZ', 'x'))).status).toBe(404)
    expect((await fail(svc.join(users[3], 'abc', 'x'))).status).toBe(404)
    const { code } = await started(3)
    expect((await fail(svc.join(users[3], code, 'tarde'))).status).toBe(409)
    expect((await fail(svc.view(users[3], code))).status).toBe(403)
  })
  it('empezar: solo el anfitrión (403), con al menos 3 jugadores (409), y reparte la mano máxima', async () => {
    const two = await lobby(2)
    expect((await fail(svc.start(users[0], two))).status).toBe(409)
    const code = await lobby(5)
    expect((await fail(svc.start(users[1], code))).status).toBe(403)
    const v = await svc.start(users[0], code)
    expect(v.status).toBe('IN_PROGRESS')
    expect(v.game!.seats).toHaveLength(5); expect(v.game!.cardsThisRound).toBe(10); expect(v.game!.totalRounds).toBe(10)
    expect(v.game!.hand).toHaveLength(10); expect(pings).toContain(code)
    expect((await fail(svc.start(users[0], code))).status).toBe(409)
  })
  it('con dos vueltas el calendario de manos sube de nuevo', async () => {
    const { v } = await started(4, { doubleLap: true })
    expect(v.game!.totalRounds).toBe(25)
  })
  it('los nombres se sanean', async () => {
    const v = await svc.create(users[0], '  <b>Ana</b>\n\tLa   Grande  y un nombre larguísimo de más de veinticuatro  ', {})
    expect(v.players[0].name.length).toBeLessThanOrEqual(24); expect(v.players[0].name).not.toMatch(/[<>\n\t]/)
    expect((await svc.create(users[1], '   ', {})).players[0].name).toBe('Jugador')
  })
})

describe('partida: privacidad y turnos', () => {
  it('cada jugador solo recibe su mano; el JSON no contiene cartas ajenas', async () => {
    const { code } = await started(4)
    const row = (await store.get(code))!
    const json = JSON.stringify(await svc.view(users[0], code))
    for (const p of row.game!.players) {
      for (const c of p.hand) (p.id === 'u1' ? expect(json) : expect(json).not).toContain(`"${c.id}"`)
    }
  })
  it('impide cantar o jugar fuera de turno', async () => {
    const { code } = await started(4)
    const row = (await store.get(code))!
    const waiting = row.game!.players.find(p => p.id !== row.game!.players[row.game!.turnIndex].id)!
    const u = users.find(x => x.id === waiting.id)!
    expect((await fail(svc.bid(u, code, 0))).status).toBe(409)
    expect((await fail(svc.play(u, code, waiting.hand[0].id))).status).toBe(409)
  })
  it('el último en cantar no puede igualar las apuestas con las bazas (se rechaza con 400)', async () => {
    const { code } = await started(3)
    // se juega hasta una mano de 1 carta para que sea fácil comprobar la regla
    const row = (await store.get(code))!
    row.game!.schedule = [1]; row.game!.roundIndex = 0
    for (const p of row.game!.players) { p.hand = p.hand.slice(0, 1); p.bid = null }
    store.rooms.set(code, row)
    for (let i = 0; i < 2; i++) await actCurrent(svc, code) // los dos primeros cantan 0
    const last = (await store.get(code))!.game!
    const u = users.find(x => x.id === last.players[last.turnIndex].id)!
    expect(last.turnIndex).toBe(last.dealerIndex)
    expect((await fail(svc.bid(u, code, 1))).status).toBe(400)
    await svc.bid(u, code, 0)
    expect((await svc.view(u, code)).game!.phase).toBe('PLAYING')
  })
  it('un jugador de la sala puede jugar una partida completa y se registra una vez en el historial', async () => {
    const { code } = await started(3)
    let v = await svc.view(users[0], code)
    for (let i = 0; i < 4000 && v.status === 'IN_PROGRESS'; i++) { clock += 2000; v = await actCurrent(svc, code) }
    v = await svc.view(users[0], code)
    expect(v.status).toBe('FINISHED')
    expect(v.game!.ranking).toHaveLength(3)
    expect(store.matches).toHaveLength(1)
    const m = store.matches[0]
    expect(m).toMatchObject({ room_code: code, game_number: 1, rounds: 17, double_lap: false, ended_by_abandon: false })
    expect(m.player_ids.sort()).toEqual(['u1', 'u2', 'u3'])
    expect(m.players.filter(p => p.rank === 1).length).toBeGreaterThanOrEqual(1)
    expect(m.players.every(p => ['WIN', 'DRAW', 'LOSS'].includes(p.result))).toBe(true)
  }, 60_000)
})

describe('conexión y abandono', () => {
  it('muestra a los desconectados y avisa cuando alguien vuelve', async () => {
    const { code } = await started(3)
    clock += CONNECTED_WINDOW_MS + 5000
    const v = await svc.view(users[0], code)
    expect(v.players.find(p => p.id === 'u2')!.connected).toBe(false)
    pings.length = 0; clock += 1000
    await svc.view(users[1], code)
    expect(pings).toContain(code)
    expect((await svc.view(users[0], code)).players.find(p => p.id === 'u2')!.connected).toBe(true)
  })
  it('quien desaparece demasiado tiempo pasa a piloto automático; la partida sigue y no se pierde la mano de nadie', async () => {
    const { code } = await started(4)
    for (let t = 0; t < Math.ceil(ABANDON_AFTER_MS / 10_000) + 2; t++) { clock += 10_000; await svc.view(users[0], code); await svc.view(users[1], code); await svc.view(users[2], code) }
    const v = await svc.view(users[0], code)
    expect(v.status).toBe('IN_PROGRESS')
    const gone = v.players.find(p => p.id === 'u4')!
    expect(gone.abandoned).toBe(true)
    expect(v.game!.seats.find(s => s.id === 'u4')!.auto).toBe(true)
    const back = await svc.view(users[3], code) // al volver sigue siendo jugador (y ve que fue retirado)
    expect(back.players.find(p => p.id === 'u4')!.abandoned).toBe(true)
  })
  it('si todos estuvieron fuera mucho tiempo, quien vuelve primero NO deja fuera a los demás', async () => {
    const { code } = await started(3)
    clock += 60 * 60_000
    const v = await svc.view(users[0], code)
    expect(v.players.some(p => p.abandoned)).toBe(false)
  })
  it('abandonar voluntariamente: tu sitio lo lleva el piloto automático, los demás terminan y quedas último en el historial', async () => {
    const { code } = await started(3)
    let v = await svc.abandon(users[1], code)
    expect(v.players.find(p => p.id === 'u2')!.abandoned).toBe(true)
    expect(v.status).toBe('IN_PROGRESS')
    expect((await svc.abandon(users[1], code)).status).toBe('IN_PROGRESS') // idempotente
    // los dos jugadores restantes juegan hasta el final; si fuera el turno de u2 lo resuelve el piloto
    for (let i = 0; i < 4000 && v.status === 'IN_PROGRESS'; i++) {
      const row = (await store.get(code))!
      const turnId = row.game!.players[row.game!.turnIndex].id
      expect(turnId).not.toBe('u2')
      const u = users.find(x => x.id === turnId)!; const g = (await svc.view(u, code)).game!
      v = g.phase === 'BIDDING' ? await svc.bid(u, code, g.forbiddenBid === 0 ? 1 : 0) : await svc.play(u, code, g.legalCardIds[0])
    }
    v = await svc.view(users[0], code)
    expect(v.status).toBe('FINISHED')
    const rec = store.matches[0]
    expect(rec.players.find(p => p.id === 'u2')).toMatchObject({ abandoned: true, result: 'LOSS', rank: 3 })
  }, 60_000)
  it('si solo queda un jugador, la partida termina y gana él (abandono)', async () => {
    const { code } = await started(3)
    await svc.abandon(users[1], code)
    const v = await svc.abandon(users[2], code)
    expect(v.status).toBe('FINISHED'); expect(v.game!.endReason).toBe('ABANDON')
    expect(store.matches[0]).toMatchObject({ ended_by_abandon: true })
    expect(store.matches[0].players.find(p => p.id === 'u1')).toMatchObject({ result: 'WIN', rank: 1 })
  })
  it('salir de la sala en mitad de la partida cuenta como abandono y los demás siguen', async () => {
    const { code } = await started(4)
    const v = await svc.leave(users[3], code)
    expect(v.players.find(p => p.id === 'u4')).toMatchObject({ left: true, abandoned: true })
    expect((await svc.view(users[0], code)).status).toBe('IN_PROGRESS')
  })
  it('salir de la sala de espera: el anfitrión cede el puesto; si sale el último, la sala se cierra', async () => {
    const code = await lobby(3)
    await svc.leave(users[0], code)
    const v = await svc.view(users[1], code)
    expect(v.hostId).toBe('u2'); expect(v.players).toHaveLength(2)
    await svc.leave(users[1], code); await svc.leave(users[2], code)
    expect((await svc.view(users[2], code)).status).toBe('CLOSED')
  })
})

describe('revancha', () => {
  async function finishedRoom(n: number) {
    const { code } = await started(n)
    for (let i = 0; i < n - 1; i++) await svc.abandon(users[i + 1], code) // acaba rápido: gana u1
    return code
  }
  it('empieza otra partida cuando la piden todos y se registra aparte', async () => {
    const code = await started(3).then(({ code }) => code)
    await svc.abandon(users[1], code); await svc.abandon(users[2], code)
    expect((await svc.view(users[0], code)).status).toBe('FINISHED')
    let v = await svc.rematch(users[0], code)
    expect(v.status).toBe('FINISHED'); expect(v.players.find(p => p.id === 'u1')!.rematch).toBe(true)
    await svc.rematch(users[1], code)
    v = await svc.rematch(users[2], code)
    expect(v.status).toBe('IN_PROGRESS'); expect(v.gameNumber).toBe(2); expect(v.game!.moves).toBe(0)
    expect(v.players.every(p => !p.abandoned && !p.rematch)).toBe(true)
    await svc.abandon(users[1], code); await svc.abandon(users[2], code)
    expect(store.matches.map(m => m.game_number)).toEqual([1, 2])
  })
  it('si alguien se va, la revancha es con los que quedan (mínimo 3); con menos no se puede', async () => {
    const code = await finishedRoom(4)
    await svc.leave(users[3], code)
    await svc.rematch(users[0], code); await svc.rematch(users[1], code)
    const v = await svc.rematch(users[2], code)
    expect(v.status).toBe('IN_PROGRESS'); expect(v.game!.seats).toHaveLength(3)
    const code2 = await finishedRoom(3)
    await svc.leave(users[2], code2)
    expect((await svc.view(users[0], code2)).canRematch).toBe(false)
    expect((await fail(svc.rematch(users[0], code2))).status).toBe(409)
  })
  it('no se puede pedir revancha con la partida en curso', async () => {
    const { code } = await started(3)
    expect((await fail(svc.rematch(users[0], code))).status).toBe(409)
  })
})

describe('robustez', () => {
  it('reintenta si otra petición escribe a la vez (control de versión)', async () => {
    const { code } = await started(3)
    const row = (await store.get(code))!
    const u = users.find(x => x.id === row.game!.players[row.game!.turnIndex].id)!
    store.beforeUpdate = () => { store.rooms.get(code)!.version += 1 }
    const v = await svc.bid(u, code, 0)
    expect(v.game!.seats.find(s => s.id === u.id)!.bid).toBe(0)
  })
  it('un simple latido no emite avisos en tiempo real (evita bucles)', async () => {
    const { code } = await started(3)
    pings.length = 0
    clock += 8000; await svc.view(users[0], code); clock += 8000; await svc.view(users[0], code)
    expect(pings).toHaveLength(0)
  })
})
