import Link from 'next/link'
import { auth, signOut } from '@/lib/auth'

const GAMES = [
{ id: 'hangman', href: '/hangman', label: 'Ahorcado', desc: 'Adivina la palabra secreta letra a letra usando el teclado.' },
{ id: 'memory-sonidos', href: '/memory-sonidos', label: 'Memory de Sonidos', desc: 'Escucha la secuencia de sonidos y repítela en el mismo orden.' },
  { id: 'aventura-texto', href: '/aventura-texto', label: 'Aventura de Texto', desc: 'Explora un mundo con comandos de texto como ir norte, tomar objeto.' },
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
