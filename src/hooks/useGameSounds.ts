import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { RoomView } from '../../shared/types'
import { isSoundEnabled, playEvents, subscribeSound } from '../lib/sound'
import { snapOf, soundEventsFromDiff, type Snap } from '../lib/soundEvents'

export function useSoundEnabled() {
  return useSyncExternalStore(subscribeSound, isSoundEnabled, () => true)
}

/** Reproduce los sonidos que corresponden a cada cambio de la partida (propio o del rival). */
export function useGameSounds(room: RoomView | null) {
  const prev = useRef<Snap | null>(null)
  const version = room?.version
  useEffect(() => {
    const next = snapOf(room)
    if (!next) return
    playEvents(soundEventsFromDiff(prev.current, next))
    prev.current = next
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version])
}
