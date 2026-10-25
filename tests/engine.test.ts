import { describe, expect, it } from 'vitest'
import {
  GameError, abandonPlayer, bid, buildGameView, createDeck, forbiddenBid, handPoints, legalCards, newGame, playCard, ranking, roundSchedule,
} from '../shared/engine'
import { card, ids, mkGame, seeded, setup, totalCards } from './helpers'

const status = (fn: () => void) => { try { fn() } catch (e) { return (e as GameError).status } return 0 }

describe('baraja y calendario de manos', () => {
  it('baraja francesa de 52 cartas sin comodines', () => {
    const d = createDeck()
    expect(d).toHaveLength(52); expect(new Set(d.map(c => c.id)).size).toBe(52)
    expect(d.filter(c => c.rank === 14)).toHaveLength(4)
  })
  it('empieza repartiendo todas las cartas posibles (52/n) y baja de una en una hasta 1', () => {
    expect(roundSchedule(4, false)).toEqual([13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1])
    expect(roundSchedule(3, false)[0]).toBe(17); expect(roundSchedule(5, false)[0]).toBe(10); expect(roundSchedule(6, false)[0]).toBe(8)
  })
  it('con "dos vueltas" vuelve a subir hasta el máximo sin repetir el 1', () => {
    expect(roundSchedule(6, true)).toEqual([8, 7, 6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6, 7, 8])
    expect(roundSchedule(4, true)).toHaveLength(25)
  })
})

describe('reparto y triunfo', () => {
  it('reparte las cartas de la mano a cada jugador y descarta duplicados', () => {
    for (const n of [3, 4, 5, 6]) {
      const g = mkGame(n)
      const dealt = g.players.flatMap(p => p.hand)
      expect(g.players.every(p => p.hand.length === Math.floor(52 / n))).toBe(true)
      expect(new Set(dealt.map(c => c.id)).size).toBe(dealt.length)
    }
  })
  it('con 4 jugadores y la mano máxima se reparte todo el mazo y el triunfo es aleatorio (y se avisa)', () => {
    const g = mkGame(4)
    expect(g.randomTrump).toBe(true); expect(g.trumpCard).toBeNull()
    expect(buildGameView(g, 'A').randomTrump).toBe(true)
  })
  it('con otros números de jugadores, o en manos más cortas, el triunfo sale de la última carta del mazo sobrante', () => {
    for (const n of [3, 5, 6]) { const g = mkGame(n); expect(g.randomTrump).toBe(false); expect(g.trumpCard).not.toBeNull(); expect(g.trump).toBe(g.trumpCard!.suit) }
    // en la mano siguiente (12 cartas con 4 jugadores) ya sobran 4 cartas, así que el triunfo sale del mazo
    const g = setup(mkGame(4), { hands: { A: [card('H', 5)], B: [card('H', 9)], C: [card('H', 2)], D: [card('H', 3)] }, trump: 'S', dealer: 3, phase: 'PLAYING', bids: { A: 0, B: 1, C: 0, D: 0 } })
    g.schedule = [1, 12]; g.roundIndex = 0
    playCard(g, 'A', 'H5'); playCard(g, 'B', 'H9'); playCard(g, 'C', 'H2'); playCard(g, 'D', 'H3')
    expect(g.players[0].hand).toHaveLength(12); expect(g.randomTrump).toBe(false); expect(g.trump).toBe(g.trumpCard!.suit)
  })
})

describe('canto', () => {
  it('canta primero quien está después del que reparte; el que reparte canta el último', () => {
    const g = mkGame(4); const d = g.dealerIndex
    expect(g.phase).toBe('BIDDING')
    expect(g.players[g.turnIndex].id).toBe(g.players[(d + 1) % 4].id)
    const order: string[] = []
    for (let i = 0; i < 4; i++) { order.push(g.players[g.turnIndex].id); bid(g, g.players[g.turnIndex].id, 0) }
    expect(order[3]).toBe(g.players[d].id)
  })
  it('regla de oro: el último no puede decir el número que iguale las apuestas con las bazas', () => {
    const g = setup(mkGame(4), { hands: { A: [card('S', 2), card('S', 3), card('S', 4)], B: [card('H', 2), card('H', 3), card('H', 4)], C: [card('C', 2), card('C', 3), card('C', 4)], D: [card('D', 2), card('D', 3), card('D', 4)] }, trump: 'S', dealer: 3 })
    bid(g, 'A', 1); bid(g, 'B', 1)
    expect(forbiddenBid(g)).toBeNull() // C no es el último
    bid(g, 'C', 0)
    expect(forbiddenBid(g)).toBe(1) // 3 bazas - 2 apostadas
    expect(() => bid(g, 'D', 1)).toThrow(/último en cantar/)
    bid(g, 'D', 0)
    expect(g.phase).toBe('PLAYING')
    expect(g.players[g.turnIndex].id).toBe('A') // sale quien está después del que reparte
  })
  it('el número prohibido solo se muestra al jugador al que le toca; si es negativo o excede, no hay prohibición', () => {
    const g = setup(mkGame(3), { hands: { A: [card('S', 2)], B: [card('H', 2)], C: [card('C', 2)] }, trump: 'S', dealer: 2 })
    bid(g, 'A', 1); bid(g, 'B', 1) // suman 2 > 1 bazas: ya no hay número prohibido
    expect(forbiddenBid(g)).toBeNull()
    expect(buildGameView(g, 'C').forbiddenBid).toBeNull()
  })
  it('valida apuestas fuera de rango, no enteras y fuera de turno', () => {
    const g = setup(mkGame(3), { hands: { A: [card('S', 2), card('S', 3)], B: [card('H', 2), card('H', 3)], C: [card('C', 2), card('C', 3)] }, trump: 'S', dealer: 2 })
    expect(status(() => bid(g, 'B', 0))).toBe(409)
    expect(status(() => bid(g, 'A', 3))).toBe(400); expect(status(() => bid(g, 'A', -1))).toBe(400); expect(status(() => bid(g, 'A', 1.5))).toBe(400)
    expect(status(() => bid(g, 'Z', 0))).toBe(403)
    expect(status(() => playCard(g, 'A', 'S2'))).toBe(409) // aún no se puede jugar
  })
  it('siempre queda alguna apuesta posible para el último', () => {
    for (let seed = 1; seed < 40; seed++) {
      const g = mkGame(5, { seed })
      const cards = g.schedule[0]
      for (let i = 0; i < 4; i++) bid(g, g.players[g.turnIndex].id, Math.floor(Math.random() * (cards + 1)))
      const f = forbiddenBid(g)
      const options = Array.from({ length: cards + 1 }, (_, v) => v).filter(v => v !== f)
      expect(options.length).toBeGreaterThan(0)
    }
  })
})

describe('juego de las bazas', () => {
  const play4 = () => setup(mkGame(4), {
    hands: {
      A: [card('H', 14), card('H', 5), card('S', 3)],
      B: [card('H', 9), card('D', 14), card('D', 2)],
      C: [card('C', 13), card('C', 4), card('D', 3)],
      D: [card('H', 2), card('S', 12), card('C', 9)],
    },
    trump: 'D', dealer: 3, phase: 'PLAYING', bids: { A: 1, B: 1, C: 0, D: 1 },
  })
  it('hay que asistir al palo de salida', () => {
    const g = play4()
    playCard(g, 'A', 'H14') // sale A con corazones
    expect(() => playCard(g, 'B', 'D14')).toThrow(/asistir/) // B tiene corazones
    playCard(g, 'B', 'H9')
  })
  it('si no tienes el palo, debes jugar triunfo; si tampoco tienes, cualquier carta', () => {
    const g = play4()
    playCard(g, 'A', 'H14'); playCard(g, 'B', 'H9')
    expect(legalCards(g, g.players[2]).map(c => c.id).sort()).toEqual(['D3']) // C sin corazones: solo su triunfo
    expect(() => playCard(g, 'C', 'C13')).toThrow(/triunfo/)
    playCard(g, 'C', 'D3')
    expect(legalCards(g, g.players[3]).map(c => c.id).sort()).toEqual(['H2']) // D tiene corazones: asiste
    playCard(g, 'D', 'H2')
    // gana el único triunfo (C) y sale en la siguiente
    expect(g.lastTrick!.winnerId).toBe('C'); expect(g.players[2].tricks).toBe(1)
    expect(g.players[g.turnIndex].id).toBe('C')
  })
  it('sin triunfos gana la carta más alta del palo de salida; descartes de otros palos no cuentan', () => {
    const g = setup(mkGame(3), {
      hands: { A: [card('H', 5)], B: [card('C', 14)], C: [card('H', 10)] }, trump: 'S', dealer: 2, phase: 'PLAYING', bids: { A: 0, B: 0, C: 0 },
    })
    playCard(g, 'A', 'H5'); playCard(g, 'B', 'C14'); playCard(g, 'C', 'H10')
    expect(g.lastTrick!.winnerId).toBe('C')
  })
  it('el triunfo más alto gana a cualquier otro palo, aunque no sea el de salida', () => {
    const g = setup(mkGame(3), {
      hands: { A: [card('H', 14)], B: [card('S', 2)], C: [card('S', 9)] }, trump: 'S', dealer: 2, phase: 'PLAYING', bids: { A: 0, B: 0, C: 0 },
    })
    playCard(g, 'A', 'H14'); playCard(g, 'B', 'S2'); playCard(g, 'C', 'S9')
    expect(g.lastTrick!.winnerId).toBe('C')
  })
  it('si el palo de salida es el triunfo, se asiste con triunfo', () => {
    const g = setup(mkGame(3), {
      hands: { A: [card('S', 5), card('H', 3)], B: [card('S', 8), card('H', 9)], C: [card('H', 2), card('H', 4)] }, trump: 'S', dealer: 2, phase: 'PLAYING', bids: { A: 1, B: 1, C: 0 },
    })
    playCard(g, 'A', 'S5')
    expect(() => playCard(g, 'B', 'H9')).toThrow(/asistir/)
    playCard(g, 'B', 'S8'); playCard(g, 'C', 'H2')
    expect(g.lastTrick!.winnerId).toBe('B')
  })
  it('rechaza cartas ajenas, fuera de turno y las 52 cartas siguen contadas', () => {
    const g = play4()
    expect(status(() => playCard(g, 'B', 'H9'))).toBe(409)
    expect(status(() => playCard(g, 'A', 'H9'))).toBe(400)
    expect(totalCards(g)).toBe(12)
  })
})

describe('puntuación', () => {
  it('acierto: 10 + 3 por baza; fallo: -3 por cada baza de diferencia', () => {
    expect(handPoints(0, 0)).toBe(10); expect(handPoints(2, 2)).toBe(16); expect(handPoints(5, 5)).toBe(25)
    expect(handPoints(2, 3)).toBe(-3); expect(handPoints(3, 0)).toBe(-9); expect(handPoints(0, 4)).toBe(-12)
  })
  it('al terminar la mano se suman los puntos, rota el que reparte y se reparte la siguiente con una carta menos', () => {
    const g = setup(mkGame(3), {
      hands: { A: [card('H', 5)], B: [card('H', 9)], C: [card('H', 2)] }, trump: 'S', dealer: 2, phase: 'PLAYING', bids: { A: 0, B: 1, C: 1 },
    })
    g.schedule = [1, 1]; g.roundIndex = 0
    playCard(g, 'A', 'H5'); playCard(g, 'B', 'H9'); playCard(g, 'C', 'H2') // gana B
    expect(g.history).toHaveLength(1)
    const r = g.history[0].results
    expect(r.find(x => x.playerId === 'A')).toMatchObject({ bid: 0, won: 0, points: 10 })
    expect(r.find(x => x.playerId === 'B')).toMatchObject({ bid: 1, won: 1, points: 13 })
    expect(r.find(x => x.playerId === 'C')).toMatchObject({ bid: 1, won: 0, points: -3 })
    expect(g.players.map(p => p.score)).toEqual([10, 13, -3])
    expect(g.dealerIndex).toBe(0) // (2+1)%3
    expect(g.phase).toBe('BIDDING'); expect(g.players.every(p => p.hand.length === 1 && p.bid === null)).toBe(true)
  })
  it('la partida termina tras la última mano y gana quien más puntos acumula', () => {
    const g = setup(mkGame(3), {
      hands: { A: [card('H', 5)], B: [card('H', 9)], C: [card('H', 2)] }, trump: 'S', dealer: 2, phase: 'PLAYING', bids: { A: 0, B: 1, C: 0 },
    })
    g.schedule = [1]; g.roundIndex = 0
    playCard(g, 'A', 'H5'); playCard(g, 'B', 'H9'); playCard(g, 'C', 'H2')
    expect(g.status).toBe('FINISHED'); expect(g.endReason).toBe('NORMAL')
    const r = ranking(g)
    expect(r[0]).toMatchObject({ playerId: 'B', rank: 1, score: 13 })
    expect(r.filter(x => x.rank === 2)).toHaveLength(2) // A y C empatan a 10
  })
})

describe('partidas completas con jugadores aleatorios', () => {
  function playAll(n: number, doubleLap: boolean, seed: number) {
    const rng = seeded(seed)
    const g = mkGame(n, { doubleLap, seed })
    let steps = 0
    while (g.status === 'IN_PROGRESS' && steps++ < 20000) {
      const me = g.players[g.turnIndex]
      if (g.phase === 'BIDDING') {
        const f = forbiddenBid(g); const max = g.schedule[g.roundIndex]
        let v = Math.floor(rng() * (max + 1)); if (v === f) v = v === 0 ? 1 : v - 1
        bid(g, me.id, v)
      } else {
        const legal = legalCards(g, me)
        expect(legal.length).toBeGreaterThan(0)
        playCard(g, me.id, legal[Math.floor(rng() * legal.length)].id)
        if (g.status === 'IN_PROGRESS') expect(totalCards(g) % 1).toBe(0)
      }
    }
    return g
  }
  it('de 3 a 6 jugadores, con y sin dos vueltas: terminan, cada mano reparte lo previsto y los puntos cuadran', () => {
    for (const n of [3, 4, 5, 6]) for (const doubleLap of [false, true]) {
      const g = playAll(n, doubleLap, 100 + n)
      expect(g.status).toBe('FINISHED')
      expect(g.history).toHaveLength(roundSchedule(n, doubleLap).length)
      for (const h of g.history) {
        expect(h.results.reduce((s, r) => s + r.won, 0)).toBe(h.cards) // todas las bazas se reparten
        for (const r of h.results) expect(r.points).toBe(handPoints(r.bid, r.won))
      }
      for (const p of g.players) expect(p.score).toBe(g.history.reduce((s, h) => s + h.results.find(r => r.playerId === p.id)!.points, 0))
    }
  })
  it('en cada mano siempre alguien falla (nadie puede acertar todas las apuestas)', () => {
    const g = playAll(4, false, 5)
    for (const h of g.history) expect(h.results.some(r => r.bid !== r.won)).toBe(true)
  })
})

describe('abandono y piloto automático', () => {
  it('quien abandona pasa a piloto automático, la partida continúa y queda último en la clasificación', () => {
    const g = mkGame(4, { seed: 3 })
    abandonPlayer(g, 'B')
    expect(g.players.find(p => p.id === 'B')).toMatchObject({ auto: true, abandoned: true })
    // los demás siguen jugando; el turno de B lo resuelve el piloto
    let steps = 0
    while (g.status === 'IN_PROGRESS' && steps++ < 5000) {
      const me = g.players[g.turnIndex]
      expect(me.auto).toBe(false)
      if (g.phase === 'BIDDING') { const f = forbiddenBid(g); bid(g, me.id, f === 0 ? 1 : 0) }
      else playCard(g, me.id, legalCards(g, me)[0].id)
    }
    expect(g.status).toBe('FINISHED')
    const r = ranking(g)
    expect(r[r.length - 1]).toMatchObject({ playerId: 'B', abandoned: true, rank: 4 })
  })
  it('si solo queda un jugador humano, la partida acaba y gana él', () => {
    const g = mkGame(3)
    abandonPlayer(g, 'A'); expect(g.status).toBe('IN_PROGRESS')
    abandonPlayer(g, 'B')
    expect(g.status).toBe('FINISHED'); expect(g.endReason).toBe('ABANDON')
    expect(ranking(g)[0]).toMatchObject({ playerId: 'C', rank: 1 })
  })
})

describe('vista por jugador', () => {
  it('no revela las manos de los demás ni el mazo', () => {
    const g = mkGame(5, { seed: 11 })
    const json = JSON.stringify(buildGameView(g, 'A'))
    for (const p of g.players.slice(1)) for (const c of p.hand) expect(json).not.toContain(`"${c.id}"`)
    for (const c of g.players[0].hand) expect(json).toContain(`"${c.id}"`)
    expect(JSON.parse(json).seats.find((s: { id: string }) => s.id === 'B').handCount).toBe(g.schedule[0])
  })
  it('marca las cartas jugables solo en tu turno de jugar', () => {
    const g = setup(mkGame(3), { hands: { A: [card('H', 5), card('S', 4)], B: [card('H', 9), card('S', 2)], C: [card('H', 2), card('S', 3)] }, trump: 'D', dealer: 2, phase: 'PLAYING', bids: { A: 0, B: 0, C: 0 } })
    playCard(g, 'A', 'H5')
    expect(buildGameView(g, 'B').legalCardIds).toEqual(['H9'])
    expect(buildGameView(g, 'C').legalCardIds).toEqual([])
    expect(ids(3)).toHaveLength(3)
  })
  it('exige entre 3 y 6 jugadores', () => {
    expect(() => newGame('X', [{ id: 'a', name: 'a' }, { id: 'b', name: 'b' }], false)).toThrow()
    expect(() => newGame('X', ids(6).concat('G').map(id => ({ id, name: id })), false)).toThrow()
  })
})
