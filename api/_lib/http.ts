import type { IncomingMessage, ServerResponse } from 'node:http'

// Tipos mínimos de la petición/respuesta que Vercel entrega a las funciones (sustituyen a @vercel/node, que solo aportaba tipos).
export interface ApiRequest extends IncomingMessage {
  query: Record<string, string | string[] | undefined>
  body: unknown
}
export interface ApiResponse extends ServerResponse {
  status(code: number): ApiResponse
  json(body: unknown): ApiResponse
}
