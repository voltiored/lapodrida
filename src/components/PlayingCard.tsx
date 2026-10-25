import type { Card } from '../../shared/types'
import { SUIT_NAME, SUIT_SYMBOL, rankLabel } from '../../shared/types'

export const cardName = (c: Card) => `${rankLabel(c.rank)} de ${SUIT_NAME[c.suit]}`
export const isRed = (suit: string) => suit === 'H' || suit === 'D'

/** Carta minimalista (número y palo), igual que en el Crapé. */
export function CardFace({ card, selected = false, dim = false, win = false, hot = false }: { card: Card; selected?: boolean; dim?: boolean; win?: boolean; hot?: boolean }) {
  const rank = rankLabel(card.rank)
  const suit = SUIT_SYMBOL[card.suit]
  return <span className={`pc ${isRed(card.suit) ? 'red' : ''} ${selected ? 'sel' : ''} ${dim ? 'dim' : ''} ${win ? 'win' : ''} ${hot ? 'hot' : ''}`} aria-label={cardName(card)}>
    <span className="pc-idx">{rank}{suit}</span>
    <span className="pc-rank">{rank}</span>
    <span className="pc-suit">{suit}</span>
  </span>
}

export function CardButton({ card, onClick, disabled, ...rest }: { card: Card; onClick?: () => void; disabled?: boolean; selected?: boolean; dim?: boolean; hot?: boolean }) {
  return <button type="button" className="pd-cardbtn" onClick={onClick} disabled={disabled || !onClick} aria-label={cardName(card)}><CardFace card={card} {...rest} /></button>
}

export function SuitBadge({ suit, size = 'md' }: { suit: Card['suit']; size?: 'md' | 'lg' }) {
  return <span className={`pd-suit ${isRed(suit) ? 'red' : ''} ${size}`} aria-label={SUIT_NAME[suit]}>{SUIT_SYMBOL[suit]}</span>
}
