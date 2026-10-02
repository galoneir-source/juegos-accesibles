import { gameMetadata } from '@/lib/games'

export const metadata = gameMetadata('asteroides')

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
