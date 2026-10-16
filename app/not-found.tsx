import type { Metadata } from 'next'
import Link from 'next/link'
import { CATEGORIES } from '@/lib/games'

// Página 404 propia: sin ella Next mostraba la suya en inglés, con dos <title>
// y sin <main>, así que el enlace «Saltar al contenido principal» del layout
// no llevaba a ningún sitio.
export const metadata: Metadata = {
  title: 'Página no encontrada',
}

const LINK = 'text-[#ffd700] underline hover:text-white'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#333]">
        <p className="text-xl font-bold text-[#ffd700]">Juegos Accesibles</p>
        <Link href="/" className="text-[#ffd700] underline hover:text-white text-sm">← Lobby</Link>
      </header>

      <main id="main-content" className="flex-1 max-w-2xl mx-auto w-full px-6 py-10 space-y-6 leading-relaxed">
        <h1 className="text-2xl font-bold">Página no encontrada</h1>
        <p>
          La dirección que has abierto no existe o ha cambiado. Puede que el juego tenga ahora otro nombre:
          búscalo en la <Link href="/" className={LINK}>portada</Link> o en una de las categorías.
        </p>
        <nav aria-labelledby="categorias">
          <h2 id="categorias" className="text-lg font-bold mb-2">Categorías</h2>
          <ul className="list-disc pl-6 space-y-2">
            {CATEGORIES.map((c) => (
              <li key={c.id}>
                <Link href={`/${c.slug}`} className={LINK}>{c.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </main>
    </div>
  )
}
