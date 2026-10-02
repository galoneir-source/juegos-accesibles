import { gameMetadata } from '@/lib/games'

export const metadata = gameMetadata('tetris')

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
