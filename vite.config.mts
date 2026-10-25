/// <reference types="vitest/config" />
import type { IncomingMessage, ServerResponse } from 'node:http'
import react from '@vitejs/plugin-react'
import { loadEnv, type Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

/** En desarrollo sirve /api/game dentro del propio servidor de Vite con el MISMO código que ejecutará Vercel. */
function devApi(base: string): Plugin {
  return {
    name: 'podrida-dev-api',
    configureServer(server) {
      const env = loadEnv('development', process.cwd(), '')
      for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) if (env[k] && !process.env[k]) process.env[k] = env[k]
      const prefix = base.replace(/\/$/, '')
      if (prefix) server.middlewares.use((req, _res, next) => { if (req.url?.startsWith('/podrida/api/game')) req.url = req.url.slice(prefix.length); next() })
      server.middlewares.use('/api/game', async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          const raw = Buffer.concat(chunks).toString('utf8')
          const url = new URL(req.url ?? '', 'http://localhost')
          const vreq = Object.assign(req, { body: raw ? JSON.parse(raw) : undefined, query: Object.fromEntries(url.searchParams) })
          const vres: any = Object.assign(res, {
            status(code: number) { res.statusCode = code; return vres },
            json(payload: unknown) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(payload)); return vres },
          })
          const mod = await server.ssrLoadModule('/api/game.ts')
          await mod.default(vreq, vres)
        } catch (e) {
          console.error(e)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Error interno en el servidor de desarrollo.' }))
        }
      })
    },
  }
}

// Por defecto la web vive en la raíz. Para colgarla de una ruta (p. ej. /podrida/) define VITE_BASE=/podrida/ al compilar.
const base = process.env.VITE_BASE || '/'

export default defineConfig({
  base: '/podrida/',
  build: { outDir: 'dist/podrida' },
  plugins: [react(), devApi(base)],
  server: { host: '0.0.0.0', port: 5173 },
  test: { include: ['tests/**/*.test.{ts,tsx}'] },
})
