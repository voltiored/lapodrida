// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Lobby } from '../src/components/Lobby'
import { ResultModal } from '../src/components/ResultModal'
import { Table, type TableProps } from '../src/components/Table'
import { WaitingRoom } from '../src/components/WaitingRoom'
import { c, mkGameView, mkRoom } from './fixtures'

afterEach(cleanup)
const handlers = () => ({ onClearError: vi.fn(), onBid: vi.fn(), onPlay: vi.fn(), onAbandon: vi.fn(), onHome: vi.fn() })
function setup(game = mkGameView(), props: Partial<TableProps> = {}) {
  const h = handlers()
  render(<Table room={mkRoom(game)} game={game} busy={false} error="" offline={false} realtimeOk nowMs={0} fetchedAt={0} {...h} {...props} />)
  return h
}
const btn = (name: string | RegExp) => screen.getByRole('button', { name })

describe('mesa: jugar cartas', () => {
  it('tocar una carta la elige y tocarla otra vez la juega', () => {
    const h = setup()
    fireEvent.click(btn('A de corazones'))
    expect(h.onPlay).not.toHaveBeenCalled()
    expect(screen.getByText(/Toca otra vez A de corazones/)).toBeTruthy()
    fireEvent.click(btn('A de corazones'))
    expect(h.onPlay).toHaveBeenCalledWith('H14')
  })
  it('elegir otra carta cambia la selección sin jugar nada', () => {
    const h = setup()
    fireEvent.click(btn('A de corazones')); fireEvent.click(btn('5 de tréboles'))
    expect(h.onPlay).not.toHaveBeenCalled()
    fireEvent.click(btn('5 de tréboles'))
    expect(h.onPlay).toHaveBeenCalledWith('C5')
  })
  it('las cartas que no se pueden jugar (por asistir al palo) están desactivadas', () => {
    setup(mkGameView({ trick: [{ playerId: 'p3', card: c('C', 12) }], leadSuit: 'C', legalCardIds: ['C5'] }))
    expect((btn('A de corazones') as HTMLButtonElement).disabled).toBe(true)
    expect((btn('3 de picas') as HTMLButtonElement).disabled).toBe(true)
    expect((btn('5 de tréboles') as HTMLButtonElement).disabled).toBe(false)
  })
  it('fuera de turno no se puede jugar y el tablero se marca en espera (cartas más oscuras)', () => {
    const h = setup(mkGameView({ yourTurn: false, turnPlayerId: 'p1', legalCardIds: [] }))
    expect((btn('A de corazones') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(btn('A de corazones'))
    expect(h.onPlay).not.toHaveBeenCalled()
    expect(document.querySelector('.bd')!.classList.contains('bd--wait')).toBe(true)
    expect(screen.getByText(/Juega Beto/)).toBeTruthy()
  })
  it('muestra los jugadores con sus apuestas y bazas, quién reparte, el triunfo y la mano', () => {
    setup()
    expect(screen.getByText(/Mano/).textContent).toContain('2'); expect(screen.getByLabelText('Mesa')).toBeTruthy()
    expect(screen.getAllByText('R')).toHaveLength(1) // solo el que reparte (Dani) lleva la marca
    expect(screen.getByText('Triunfo').parentElement!.textContent).toContain('♥')
  })
  it('muestra las cartas de la baza en curso con el nombre de quien la jugó', () => {
    setup(mkGameView({ trick: [{ playerId: 'p1', card: c('S', 11) }, { playerId: 'p2', card: c('S', 4) }], leadSuit: 'S', turnPlayerId: 'p3', yourTurn: false, legalCardIds: [] }))
    const mesa = within(screen.getByLabelText('Mesa'))
    expect(mesa.getByLabelText('J de picas')).toBeTruthy(); expect(mesa.getByLabelText('4 de picas')).toBeTruthy()
    expect(mesa.getByText('Beto')).toBeTruthy()
  })
})

describe('mesa: cantar', () => {
  const bidding = (o = {}) => mkGameView({ phase: 'BIDDING', cardsThisRound: 3, legalCardIds: [], ...o })
  it('en tu turno de cantar aparecen los números de 0 al total de cartas y se canta con un toque', () => {
    const h = setup(bidding())
    for (const v of [0, 1, 2, 3]) expect(btn(`Apostar ${v}`)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Apostar 4' })).toBeNull()
    fireEvent.click(btn('Apostar 2'))
    expect(h.onBid).toHaveBeenCalledWith(2)
  })
  it('el último en cantar no puede elegir el número prohibido y se le explica', () => {
    const h = setup(bidding({ forbiddenBid: 1 }))
    expect((btn('Apostar 1') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(btn('Apostar 1')); expect(h.onBid).not.toHaveBeenCalled()
    expect(screen.getByText(/no puedes decir/).textContent).toContain('1')
    expect((btn('Apostar 0') as HTMLButtonElement).disabled).toBe(false)
  })
  it('si no te toca cantar no hay botones y se ve quién canta', () => {
    setup(bidding({ yourTurn: false, turnPlayerId: 'p2' }))
    expect(screen.queryByRole('button', { name: 'Apostar 0' })).toBeNull()
    expect(screen.getAllByText(/Canta Carla/).length).toBeGreaterThan(0)
  })
  it('se avisa cuando el triunfo ha sido aleatorio', () => {
    setup(bidding({ randomTrump: true, trumpCard: null, trump: 'D' }))
    expect(screen.getByText(/triunfo de esta mano ha sido aleatorio: diamantes/)).toBeTruthy()
  })
})

describe('mesa: menú, reglas, sonido y puntuación', () => {
  it('el menú ⋯ tiene Reglas, Puntuación, Sonido y Abandonar (con confirmación)', () => {
    const h = setup()
    fireEvent.click(btn('Más opciones'))
    expect(screen.getByText(/Sonido/)).toBeTruthy()
    fireEvent.click(screen.getByText(/Reglas/))
    expect(screen.getByRole('dialog', { name: /Reglas de La Podrida/ })).toBeTruthy()
    fireEvent.click(btn('Cerrar reglas')); expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(btn('Más opciones')); fireEvent.click(screen.getByText(/Puntuación/))
    expect(screen.getByRole('dialog', { name: /Puntuación/ })).toBeTruthy()
    fireEvent.click(btn('Cerrar puntuación'))
    fireEvent.click(btn('Más opciones'))
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false)
    fireEvent.click(screen.getByText(/Abandonar/)); expect(h.onAbandon).not.toHaveBeenCalled()
    fireEvent.click(btn('Más opciones'))
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true)
    fireEvent.click(screen.getByText(/Abandonar/)); expect(h.onAbandon).toHaveBeenCalledTimes(1)
  })
  it('el interruptor de sonido cambia entre activado y desactivado', () => {
    setup()
    fireEvent.click(btn('Más opciones'))
    expect(screen.getByText(/Sonido: activado/)).toBeTruthy()
    fireEvent.click(screen.getByText(/Sonido: activado/))
    expect(screen.getByText(/Sonido: desactivado/)).toBeTruthy()
    fireEvent.click(screen.getByText(/Sonido: desactivado/))
    expect(screen.getByText(/Sonido: activado/)).toBeTruthy()
  })
  it('la tabla de puntuación suma por mano y muestra los totales', () => {
    const history = [{ round: 1, cards: 3, trump: 'S' as const, dealerId: 'p3', results: [{ playerId: 'p0', bid: 1, won: 1, points: 13 }, { playerId: 'p1', bid: 0, won: 2, points: -6 }, { playerId: 'p2', bid: 1, won: 0, points: -3 }, { playerId: 'p3', bid: 1, won: 0, points: -3 }] }]
    setup(mkGameView({ history }))
    fireEvent.click(btn('Más opciones')); fireEvent.click(screen.getByText(/Puntuación/))
    const dlg = within(screen.getByRole('dialog'))
    expect(dlg.getByText('+13')).toBeTruthy(); expect(dlg.getByText('-6')).toBeTruthy()
    expect(dlg.getByText('Total')).toBeTruthy()
  })
  it('un error aparece en la franja y se puede cerrar; sin conexión se avisa', () => {
    const h = setup(mkGameView(), { error: 'Debes asistir al palo de salida.' })
    expect(screen.getByRole('alert').textContent).toContain('asistir al palo')
    fireEvent.click(btn('Cerrar')); expect(h.onClearError).toHaveBeenCalled()
    cleanup()
    setup(mkGameView(), { offline: true })
    expect(screen.getByText(/Sin conexión/)).toBeTruthy()
  })
  it('avisa si hay jugadores desconectados', () => {
    const game = mkGameView()
    const room = mkRoom(game); room.players[2] = { ...room.players[2], connected: false, awayMs: 90_000 }
    render(<Table room={room} game={game} busy={false} error="" offline={false} realtimeOk nowMs={0} fetchedAt={0} {...handlers()} />)
    expect(screen.getByText(/Carla desconectado/)).toBeTruthy()
  })
})

describe('resultado, sala de espera y menú principal', () => {
  const finished = () => {
    const ranking = [
      { playerId: 'p1', name: 'Beto', score: 80, rank: 1, abandoned: false },
      { playerId: 'p0', name: 'Ana', score: 60, rank: 2, abandoned: false },
      { playerId: 'p2', name: 'Carla', score: 10, rank: 3, abandoned: true },
    ]
    return mkGameView({ n: 3, status: 'FINISHED', ranking, yourTurn: false })
  }
  it('muestra la clasificación, mi puesto y permite pedir revancha', () => {
    const g = finished(); const onRematch = vi.fn()
    render(<ResultModal room={mkRoom(g)} busy={false} onRematch={onRematch} onLeave={vi.fn()} onStats={vi.fn()} onSheet={vi.fn()} />)
    expect(screen.getByText('2º PUESTO')).toBeTruthy(); expect(screen.getByText(/abandonó/)).toBeTruthy()
    fireEvent.click(btn(/Pedir revancha/)); expect(onRematch).toHaveBeenCalled()
  })
  it('tras pedir la revancha se espera a los demás; si la piden otros se avisa', () => {
    const g = finished(); const room = mkRoom(g)
    room.players = room.players.map(p => (p.id === 'p0' ? { ...p, rematch: true } : p))
    render(<ResultModal room={room} busy={false} onRematch={vi.fn()} onLeave={vi.fn()} onStats={vi.fn()} onSheet={vi.fn()} />)
    expect(btn(/Esperando a/).hasAttribute('disabled')).toBe(true)
  })
  it('victoria y empate se muestran distinto', () => {
    const g = mkGameView({ n: 3, status: 'FINISHED', yourTurn: false, ranking: [{ playerId: 'p0', name: 'Ana', score: 90, rank: 1, abandoned: false }, { playerId: 'p1', name: 'Beto', score: 40, rank: 2, abandoned: false }] })
    render(<ResultModal room={mkRoom(g)} busy={false} onRematch={vi.fn()} onLeave={vi.fn()} onStats={vi.fn()} onSheet={vi.fn()} />)
    expect(screen.getByText('¡VICTORIA!')).toBeTruthy()
    cleanup()
    const d = mkGameView({ n: 3, status: 'FINISHED', yourTurn: false, ranking: [{ playerId: 'p0', name: 'Ana', score: 90, rank: 1, abandoned: false }, { playerId: 'p1', name: 'Beto', score: 90, rank: 1, abandoned: false }] })
    render(<ResultModal room={mkRoom(d)} busy={false} onRematch={vi.fn()} onLeave={vi.fn()} onStats={vi.fn()} onSheet={vi.fn()} />)
    expect(screen.getByText('EMPATE')).toBeTruthy()
  })
  it('sala de espera: el anfitrión no puede empezar con menos de 3 y sí con 3 o más', () => {
    const onStart = vi.fn()
    const two = mkRoom(null)
    render(<WaitingRoom room={two} busy={false} error="" onStart={onStart} onLeave={vi.fn()} onHome={vi.fn()} />)
    expect(screen.getByText('ABC234')).toBeTruthy()
    const b = btn(/Faltan 1 jugador para empezar/) as HTMLButtonElement; expect(b.disabled).toBe(true)
    cleanup()
    render(<WaitingRoom room={mkRoom(null, { canStart: true })} busy={false} error="" onStart={onStart} onLeave={vi.fn()} onHome={vi.fn()} />)
    fireEvent.click(btn(/Empezar la partida/)); expect(onStart).toHaveBeenCalled()
  })
  it('sala de espera: quien no es anfitrión espera y no ve el botón de empezar', () => {
    render(<WaitingRoom room={mkRoom(null, { viewerId: 'p1' })} busy={false} error="" onStart={vi.fn()} onLeave={vi.fn()} onHome={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /Empezar/ })).toBeNull(); expect(screen.getByText(/Esperando al anfitrión/)).toBeTruthy()
  })
  it('menú principal: crear sala con o sin dos vueltas, reglas y unirse por código', () => {
    const onCreate = vi.fn(), onJoin = vi.fn()
    render(<Lobby me={{ id: 'x', isGuest: true, name: null, avatar: null }} name="Ana" onName={vi.fn()} inviteCode="" busy={false} error="" activeRoom={null} onCreate={onCreate} onJoin={onJoin} onResume={vi.fn()} onStats={vi.fn()} onGoogle={vi.fn()} onSignOut={vi.fn()} />)
    fireEvent.click(btn(/Crear sala privada/)); expect(onCreate).toHaveBeenLastCalledWith(false)
    fireEvent.click(screen.getByLabelText(/Dar las dos vueltas/)); fireEvent.click(btn(/Crear sala privada/))
    expect(onCreate).toHaveBeenLastCalledWith(true)
    fireEvent.change(screen.getByLabelText('Código de sala'), { target: { value: 'k7qm2x' } }); fireEvent.click(btn(/Unirme/))
    expect(onJoin).toHaveBeenCalledWith('K7QM2X')
    fireEvent.click(btn(/Reglas/)); expect(screen.getByRole('dialog', { name: /Reglas de La Podrida/ })).toBeTruthy()
  })
})
