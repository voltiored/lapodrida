# La Podrida · online

Pocha / Oh Hell para **3 a 6 jugadores**, con la misma estética y arquitectura que el Crapé. **Todo gratis**: Vercel (web + servidor) + Supabase (base de datos, login con Google, tiempo real) + tu dominio.

```
Navegador (React) ──► /api/game (Vercel Function: motor del juego, el único que ve las manos) ──► Supabase Postgres
       ▲                                                                                              │
       └────────── Supabase Realtime: aviso "algo cambió" (sin datos de la partida) ◄─────────────────┘
```

- El **servidor decide todo** (turnos, reglas, quién ve qué). Cada navegador recibe solo *su* vista: nunca las manos de los demás.
- Reglas implementadas tal como las diste (ver el botón **Reglas** dentro de la app).

## Qué incluye
| | |
|---|---|
| Salas | Sala privada con código de 6 caracteres + enlace de invitación; casilla «dar las dos vueltas»; el anfitrión empieza con 3 a 6 jugadores |
| Partida | Reparto, triunfo (aleatorio y avisado si se reparten todas las cartas), canto con regla de oro, asistir al palo / triunfo obligado, puntuación, tabla de puntos por mano |
| Conexión | Reconexión automática, la partida se conserva, desconectados visibles; si alguien desaparece 3 min (o abandona) pasa a **piloto automático** y queda último; si solo queda uno, gana |
| Fin | Clasificación, empates, **revancha** cuando la piden todos los que siguen en la sala (mínimo 3) |
| Cuentas | Invitado o Google; historial, victorias/derrotas/empates/abandonos, % de victorias, rachas, mejor puntuación, estadísticas frente a cada jugador |
| Sonido | Barajar/repartir, carta jugada, baza recogida, tu turno y victoria (sintetizados, sin archivos). Se silencia desde el menú ⋯ |
| Móvil | Una sola pantalla sin scroll, cartas grandes (mano en 1, 2 o 3 filas), instalable en la pantalla de inicio |

## Probar en tu ordenador (opcional)
```bash
npm install
cp .env.example .env.local     # rellénalo con las claves de Supabase
npm run dev                    # http://localhost:5173 (incluye la API)
npm test                       # 86 tests
# Vista previa de la mesa con datos de ejemplo (sin Supabase):
#   http://localhost:5173/board-preview.html   (?n=3..6  ?fase=canto|juego|fin  ?cartas=1..17  ?turno=otro  ?away=1  ?error=1  ?random=1  ?vista=lobby|espera)
```

## Puesta en marcha (≈15 min si ya hiciste el Crapé)

### 1. Supabase
**Puedes reutilizar el mismo proyecto que el Crapé** (las tablas se llaman `podrida_…` y no chocan; el login de Google/invitados ya está hecho). Si prefieres uno nuevo, repite los pasos del README del Crapé (anonymous sign-ins + Google).
1. **SQL Editor** → pega todo `supabase/schema.sql` → Run.
2. **Authentication → URL Configuration → Redirect URLs**: añade la dirección donde vivirá la Podrida (por ejemplo `https://podrida.tudominio.com` y `http://localhost:5173`).
3. Copia las claves en **Project Settings → API** (las mismas del Crapé si reutilizas proyecto).

### 2. Vercel
1. Sube esta carpeta a **un repositorio nuevo de GitHub** (por ejemplo `podrida-online`).
2. Vercel → Add New → Project → importa el repo (detecta Vite solo).
3. **Environment Variables**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` → Deploy.
4. **Settings → Domains**: añade un subdominio de tu dominio (p. ej. `podrida.tudominio.com`); Vercel te da el registro DNS (CNAME) que debes crear.

> Si prefieres colgarla de una ruta de tu web (como `/crape/`), define `VITE_BASE=/podrida/` y dime cómo está montado tu portfolio: lo adapto igual que hicimos con el Crapé.

### 3. Comprobación
1. Abre la web en el móvil y en el ordenador (o ventana de incógnito).
2. Uno crea la sala, comparte el enlace; los demás entran con el código. Con 3 o más, el anfitrión pulsa **Empezar**.
3. Canta, juega una baza y comprueba que todos ven las cartas al instante. Cierra una pestaña y vuelve a abrirla: la partida sigue.
4. Termina o abandona una partida y mira **Mis estadísticas**.

Si el juego funciona pero con ~10 s de retraso, el tiempo real no llega: revisa en Supabase *Realtime → Settings* que Broadcast público esté permitido (el sondeo cada 10 s lo cubre mientras tanto).

## Límites del plan gratuito
- **Supabase pausa el proyecto tras 1 semana sin actividad** (se restaura con un clic y no pierdes datos).
- Vercel Hobby es para uso personal/no comercial.

## Ajustes
`api/_lib/service.ts`: `ABANDON_AFTER_MS` (3 min hasta pasar a piloto automático). `shared/types.ts`: `CONNECTED_WINDOW_MS` (25 s para mostrar «desconectado»).

## Decisiones de reglas que conviene revisar
- **Quién empieza a cantar y a jugar:** el jugador a continuación del que reparte (tu «a la derecha del que repartió»), y el que reparte canta el último. El que reparte rota cada mano; el primero se sortea.
- **Fallar se puntúa solo con la resta** (−3 por baza de diferencia, sin sumar las bazas ganadas), tal como lo escribiste.
- **Empate arriba:** se muestra como empate (no hay desempate).
- **Piloto automático:** canta según cartas altas y juega siempre la carta legal más baja.
- No hay obligación de superar la carta ganadora al asistir al palo (solo asistir al palo / triunfo).
