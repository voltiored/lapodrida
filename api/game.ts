import { GameError } from '../shared/engine'
import { authenticate } from './_lib/auth'
import type { ApiRequest, ApiResponse } from './_lib/http'
import { realtimeNotifier } from './_lib/realtime'
import { RoomService } from './_lib/service'
import { SupabaseStore, adminClient } from './_lib/store'

// Un único endpoint:  GET /api/game?code=ABC123  → vista del jugador
//                     POST /api/game {action, code?, ...}  → ejecuta una acción y devuelve la vista actualizada
export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const db = adminClient()
    const user = await authenticate(req.headers.authorization, db)
    const svc = new RoomService(new SupabaseStore(db), { notify: realtimeNotifier() })

    if (req.method === 'GET') return res.status(200).json(await svc.view(user, first(req.query.code)))
    if (req.method !== 'POST') throw new GameError('Método no permitido.', 400)

    const b = parseBody(req.body)
    switch (b.action) {
      case 'create': return res.status(200).json(await svc.create(user, b.name, b.options))
      case 'join': return res.status(200).json(await svc.join(user, b.code, b.name))
      case 'start': return res.status(200).json(await svc.start(user, b.code))
      case 'bid': return res.status(200).json(await svc.bid(user, b.code, b.value))
      case 'play': return res.status(200).json(await svc.play(user, b.code, b.cardId))
      case 'abandon': return res.status(200).json(await svc.abandon(user, b.code))
      case 'rematch': return res.status(200).json(await svc.rematch(user, b.code))
      case 'leave': return res.status(200).json(await svc.leave(user, b.code))
      default: throw new GameError('Acción desconocida.', 400)
    }
  } catch (e) {
    if (e instanceof GameError) return res.status(e.status).json({ error: e.message })
    console.error(e)
    return res.status(500).json({ error: 'Error interno del servidor.' })
  }
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
function parseBody(body: unknown): Record<string, any> {
  if (typeof body === 'string') {
    try { return JSON.parse(body) } catch { throw new GameError('Petición no válida.', 400) }
  }
  return body && typeof body === 'object' ? (body as Record<string, any>) : {}
}
