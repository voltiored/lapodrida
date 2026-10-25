import type { SupabaseClient } from '@supabase/supabase-js'
import { GameError } from '../../shared/engine'
import type { AuthUser } from './service'

/** Valida el JWT de Supabase que envía el navegador (sesión anónima o de Google). */
export async function authenticate(authorization: string | undefined, db: SupabaseClient): Promise<AuthUser> {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) throw new GameError('Falta la sesión. Recarga la página.', 401)
  const { data, error } = await db.auth.getUser(token)
  if (error || !data.user) throw new GameError('Sesión no válida. Recarga la página.', 401)
  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>
  const name = typeof meta.full_name === 'string' ? meta.full_name : typeof meta.name === 'string' ? meta.name : null
  return { id: data.user.id, name, isAnonymous: Boolean(data.user.is_anonymous) }
}
