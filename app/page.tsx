import type { Metadata } from 'next'
import Link from 'next/link'
import { auth, signOut } from '@/lib/auth'
import { CATEGORIES, GAMES, SITE_NAME, SITE_URL, socialMetadata } from '@/lib/games'

const TITLE = 'Juegos accesibles para ciegos gratis: 50+ con NVDA, JAWS y VoiceOver'
const DESCRIPTION =
  'Más de 50 juegos gratis y accesibles para personas ciegas o con baja visión: Tetris, Wordle, cartas, puzles, juegos de audio y aventuras de texto. Solo teclado, sin instalar nada.'

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  ...socialMetadata(TITLE, DESCRIPTION, '/'),
}

// Datos estructurados: el sitio y la lista de juegos. No es un script
// ejecutable; se escapa "<" para que ningún texto pueda cerrar la etiqueta.
const jsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: SITE_NAME,
      description: DESCRIPTION,
      inLanguage: 'es',
      author: { '@type': 'Person', name: 'Daniel Villalón', url: 'https://dvillalon.com/' },
    },
    {
      '@type': 'ItemList',
      name: 'Juegos accesibles para personas ciegas',
      numberOfItems: GAMES.length,
      itemListElement: GAMES.map((game, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: game.label,
        url: `${SITE_URL}${game.href}`,
      })),
    },
  ],
}).replace(/</g, '\\u003c')

export default async function Home() {
  const session = await auth()

  return (
    <div className="min-h-screen flex flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
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
        <p className="text-xl mb-2">Bienvenido al sitio de juegos accesibles</p>
        <p className="text-[#888] mb-8 text-base">
          Todos los juegos se controlan completamente con el teclado y son compatibles con lectores de pantalla como NVDA, JAWS y VoiceOver.
        </p>

        {CATEGORIES.map((category) => (
          <section key={category.id} aria-labelledby={`cat-${category.id}`} className="mb-10">
            <h2 id={`cat-${category.id}`} className="text-xl font-bold mb-4">
              {category.label}
            </h2>
            <ul className="space-y-4" role="list">
              {GAMES.filter((game) => game.category === category.id).map((game) => (
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
          </section>
        ))}
      </main>

      <footer className="px-6 py-4 border-t border-[#333] text-center text-sm text-[#999]">
        <p>Navega con Tab entre los juegos o salta de categoría con la tecla H. Presiona Enter para ingresar.</p>
        <p className="mt-2">
          Un proyecto de{' '}
          <a href="https://dvillalon.com/" className="text-[#ffd700] underline hover:text-white">
            Daniel Villalón
          </a>
        </p>
      </footer>
    </div>
  )
}
