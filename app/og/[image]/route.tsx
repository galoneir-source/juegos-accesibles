import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { CATEGORIES, GAMES, ogImageSlugs } from '@/lib/games'

// Imagen para compartir en redes de cada juego y cada categoría
// (/og/<slug>.png, 1200×630). Se generan todas en el build a partir del
// catálogo, así que un juego nuevo tiene la suya sin hacer nada más. Mismo
// estilo que public/og-image.png, que sigue siendo la de la portada.
export const dynamic = 'force-static'
export const dynamicParams = false

export function generateStaticParams() {
  return ogImageSlugs().map((slug) => ({ image: `${slug}.png` }))
}

// DejaVu Sans reducida a caracteres latinos (assets/fonts, licencia libre en
// LICENSE-DejaVu.txt): la misma fuente que la imagen general.
const fonts = Promise.all(
  ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf'].map((f) => readFile(join(process.cwd(), 'assets/fonts', f))),
)

const GOLD = '#ffd700'

function titleSize(text: string): number {
  if (text.length <= 12) return 112
  if (text.length <= 15) return 92
  return 76
}

export async function GET(_request: Request, { params }: { params: Promise<{ image: string }> }) {
  const slug = (await params).image.replace(/\.png$/, '')
  const game = GAMES.find((g) => g.href === `/${slug}`)
  const category = CATEGORIES.find((c) => c.slug === slug)
  if (!game && !category) return new Response('No encontrado', { status: 404 })

  const kicker = game ? CATEGORIES.find((c) => c.id === game.category)!.label : 'Juegos Accesibles'
  const title = game ? game.label : category!.label
  const count = category ? GAMES.filter((g) => g.category === category.id).length : 0
  const subtitle = game ? 'Juego accesible para ciegos, gratis' : `${count} juegos accesibles para ciegos, gratis`

  const [regular, bold] = await fonts
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#0a0a0a',
          borderTop: `12px solid ${GOLD}`,
          padding: '56px 80px 60px',
          fontFamily: 'DejaVu Sans',
        }}
      >
        <div style={{ display: 'flex', fontSize: 34, color: '#aaaaaa' }}>{kicker}</div>
        <div style={{ display: 'flex', flexGrow: 1, alignItems: 'center' }}>
          <div style={{ display: 'flex', fontSize: titleSize(title), fontWeight: 700, color: GOLD, lineHeight: 1.1 }}>
            {title}
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 42, color: '#f0f0f0' }}>{subtitle}</div>
        <div style={{ display: 'flex', fontSize: 34, color: '#aaaaaa', marginTop: 14 }}>
          Solo teclado · NVDA · JAWS · VoiceOver
        </div>
        <div style={{ display: 'flex', fontSize: 32, fontWeight: 700, color: '#f0f0f0', marginTop: 44 }}>
          {`juegos.dvillalon.com/${slug}`}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'DejaVu Sans', data: regular, weight: 400, style: 'normal' },
        { name: 'DejaVu Sans', data: bold, weight: 700, style: 'normal' },
      ],
    },
  )
}
