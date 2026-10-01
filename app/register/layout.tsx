import type { Metadata } from 'next'

// Página de cuenta sin contenido indexable. Se permite el rastreo en
// robots.ts para que los buscadores puedan leer este noindex.
export const metadata: Metadata = {
  title: 'Crear cuenta',
  robots: { index: false, follow: true },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
