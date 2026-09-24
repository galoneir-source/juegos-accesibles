import { gameMetadata } from '@/lib/games'

export const metadata = gameMetadata('wordle')

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
