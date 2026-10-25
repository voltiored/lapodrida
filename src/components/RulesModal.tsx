import { useEffect } from 'react'

export function RulesModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return <div className="rules-overlay" role="dialog" aria-modal="true" aria-labelledby="rules-title" onClick={onClose}>
    <section className="rules-modal" onClick={e => e.stopPropagation()}>
      <header><h2 id="rules-title">Reglas de La Podrida</h2><button className="rules-x" onClick={onClose} aria-label="Cerrar reglas">×</button></header>
      <div className="rules-body">
        <h3>Idea del juego</h3>
        <p>No gana quien hace más bazas, sino quien <b>acierta exactamente</b> cuántas va a ganar en cada mano. Se juega de 3 a 6 personas con la baraja francesa (52 cartas, sin comodines).</p>
        <p>Orden de las cartas, de mayor a menor: A, K, Q, J, 10, 9, 8, 7, 6, 5, 4, 3, 2.</p>

        <h3>Las manos</h3>
        <ul>
          <li>La primera mano reparte todas las cartas posibles: 52 ÷ jugadores (17 con 3, 13 con 4, 10 con 5, 8 con 6).</li>
          <li>En cada mano siguiente se reparte una carta menos, hasta llegar a 1.</li>
          <li>Si al crear la sala se marcó <b>dos vueltas</b>, después vuelve a subir de una en una hasta el máximo.</li>
          <li>El que reparte cambia en cada mano. Sale en cada baza el ganador de la anterior; en la primera, el jugador a continuación del que repartió.</li>
        </ul>

        <h3>El triunfo</h3>
        <p>Tras repartir se descubre la última carta del mazo sobrante: su palo es el <b>triunfo</b>, que gana a los demás palos. Si se han repartido todas las cartas (4 jugadores, mano máxima) el triunfo es <b>aleatorio</b> y se avisa.</p>

        <h3>Cantar las bazas</h3>
        <ul>
          <li>Cada jugador dice cuántas bazas cree que ganará, por turnos. El que reparte canta el último.</li>
          <li><b>Regla de oro:</b> el último no puede decir un número que haga que la suma de todas las apuestas sea igual al número de bazas de la mano. Así siempre alguien falla: «se pudre».</li>
        </ul>

        <h3>Jugar cada baza</h3>
        <ul>
          <li>Hay que <b>asistir al palo</b> de salida. Si no tienes ese palo, debes jugar <b>triunfo</b> si tienes. Si tampoco, cualquier carta (no valdrá nada).</li>
          <li>La baza la gana el triunfo más alto o, si nadie jugó triunfo, la carta más alta del palo de salida.</li>
          <li>Para jugar una carta: tócala para elegirla y tócala otra vez para tirarla.</li>
        </ul>

        <h3>Puntos de cada mano</h3>
        <ul>
          <li><b>Aciertas</b> tu apuesta: 10 puntos + 3 por cada baza ganada.</li>
          <li><b>Fallas</b> (de más o de menos): no hay los 10 puntos y pierdes 3 por cada baza de diferencia.</li>
        </ul>

        <h3>Final y abandonos</h3>
        <ul>
          <li>Gana quien suma más puntos tras todas las manos. Si hay empate arriba, es empate.</li>
          <li>Si abandonas (o desapareces más de 3 minutos), juega por ti el piloto automático hasta el final y quedas último. Si solo queda una persona, gana.</li>
          <li>Al terminar, los que siguen en la sala pueden pedir <b>revancha</b>.</li>
        </ul>
      </div>
      <div className="rules-foot"><button className="primary" onClick={onClose}>Entendido</button></div>
    </section>
  </div>
}
