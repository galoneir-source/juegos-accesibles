import NextAuth from 'next-auth'
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server'
import { authConfig } from '@/lib/auth.config'
import { GAMES } from '@/lib/games'

const { auth } = NextAuth(authConfig)

// `auth` tiene varias firmas (sesión, ruta, proxy…) y TypeScript no elige la
// de proxy al llamarla con la petición: se fija aquí.
const authProxy = auth as unknown as (
  request: NextRequest,
  event: NextFetchEvent,
) => Promise<Response>

// Páginas que exigen sesión: sin ella, `auth` redirige a /login.
const PROTECTED = ['/perfil', '/tabla-lideres']

// Breakout y Mazmorra Oscura son HTML estáticos (rewrites de next.config.ts):
// no tienen Server Actions y un POST contra ellos acababa en 500.
const STATIC_GAMES = ['/breakout', '/mazmorra-oscura']

// Las Server Actions se envían por POST a la URL de la página que las usa, así
// que solo las páginas de la app (y /api/auth/) pueden recibir un POST. Ojo:
// una página nueva que no sea un juego del catálogo hay que añadirla aquí, o
// sus formularios y acciones responderán 404.
const POST_PAGES = new Set([
  '/',
  '/login',
  '/register',
  '/recuperar',
  '/restablecer',
  '/privacidad',
  ...PROTECTED,
  ...GAMES.map((g) => g.href).filter((href) => !STATIC_GAMES.includes(href)),
])

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const pathname = request.nextUrl.pathname.replace(/(.)\/$/, '$1')

  // Los escáneres envían POST a rutas que no existen (/api/upload,
  // /fileupload/…). Next los trataba como Server Actions de la página 404 y,
  // si el cuerpo no era un formulario válido, respondía 500 y lo anotaba en el
  // log de errores. Aquí se corta antes con un 404 sin cuerpo.
  if (
    request.method === 'POST' &&
    !pathname.startsWith('/api/auth/') &&
    !POST_PAGES.has(pathname)
  ) {
    return new NextResponse(null, { status: 404 })
  }

  // Lo mismo con un formulario mal formado enviado a una página que sí existe:
  // se rechaza aquí con 400 en vez de dejar que Next falle al leerlo.
  if (
    request.method === 'POST' &&
    request.headers.get('content-type')?.startsWith('multipart/form-data')
  ) {
    try {
      await request.clone().formData()
    } catch {
      return new NextResponse(null, { status: 400 })
    }
  }

  if (PROTECTED.includes(pathname)) {
    return authProxy(request, event)
  }

  return NextResponse.next()
}

export const config = {
  // Todo menos los ficheros estáticos de la build.
  matcher: ['/((?!_next/static|_next/image).*)'],
}
