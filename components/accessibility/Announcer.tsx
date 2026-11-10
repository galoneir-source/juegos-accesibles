// Regiones de anuncios de toda la web (lib/announce.ts).
//
// Hay DOS regiones assertive a propósito, no es un componente montado dos
// veces: announceAssertive() se va turnando entre game-announcer-0 y -1 y
// vacía la otra cada vez. Así un mismo mensaje repetido («¡Mina!» dos veces
// seguidas) se vuelve a leer, porque cae en una región distinta, y nunca
// tienen texto las dos a la vez.
export default function Announcer() {
  return (
    <>
      <div id="game-announcer-0" role="alert" aria-live="assertive" aria-atomic="true" className="sr-only" />
      <div id="game-announcer-1" role="alert" aria-live="assertive" aria-atomic="true" className="sr-only" />
      <div id="status-announcer" aria-live="polite" aria-atomic="true" className="sr-only" />
    </>
  )
}
