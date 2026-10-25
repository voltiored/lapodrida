import { useEffect, useMemo, useRef, useState } from 'react'
import { CONNECTED_WINDOW_MS, SUIT_NAME, type Card, type CompletedTrick, type GameView, type RoomView, type RoundResult, type SeatView } from '../../shared/types'
import { setSoundEnabled, unlockAudio, playSound } from '../lib/sound'
import { useGameSounds, useSoundEnabled } from '../hooks/useGameSounds'
import { CardButton, CardFace, SuitBadge, cardName } from './PlayingCard'
import { RulesModal } from './RulesModal'
import { ScoreSheet } from './ScoreSheet'

export interface TableProps {
  room: RoomView
  game: GameView
  busy: boolean
  error: string
  offline: boolean
  realtimeOk: boolean
  nowMs: number
  fetchedAt: number
  onClearError: () => void
  onBid: (value: number) => void
  onPlay: (cardId: string) => void
  onAbandon: () => void
  onHome: () => void
}

const REVEAL_MS = 1600
const TOAST_MS = 7000

/** Hasta 5 cartas en una fila; con más se parten en dos filas (solapadas si son muchas) para que se vean grandes y quepan en el móvil. */
function Hand({ cards, legal, selectedId, locked, playing, onTap }: { cards: Card[]; legal: Set<string>; selectedId: string | null; locked: boolean; playing: boolean; onTap: (c: Card) => void }) {
  const nRows = cards.length <= 5 ? 1 : cards.length <= 12 ? 2 : 3
  const perRow = Math.max(1, Math.ceil(cards.length / nRows))
  const rows: Card[][] = []
  for (let i = 0; i < cards.length; i += perRow) rows.push(cards.slice(i, i + perRow))
  const overlap = perRow <= 5 ? 0 : 0.1 + (perRow - 5) * 0.075
  const rowOv = nRows > 1 && (overlap > 0 || nRows === 3) ? 0.82 : 0 // filas montadas unas sobre otras cuando hay muchas cartas
  const hf = 1.6 + (nRows - 1) * (rowOv ? 0.58 : 1.45) // altura de la mano en "anchos de carta"
  return <div className="pd-hand" style={{ '--perrow': perRow, '--overlap': overlap, '--rowov': rowOv, '--hf': hf } as React.CSSProperties}>
    {rows.map((row, ri) => <div className="pd-row" key={ri}>
      {row.map(c => {
        const ok = !playing || legal.has(c.id)
        return <CardButton key={c.id} card={c} selected={selectedId === c.id} dim={playing && !ok} hot={playing && ok} disabled={locked || !playing || !ok} onClick={() => onTap(c)} />
      })}
    </div>)}
  </div>
}

function Seat({ seat, turn, connected, leftName }: { seat: SeatView; turn: boolean; connected: boolean; leftName?: boolean }) {
  return <div className={`pd-seat ${turn ? 'turn' : ''} ${seat.abandoned ? 'gone' : ''}`} title={seat.name}>
    <div className="pd-seat-top"><i className={`bd-dot ${connected || seat.auto ? '' : 'off'}`} /><b>{seat.name}</b>{seat.isDealer && <span className="pd-d" title="Reparte">R</span>}</div>
    <div className="pd-seat-mid">
      <span className="pd-bidchip" title="bazas ganadas / apostadas">{seat.bid === null ? '—' : `${seat.tricks}/${seat.bid}`}</span>
      <span className="pd-pts">{seat.score} pts</span>
    </div>
    <small>{seat.abandoned ? (leftName ? 'se fue' : 'piloto auto.') : `${seat.handCount} carta${seat.handCount === 1 ? '' : 's'}`}</small>
  </div>
}

export function Table(p: TableProps) {
  const { room, game, busy, error, offline } = p
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const [rules, setRules] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [copied, setCopied] = useState(false)
  const [reveal, setReveal] = useState<CompletedTrick | null>(null)
  const [toast, setToast] = useState<RoundResult | null>(null)
  const soundOn = useSoundEnabled()
  useGameSounds(room)

  // La baza recién terminada se muestra un instante; al terminar una mano aparece un resumen.
  const seenSeq = useRef(game.lastTrick?.seq ?? 0)
  const seenRounds = useRef(game.history.length)
  useEffect(() => {
    const seq = game.lastTrick?.seq ?? 0
    if (seq !== seenSeq.current) {
      seenSeq.current = seq
      if (game.lastTrick) { setReveal(game.lastTrick); const t = window.setTimeout(() => setReveal(null), REVEAL_MS); return () => window.clearTimeout(t) }
    }
  }, [game.lastTrick?.seq]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (game.history.length > seenRounds.current && game.status === 'IN_PROGRESS') {
      setToast(game.history[game.history.length - 1])
      const t = window.setTimeout(() => setToast(null), TOAST_MS)
      seenRounds.current = game.history.length
      return () => window.clearTimeout(t)
    }
    seenRounds.current = game.history.length
  }, [game.history.length]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (selectedId && !game.hand.some(c => c.id === selectedId)) setSelectedId(null) }, [game.hand, selectedId])

  const finished = game.status === 'FINISHED'
  const meSeat = game.seats.find(s => s.id === game.viewerId)!
  const myIndex = game.seats.indexOf(meSeat)
  const others = useMemo(() => [...game.seats.slice(myIndex + 1), ...game.seats.slice(0, myIndex)], [game.seats, myIndex])
  const turnSeat = game.seats.find(s => s.id === game.turnPlayerId)!
  const bidding = game.phase === 'BIDDING'
  const playing = !finished && !bidding && game.yourTurn
  const locked = busy || offline || Boolean(reveal)
  const legal = useMemo(() => new Set(game.legalCardIds), [game.legalCardIds])
  const connectedOf = (id: string) => {
    const pl = room.players.find(x => x.id === id)
    if (!pl || pl.id === game.viewerId) return true
    return pl.connected && pl.awayMs + Math.max(0, p.nowMs - p.fetchedAt) <= CONNECTED_WINDOW_MS
  }
  const absent = others.filter(s => !s.abandoned && !connectedOf(s.id))

  function tapCard(c: Card) {
    if (!playing || locked) return
    p.onClearError()
    if (selectedId === c.id) { setSelectedId(null); p.onPlay(c.id) }
    else { setSelectedId(c.id); unlockAudio(); playSound('tick') }
  }

  // ---- baza en curso (o la recién terminada) ordenada según el orden de salida
  const shownPlays = reveal ? reveal.plays : game.trick
  const order = useMemo(() => {
    const leaderId = shownPlays[0]?.playerId ?? game.turnPlayerId
    const li = game.seats.findIndex(s => s.id === leaderId)
    return [...game.seats.slice(li), ...game.seats.slice(0, li)]
  }, [game.seats, shownPlays, game.turnPlayerId])
  const nameOf = (id: string) => game.seats.find(s => s.id === id)?.name ?? '?'

  // ---- una sola franja de avisos, por orden de importancia
  let strip: { kind: 'err' | 'info' | 'warn' | 'hint'; text: string; close?: boolean }
  if (error) strip = { kind: 'err', text: error, close: true }
  else if (offline) strip = { kind: 'warn', text: 'Sin conexión. Tu partida está a salvo; se reanuda sola.' }
  else if (meSeat.abandoned && !finished) strip = { kind: 'warn', text: 'Has salido de la partida: juega por ti el piloto automático.' }
  else if (absent.length && !finished) strip = { kind: 'warn', text: `${absent.map(a => a.name).join(', ')} desconectado${absent.length > 1 ? 's' : ''} · la partida sigue guardada` }
  else if (game.randomTrump && bidding && !finished) strip = { kind: 'info', text: `🎲 El triunfo de esta mano ha sido aleatorio: ${SUIT_NAME[game.trump]}` }
  else if (finished) strip = { kind: 'hint', text: 'Partida terminada' }
  else if (bidding) strip = { kind: 'hint', text: game.yourTurn ? '¿Cuántas bazas vas a ganar?' : `Canta ${turnSeat.name}…` }
  else if (game.yourTurn) strip = { kind: 'hint', text: selectedId ? `Toca otra vez ${cardName(game.hand.find(c => c.id === selectedId)!)} para jugarla` : 'Tu turno: elige una carta' }
  else strip = { kind: 'hint', text: `Juega ${turnSeat.name}…` }

  const pill = finished ? 'Terminada' : bidding ? (game.yourTurn ? 'Tu apuesta' : `Canta ${turnSeat.name}`) : game.yourTurn ? 'Tu turno' : `Turno de ${turnSeat.name}`
  const cardsWord = game.cardsThisRound === 1 ? 'carta' : 'cartas'
  const bidOptions = Array.from({ length: game.cardsThisRound + 1 }, (_, i) => i)

  return <main className={`bd pd ${!game.yourTurn && !finished ? 'bd--wait' : ''}`}>
    <header className="bd-bar">
      <button className="bd-icon" onClick={p.onHome} aria-label="Volver al inicio">←</button>
      <div className={`bd-pill ${game.yourTurn && !finished ? 'mine' : ''}`}>{pill}</div>
      <button className="bd-code" onClick={() => { void navigator.clipboard?.writeText(room.roomCode); setCopied(true); window.setTimeout(() => setCopied(false), 1500) }} aria-label="Copiar código de sala">{copied ? 'Copiado' : room.roomCode}</button>
      <button className="bd-icon" onClick={() => setMenu(m => !m)} aria-label="Más opciones" aria-expanded={menu}>⋯</button>
    </header>
    {menu && <>
      <div className="bd-scrim" onClick={() => setMenu(false)} />
      <div className="bd-menu" role="menu">
        <button onClick={() => { setMenu(false); setSheet(true) }}>📋 Puntuación</button>
        <button onClick={() => { setMenu(false); setRules(true) }}>📖 Reglas</button>
        <button onClick={() => { setSoundEnabled(!soundOn) }}>{soundOn ? '🔊 Sonido: activado' : '🔇 Sonido: desactivado'}</button>
        <button className="danger" disabled={busy || finished} onClick={() => { setMenu(false); if (window.confirm('¿Seguro que quieres abandonar? Jugará por ti el piloto automático y quedarás último.')) p.onAbandon() }}>🏳 Abandonar</button>
      </div>
    </>}

    <div className={`bd-strip ${strip.kind}`} role={strip.kind === 'err' ? 'alert' : 'status'}><span>{strip.text}</span>{strip.close && <button onClick={p.onClearError} aria-label="Cerrar">×</button>}</div>

    <section className="pd-seats" aria-label="Rivales" style={{ '--cols': Math.min(others.length, 3) } as React.CSSProperties}>
      {others.map(s => <Seat key={s.id} seat={s} turn={!finished && s.id === game.turnPlayerId} connected={connectedOf(s.id)} leftName={room.players.find(x => x.id === s.id)?.left} />)}
    </section>

    <section className="pd-info" aria-label="Mano">
      <span className="pd-round">Mano <b>{game.round}</b>/{game.totalRounds} · {game.cardsThisRound} {cardsWord}</span>
      <span className="pd-trump" title={`Triunfo: ${SUIT_NAME[game.trump]}`}>
        Triunfo <SuitBadge suit={game.trump} />
        {game.randomTrump ? <em>aleatorio</em> : game.trumpCard && <span className="pd-trumpcard"><CardFace card={game.trumpCard} /></span>}
      </span>
    </section>

    <section className="pd-trick" aria-label="Mesa" style={{ '--n': game.seats.length } as React.CSSProperties}>
      {bidding && !finished
        ? <div className="pd-bidding">
            {game.seats.map(s => <span key={s.id} className={`pd-bubble ${s.id === game.turnPlayerId ? 'turn' : ''}`}><small>{s.name}</small><b>{s.bid === null ? '…' : s.bid}</b></span>)}
          </div>
        : order.map(s => {
            const play = shownPlays.find(x => x.playerId === s.id)
            const winner = reveal?.winnerId === s.id
            return <div key={s.id} className={`pd-slot ${winner ? 'winner' : ''} ${!reveal && !play && s.id === game.turnPlayerId ? 'next' : ''}`}>
              {play ? <CardFace card={play.card} win={winner} /> : <span className="pc-slot" />}
              <small>{s.id === game.viewerId ? 'Tú' : s.name}</small>
            </div>
          })}
      {reveal && <div className="pd-reveal">Gana <b>{nameOf(reveal.winnerId)}</b></div>}
    </section>

    <section className="pd-me" aria-label="Tu resumen">
      <span className="name"><b>Tú</b>{meSeat.isDealer && <span className="pd-d" title="Reparte">R</span>}</span>
      <span className="pd-bidchip big" title="bazas ganadas / apostadas">{meSeat.bid === null ? 'sin apuesta' : `${meSeat.tricks} de ${meSeat.bid} bazas`}</span>
      <span className="pd-pts">{meSeat.score} pts</span>
      <button className="pd-link" onClick={() => setSheet(true)}>Puntos</button>
    </section>

    {bidding && !finished && game.yourTurn && <section className="pd-bid" aria-label="Tu apuesta">
      <div className="pd-bid-grid">
        {bidOptions.map(v => <button key={v} className={`pd-bidbtn ${v === game.forbiddenBid ? 'forbidden' : ''}`} disabled={busy || offline || v === game.forbiddenBid} onClick={() => { p.onClearError(); p.onBid(v) }} aria-label={`Apostar ${v}`}>{v}</button>)}
      </div>
      {game.forbiddenBid !== null && <small>Eres el último en cantar: no puedes decir <b>{game.forbiddenBid}</b> (si no, nadie perdería).</small>}
    </section>}

    <Hand cards={game.hand} legal={legal} selectedId={selectedId} locked={locked} playing={playing} onTap={tapCard} />

    {toast && <button className="pd-toast" onClick={() => setToast(null)} aria-label="Cerrar resumen">
      <b>Mano {toast.round} · resultados</b>
      {[...toast.results].sort((a, b) => b.points - a.points).map(r => <span key={r.playerId} className={r.bid === r.won ? 'ok' : 'ko'}>{nameOf(r.playerId)}: {r.won}/{r.bid} <i>{r.points > 0 ? '+' : ''}{r.points}</i></span>)}
    </button>}
    {rules && <RulesModal onClose={() => setRules(false)} />}
    {sheet && <ScoreSheet game={game} onClose={() => setSheet(false)} />}
  </main>
}
