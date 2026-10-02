import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Restablecer contraseña',
  robots: { index: false, follow: true },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
