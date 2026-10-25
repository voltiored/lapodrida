import { useEffect, useState } from 'react'

/** Reloj que se actualiza cada `everyMs` (para cuentas atrás y "hace X s"). */
export function useNow(everyMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), everyMs)
    return () => window.clearInterval(t)
  }, [everyMs])
  return now
}
