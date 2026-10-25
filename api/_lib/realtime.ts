// Aviso "algo cambió" por Supabase Realtime (Broadcast vía REST). El payload solo lleva la versión: nunca datos de la partida.
// Cada cliente, al recibirlo, vuelve a pedir SU vista a /api/game. Si el aviso falla, el sondeo del cliente lo cubre.
export function realtimeNotifier() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return async (code: string, version: number): Promise<void> => {
    if (!url || !key) return
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 1500)
    try {
      await fetch(`${url}/realtime/v1/api/broadcast`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ topic: `podrida-room:${code}`, event: 'tick', payload: { v: version }, private: false }] }),
        signal: ctrl.signal,
      })
    } finally {
      clearTimeout(timer)
    }
  }
}
