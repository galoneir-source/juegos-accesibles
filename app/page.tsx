import Link from 'next/link'
import { auth, signOut } from '@/lib/auth'

const GAMES = [
{ id: 'hangman', href: '/hangman', label: 'Ahorcado', desc: 'Adivina la palabra secreta letra a letra usando el teclado.' },
{ id: 'memory-sonidos', href: '/memory-sonidos', label: 'Memory de Sonidos', desc: 'Escucha la secuencia de sonidos y repítela en el mismo orden.' },
  { id: 'aventura-texto', href: '/aventura-texto', label: 'Aventura de Texto', desc: 'Explora un mundo con comandos de texto como ir norte, tomar objeto.' },
  { id: 'casa-encantada', href: '/casa-encantada', label: 'Casa Encantada', desc: 'Aventura de texto de terror. Explora la Mansión Voss, cuida tu vida y tu cordura, y derrota al Espectro del Amo para escapar.' },
  { id: 'aventura-espacio', href: '/aventura-espacio', label: 'Aventura Espacial', desc: 'Explora la estación espacial UES Kronos con comandos de texto. Descubre qué le ocurrió a la tripulación y destruye al Vórtex Primario.' },
  { id: 'breakout', href: '/games/breakout.html', label: 'Breakout', desc: 'Rompe todos los bloques con la paleta. Usa las flechas para moverte y Espacio para lanzar.' },
  { id: 'rpg', href: '/games/rpg/index.html', label: 'Mazmorra Oscura', desc: 'RPG medieval accesible. Explora mazmorras con WASD, ataca con Espacio e interactúa con E.' },
  { id: 'mastermind', href: '/mastermind', label: 'Mastermind de Números', desc: 'Adivina el número secreto de 4 dígitos. Recibirás pistas: toros (posición correcta) y vacas (dígito correcto, posición incorrecta).' },
  { id: 'wordle', href: '/wordle', label: 'Wordle', desc: 'Adivina la palabra de 5 letras en 6 intentos. Verde = posición correcta, amarillo = letra presente, gris = letra ausente.' },
  { id: 'mates-rapidas', href: '/mates-rapidas', label: 'Matemáticas Rápidas', desc: 'Responde operaciones aritméticas antes de que se agote el tiempo. Elige entre tres niveles de dificultad.' },
  { id: 'laberinto-audio', href: '/laberinto-audio', label: 'Laberinto de Audio', desc: 'Navega un laberinto guiándote solo por el sonido. La brújula de audio indica dirección y distancia a la salida. Usa las flechas o WASD para moverte.' },
  { id: 'anagramas', href: '/anagramas', label: 'Anagramas', desc: 'Se muestra una palabra con las letras desordenadas. Escribe la palabra original antes de que se agote el tiempo. Pide pistas si necesitas ayuda.' },
  { id: 'blackjack', href: '/blackjack', label: 'Blackjack', desc: 'Juego de cartas contra el dealer. Llega a 21 o acércate más que él sin pasarte. Teclas P, S y D para jugar.' },
  { id: 'pong-audio', href: '/pong-audio', label: 'Pong de Audio', desc: 'Pong totalmente accesible por sonido. La posición de la pelota se indica con sonido estéreo y tono. Usa las flechas o W S para mover tu paleta.' },
  { id: 'batalla-naval', href: '/batalla-naval', label: 'Batalla Naval', desc: 'Hunde la flota enemiga disparando en un tablero de 10×10. Coloca tus barcos con el teclado y recibe feedback sonoro: explosión para impactos, chapoteo para fallos.' },
  { id: 'penaltis', href: '/penaltis', label: 'Penaltis', desc: 'Tanda de 5 penaltis. Elige izquierda, centro o derecha para disparar o defender. El portero rival se adapta a tu historial de tiros.' },
  { id: 'tres-en-raya', href: '/tres-en-raya', label: 'Tres en Raya', desc: 'Juega al tres en raya contra la IA. Mueve el cursor con las flechas y coloca tu marca con Enter. La IA juega de forma óptima.' },
  { id: 'gorillas', href: '/gorillas', label: 'Gorilas', desc: 'El clásico Gorillas.bas. Introduce el ángulo y la velocidad para lanzar un plátano explosivo al gorila enemigo. El viento complica la puntería. Partida al mejor de 3 rondas.' },
  { id: 'misterio', href: '/misterio', label: 'Detective: El Caso Blackwood', desc: 'Juego de misterio detectivesco. Lord Blackwood ha sido hallado muerto envenenado. Interroga a los cinco sospechosos, examina la escena del crimen y acusa al culpable.' },
  { id: 'secuencias', href: '/secuencias', label: 'Secuencias', desc: 'Puente de plataformas de cristal. Escucha los tonos antes de saltar: agudo = seguro, grave = peligroso. Memoriza la secuencia y cruza el puente. 3 dificultades: 5, 8 o 12 saltos.' },
  { id: 'conecta4', href: '/conecta-cuatro', label: 'Conecta 4', desc: 'Coloca fichas amarillas para conectar 4 en línea (horizontal, vertical o diagonal) antes que la IA. Usa las flechas para mover entre columnas y Enter para soltar la ficha.' },
  { id: 'generala', href: '/generala', label: 'Generala', desc: '13 turnos, 5 dados, hasta 3 tiradas por turno. Rellena categorías como Escalera, Full, Póker o Generala para acumular la mayor puntuación posible. R para tirar, 1-5 para guardar dados, ↑↓ y Enter para anotar.' },
  { id: '2048', href: '/2048', label: '2048', desc: 'Desliza las fichas numéricas con las flechas para fusionarlas. Cuando dos fichas iguales chocan se combinan en una sola. Llega a la ficha 2048.' },
  { id: 'bingo', href: '/bingo', label: 'Bingo', desc: 'Cartón de 5×5 con números del 1 al 75. Las bolas se cantan con su letra (B, I, N, G, O) y los números de tu cartón se marcan solos. Pulsa Espacio para pedir cada bola. Gana con una línea o el Bingo completo.' },
  { id: 'aventura-magica', href: '/aventura-magica', label: 'El Cristal Eterno', desc: 'Aventura medieval fantástica. El Dragón de las Sombras ha destruido el Cristal Eterno. Recorre el reino de Eloria, reúne los 3 Fragmentos y derrota al Dragón. Elige entre Paladín, Hechicera o Ladrón.' },
  { id: 'pirata', href: '/pirata', label: 'El Tesoro del Corsario Negro', desc: 'Aventura pirata de texto. Explora 49 zonas de la Isla Maldita, recoge tesoros y derrota al Corsario Negro para quedarte con el Gran Tesoro. Elige entre Capitán, Bruja del Mar o Navegante.' },
  { id: 'egipto', href: '/egipto', label: 'La Maldición del Faraón', desc: 'Aventura de texto en el antiguo Egipto. Explora 49 cámaras de la tumba de Amenhotep III, esquiva trampas y derrota al espíritu inmortal del faraón. Elige entre Arqueóloga, Sacerdote de Ra o Ladrón de tumbas.' },
  { id: 'samurai', href: '/samurai', label: 'El Honor del Samurái', desc: 'Aventura de texto en el Japón feudal. Explora 49 estancias del castillo Kurogane, derrota al Shogun usurpador y restaura el honor del feudo. Elige entre Samurái, Ninja o Monje guerrero.' },
  { id: 'vikingos', href: '/vikingos', label: 'La Furia del Jarl', desc: 'Aventura de texto en el norte vikingo. Explora 49 salas del fortín Haraldur, derrota al Jarl Oscuro y libera al clan de la maldición de Loki. Elige entre Guerrero Vikingo, Escaldo o Berserker.' },
  { id: 'abismo', href: '/abismo', label: 'Las Ruinas del Abismo', desc: 'Aventura de texto en las profundidades oceánicas. Explora 49 zonas de unas ruinas sumergidas, descubre sus secretos y derrota al Leviatán del Abismo. Elige entre Comandante, Bióloga Marina o Explorador de Profundidades.' },
  { id: 'zona', href: '/zona', label: 'La Zona Muerta', desc: 'Aventura de texto postapocalíptica. Explora 49 zonas del páramo devastado, sobrevive a raiders y mutantes, y derrota al Señor de la Zona. Elige entre Soldado, Médica de Campo o Saqueador.' },
  { id: 'castillo', href: '/castillo', label: 'La Maldición del Conde', desc: 'Aventura de texto de terror gótico. Explora 49 estancias del castillo maldito del Conde Vordrak, descubre sus secretos y exorciza a su espíritu inmortal. Elige entre Cazador de Vampiros, Médium o Alquimista.' },
  { id: 'corp', href: '/corp', label: 'Protocolo Omega', desc: 'Aventura de texto cyberpunk. Explora 49 sectores de la Torre Nexus, neutraliza sus defensas y derrota al Director antes de que active el Protocolo Omega. Elige entre Mercenario, Netrunner o Espía Corporativo.' },
  { id: 'space-invaders', href: '/space-invaders', label: 'Space Invaders', desc: 'Defiende la Tierra de 40 alienígenas en 4 filas. Mueve tu nave con las flechas o A D y dispara con Espacio. La marcha de los aliens suena en estéreo: izquierda o derecha según su posición. Tecla E para ubicarlos en cualquier momento. Modo práctica sin disparos enemigos, y 3 niveles reales con 3 vidas.' },
  { id: 'tetris', href: '/tetris', label: 'Tetris', desc: 'Las piezas caen desde arriba: muévelas con las flechas, rota con ↑ o X, caída instantánea con Espacio. Completa líneas para eliminarlas. Sonido distintivo al rotar, colocar y limpiar líneas. Pausa con P.' },
  { id: 'frogger', href: '/frogger', label: 'Frogger', desc: 'Lleva a la rana desde la parte inferior hasta las cinco casas en la cima. Cruza la carretera esquivando coches y el río saltando sobre troncos. Los vehículos suenan en estéreo. Tecla E para escuchar los peligros cercanos. 3 vidas, 45 segundos por intento.' },
{ id: 'asteroids', href: '/asteroides', label: 'Asteroides', desc: 'Destruye todos los asteroides antes de que te alcancen. Gira con A D, propulsa con W y dispara con Espacio. Cada asteroide emite un zumbido espacializado: el estéreo indica izquierda o derecha y el tono indica arriba o abajo. Los grandes suenan muy graves, los pequeños agudos. Tecla E para escanear posiciones.' },
  { id: 'buscaminas', href: '/buscaminas', label: 'Buscaminas', desc: 'Descubre todas las celdas sin minas. Navega con las flechas o WASD, revela con Enter y marca minas con F. Cada celda emite un tono al revelarla: agudo y suave si hay pocas minas alrededor, grave y áspero si hay muchas. Tecla E para escuchar la celda actual y sus ocho vecinas. Tres dificultades: 9×9, 12×12 y 16×16.' },
  { id: 'sokoban', href: '/sokoban', label: 'Sokoban', desc: 'Empuja las cajas hasta las metas. Usa las flechas o WASD para moverte y empujar. Z deshace el último movimiento, R reinicia el nivel, E describe el entorno. 10 niveles de dificultad creciente.' },
  { id: 'tragaperras', href: '/tragaperras', label: 'Tragaperras', desc: 'Máquina tragaperras con 3 rodillos y 5 símbolos. Gira con Espacio, retén rodillos con 1-2-3. Cada símbolo tiene un tono propio. Premio máximo: tres sietes, 250 créditos. Q para salir y guardar puntuación.' },
  { id: 'quince', href: '/quince', label: 'Puzle Quince', desc: 'Puzle deslizante de 15 fichas en una cuadrícula 4×4. Desliza fichas hacia el hueco con las flechas hasta ordenarlas del 1 al 15. Cada ficha emite un tono al moverse, paneado a su columna de destino. E describe el hueco y las fichas adyacentes. Tres dificultades.' },
  { id: 'solitario', href: '/solitario', label: 'Solitario', desc: 'Klondike clásico. Mueve las 52 cartas a las cuatro fundaciones de As a Rey siguiendo el palo. Alterna colores en el tableau. Flechas para navegar entre pilas, Enter para seleccionar y colocar, A para enviar automáticamente a la fundación.' },
  { id: 'templo', href: '/templo', label: 'El Templo Perdido', desc: 'Aventura de texto arqueológica. Explora 49 zonas de la jungla y el templo maya perdido, descubre sus secretos y derrota al Dios Serpiente Kukulkán. Elige entre Explorador, Chamán o Arqueóloga.' },
  { id: 'inca', href: '/inca', label: 'El Imperio del Sol', desc: 'Aventura de texto en el Imperio Inca. Explora 49 zonas de los Andes y la ciudadela perdida, descubre sus secretos y derrota a Supay, el Dios de la Muerte. Elige entre Guerrero Inca, Sacerdotisa del Sol o Ladrón de Oro.' },
]

export default async function Home() {
  const session = await auth()

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#333]">
        <h1 className="text-2xl font-bold text-[#ffd700]">Juegos Accesibles</h1>
        <nav aria-label="Navegación de usuario" className="flex items-center gap-4 flex-wrap">
          {session?.user ? (
            <>
              <span className="text-sm text-[#888]">Hola, {session.user.name}</span>
              <Link href="/perfil" className="text-[#ffd700] underline hover:text-white text-sm">
                Mi perfil
              </Link>
              <Link href="/tabla-lideres" className="text-[#ffd700] underline hover:text-white text-sm">
                Tabla de líderes
              </Link>
              <form
                action={async () => {
                  'use server'
                  await signOut({ redirectTo: '/' })
                }}
              >
                <button type="submit" className="text-sm text-[#888] hover:text-white underline cursor-pointer">
                  Cerrar sesión
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="text-[#ffd700] underline hover:text-white text-sm">
                Iniciar sesión
              </Link>
              <Link href="/register" className="text-[#ffd700] underline hover:text-white text-sm">
                Registrarse
              </Link>
            </>
          )}
        </nav>
      </header>

      <main id="main-content" className="flex-1 max-w-2xl mx-auto w-full px-6 py-10">
        <h2 className="text-xl mb-2">Bienvenido al sitio de juegos accesibles</h2>
        <p className="text-[#888] mb-8 text-base">
          Todos los juegos se controlan completamente con el teclado y son compatibles con lectores de pantalla como NVDA, JAWS y VoiceOver.
        </p>

        <ul className="space-y-4" role="list" aria-label="Lista de juegos disponibles">
          {GAMES.map((game) => (
            <li key={game.id}>
              <Link
                href={game.href}
                className="block p-5 rounded-lg border border-[#333] bg-[#111] hover:border-[#ffd700] hover:bg-[#1a1a1a] transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#ffd700] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                aria-describedby={`desc-${game.id}`}
              >
                <span className="block text-lg font-bold text-[#ffd700]">{game.label}</span>
                <span id={`desc-${game.id}`} className="block text-sm text-[#888] mt-1">
                  {game.desc}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>

      <footer className="px-6 py-4 border-t border-[#333] text-center text-sm text-[#555]">
        Navega con Tab entre los juegos. Presiona Enter para ingresar.
      </footer>
    </div>
  )
}
