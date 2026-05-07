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
