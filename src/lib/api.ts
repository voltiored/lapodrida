import type { RoomView } from '../../shared/types'
import { supabase } from './supabase'

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

async function call(init: { method: 'GET' | 'POST'; query?: string; body?: object }): Promise<RoomView> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  let res: Response
  try {
    res = await fetch(`${import.meta.env.BASE_URL}api/game${init.query ?? ''}`, {
      method: init.method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
    })
  } catch {
    throw new ApiError('Sin conexión con el servidor.', 0)
  }
  let payload: any = null
  try { payload = await res.json() } catch { /* respuesta sin JSON */ }
  if (!res.ok) throw new ApiError(payload?.error ?? `Error ${res.status}`, res.status)
  return payload as RoomView
}

const post = (body: object) => call({ method: 'POST', body })

export const api = {
  view: (code: string) => call({ method: 'GET', query: `?code=${encodeURIComponent(code)}` }),
  create: (name: string, options: { doubleLap: boolean }) => post({ action: 'create', name, options }),
  join: (code: string, name: string) => post({ action: 'join', code, name }),
  start: (code: string) => post({ action: 'start', code }),
  bid: (code: string, value: number) => post({ action: 'bid', code, value }),
  play: (code: string, cardId: string) => post({ action: 'play', code, cardId }),
  abandon: (code: string) => post({ action: 'abandon', code }),
  rematch: (code: string) => post({ action: 'rematch', code }),
  leave: (code: string) => post({ action: 'leave', code }),
}
