import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { socialMetadata } from '@/lib/games'

export const metadata: Metadata = {
  title: 'Novedades',
  description: 'Juegos nuevos, mejoras de accesibilidad y arreglos de Juegos Accesibles, del más reciente al más antiguo.',
  alternates: { canonical: '/novedades' },
  ...socialMetadata('Novedades — Juegos Accesibles', 'Juegos nuevos, mejoras de accesibilidad y arreglos de Juegos Accesibles.', '/novedades'),
}

const LINK = 'text-[#ffd700] underline hover:text-white'
const CONTACT = 'contacto@dvillalon.com'

// Del más reciente al más antiguo. Solo cambios que nota quien juega; al
// desplegar algo así, añadir una entrada arriba del todo.
type Entry = { date: string; label: string; items: ReactNode[] }

const NEWS: Entry[] = [
  {
    date: '2026-11-11',
    label: '11 de noviembre de 2026',
    items: [
      'Juegos de cartas: corregidos varios fallos que podían estropear una partida de Truco, Póker, Gin Rummy, Solitario y Blackjack.',
    ],
  },
  {
    date: '2026-11-10',
    label: '10 de noviembre de 2026',
    items: [
      'Controles táctiles: los juegos de teclado se pueden jugar en móvil y tableta sin teclado físico.',
      'NVDA y JAWS dejan pasar las teclas a los 26 juegos de teclado sin cambiar de modo a mano. Escape saca el foco de la zona de juego.',
      'Control de volumen para los efectos de sonido.',
      <>Las <Link key="a" href="/aventuras-de-texto" className={LINK}>aventuras de texto</Link> se agrupan por ambientación.</>,
      <>En la <Link key="g" href="/generala" className={LINK}>Generala</Link>, el juego pide confirmación antes de tachar una categoría y anuncia la jugada al anotar.</>,
    ],
  },
  {
    date: '2026-11-02',
    label: '2 de noviembre de 2026',
    items: ['Cada juego tiene su propia imagen al compartirlo en redes sociales o mensajería.'],
  },
  {
    date: '2026-10-31',
    label: '31 de octubre de 2026',
    items: [
      <>Direcciones en español: <Link key="h" href="/ahorcado" className={LINK}>/ahorcado</Link> y <Link key="b" href="/el-ultimo-bogatyr" className={LINK}>/el-ultimo-bogatyr</Link>. Las antiguas siguen funcionando.</>,
      'Mejoras de accesibilidad con la partida empezada en 2048 y Matemáticas Rápidas, y más contraste en varios juegos.',
    ],
  },
  {
    date: '2026-10-17',
    label: '17 de octubre de 2026',
    items: [
      'El Ahorcado usa palabras reales del diccionario.',
      'Atajos de teclado que ya no chocan con los del lector de pantalla, y la barra de atajos anuncia las teclas reales de cada juego.',
    ],
  },
  {
    date: '2026-10-16',
    label: '16 de octubre de 2026',
    items: [
      'Cada juego explica cómo se juega, sus controles y cómo se gana, y sugiere juegos parecidos.',
      'Páginas por categoría (arcade, cartas, palabras, audio, aventuras de texto…) para encontrar antes cada juego.',
    ],
  },
  {
    date: '2026-10-09',
    label: '9 de octubre de 2026',
    items: ['Iniciar sesión funciona también con JavaScript desactivado y te devuelve a la página en la que estabas.'],
  },
  {
    date: '2026-10-02',
    label: '2 de octubre de 2026',
    items: [
      <>Juego nuevo: <Link key="o" href="/oeste" className={LINK}>El Forajido Inmortal</Link>, aventura de texto en el Lejano Oeste.</>,
      'Cuenta: recuperar la contraseña por correo, cambiar nombre, correo y contraseña desde el perfil, y eliminar la cuenta con todas sus puntuaciones.',
      <><Link key="p" href="/privacidad" className={LINK}>Política de privacidad</Link>.</>,
    ],
  },
  {
    date: '2026-10-01',
    label: '1 de octubre de 2026',
    items: ['Breakout se puede jugar en el móvil arrastrando el dedo, y más contraste en el texto de todos los juegos.'],
  },
]

export default function NovedadesPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#333]">
        <h1 className="text-xl font-bold text-[#ffd700]">Novedades</h1>
        <Link href="/" className="text-[#ffd700] underline hover:text-white text-sm">← Lobby</Link>
      </header>

      <main id="main-content" className="flex-1 max-w-2xl mx-auto w-full px-6 py-10 space-y-8 leading-relaxed">
        <p>
          Juegos nuevos, mejoras de accesibilidad y arreglos, del más reciente al más antiguo. Si algo no te
          funciona con tu lector de pantalla o tienes una idea, escribe a{' '}
          <a href={`mailto:${CONTACT}`} className={LINK}>{CONTACT}</a>.
        </p>

        {NEWS.map((entry) => (
          <section key={entry.date} aria-labelledby={`n-${entry.date}`}>
            <h2 id={`n-${entry.date}`} className="text-lg font-bold mb-2">
              <time dateTime={entry.date}>{entry.label}</time>
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              {entry.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  )
}
