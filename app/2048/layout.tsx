import { gameMetadata } from '@/lib/games'

export const metadata = gameMetadata('2048')

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
