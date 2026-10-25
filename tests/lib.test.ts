import { describe, expect, it } from 'vitest'
import type { MatchRecord } from '../shared/types'
import { computeStats } from '../src/lib/stats'
import { soundEventsFromDiff, type Snap } from '../src/lib/soundEvents'

const snap = (o: Partial<Snap> = {}): Snap => ({ gameNumber: 1, round: 1, players: 4, trickCards: 0, trickSeq: 0, bids: 0, yourTurn: false, finished: false, iWon: false, ...o })
const kinds = (a: Snap | null, b: Snap) => soundEventsFromDiff(a, b).map(e => e.kind)

describe('sonidos según los cambios de la partida', () => {
  it('al cargar la página no suena nada', () => { expect(kinds(null, snap({ round: 3, trickCards: 2 }))).toEqual([]) })
  it('una carta nueva en la mesa → sonido de carta; sin cambios → silencio', () => {
    expect(kinds(snap({ trickCards: 1 }), snap({ trickCards: 2 }))).toEqual(['place'])
    expect(kinds(snap({ trickCards: 1 }), snap({ trickCards: 1 }))).toEqual([])
  })
  it('al completarse la baza suena la carta y se recoge', () => {
    expect(kinds(snap({ trickCards: 3, trickSeq: 4 }), snap({ trickCards: 0, trickSeq: 5 }))).toEqual(['place', 'sweep'])
  })
  it('nueva mano: se reparte (varios golpes de carta); nueva partida igual', () => {
    const k = kinds(snap({ round: 1 }), snap({ round: 2 }))
    expect(k.length).toBeGreaterThan(3); expect(new Set(k)).toEqual(new Set(['deal']))
    expect(new Set(kinds(snap({ gameNumber: 1, round: 5 }), snap({ gameNumber: 2, round: 1 })))).toEqual(new Set(['deal']))
  })
  it('última baza + nueva mano: primero se recoge y luego se reparte', () => {
    const k = kinds(snap({ round: 1, trickCards: 3, trickSeq: 1 }), snap({ round: 2, trickCards: 0, trickSeq: 2, yourTurn: true }))
    expect(k.slice(0, 2)).toEqual(['place', 'sweep']); expect(k).toContain('deal'); expect(k[k.length - 1]).toBe('turn')
  })
  it('apuestas nuevas → tic; cuando pasa a ser tu turno → aviso; victoria → fanfarria', () => {
    expect(kinds(snap({ bids: 1 }), snap({ bids: 2 }))).toEqual(['tick'])
    expect(kinds(snap(), snap({ yourTurn: true }))).toEqual(['turn'])
    expect(kinds(snap({ yourTurn: true }), snap({ yourTurn: true }))).toEqual([])
    expect(kinds(snap(), snap({ finished: true, iWon: true }))).toEqual(['win'])
    expect(kinds(snap(), snap({ finished: true, iWon: false }))).toEqual([])
  })
})

let t = 0
const m = (me: 'win' | 'loss' | 'draw', extra: Partial<MatchRecord> = {}, abandonedMe = false): MatchRecord => {
  const start = Date.parse('2026-10-01T10:00:00Z') + (t++) * 3_600_000
  const result = me === 'win' ? 'WIN' : me === 'draw' ? 'DRAW' : 'LOSS'
  return {
    room_code: 'R' + t, game_number: 1, player_ids: ['me', 'p2', 'p3'], rounds: 17, double_lap: false, ended_by_abandon: false,
    players: [
      { id: 'me', name: 'Yo', score: me === 'win' ? 120 : 60, rank: me === 'win' || me === 'draw' ? 1 : 2, abandoned: abandonedMe, result },
      { id: 'p2', name: 'Primo', score: me === 'win' ? 80 : me === 'draw' ? 120 : 100, rank: me === 'win' ? 2 : me === 'draw' ? 1 : 1, abandoned: false, result: me === 'win' ? 'LOSS' : me === 'draw' ? 'DRAW' : 'WIN' },
      { id: 'p3', name: 'Tía', score: 50, rank: 3, abandoned: false, result: 'LOSS' },
    ],
    started_at: new Date(start).toISOString(), ended_at: new Date(start + 1_800_000).toISOString(), ...extra,
  }
}
describe('estadísticas multijugador', () => {
  it('sin partidas: todo a cero', () => {
    const s = computeStats([], 'me')
    expect(s).toMatchObject({ played: 0, winRate: null, avgScore: null, bestScore: null })
  })
  it('victorias, empates, derrotas, abandonos, porcentaje, puntos y rachas', () => {
    const s = computeStats([m('win'), m('win'), m('draw'), m('win'), m('loss', {}, true), m('loss')], 'me')
    expect(s).toMatchObject({ played: 6, wins: 3, draws: 1, losses: 2, abandons: 1, winRate: 50, bestWinStreak: 2, bestScore: 120 })
    expect(s.currentStreak).toEqual({ type: 'LOSS', count: 2 })
    expect(s.avgScore).toBe(90)
  })
  it('por rival: cuántas veces quedaste por delante, por detrás o empatado, e historial reciente primero', () => {
    const s = computeStats([m('win'), m('loss'), m('draw')], 'me')
    const primo = s.rivals.find(r => r.id === 'p2')!
    expect(primo).toMatchObject({ games: 3, ahead: 1, behind: 1, tied: 1 })
    expect(s.rivals.find(r => r.id === 'p3')).toMatchObject({ games: 3, ahead: 3 })
    expect(s.history).toHaveLength(3); expect(s.history[0].result).toBe('DRAW')
    expect(s.history[0].durationMs).toBe(1_800_000)
  })
  it('ignora partidas donde no apareces', () => {
    expect(computeStats([m('win')], 'otra-persona').played).toBe(0)
  })
})
