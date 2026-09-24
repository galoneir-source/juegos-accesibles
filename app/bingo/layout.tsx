import { gameMetadata } from '@/lib/games'

export const metadata = gameMetadata('bingo')

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
