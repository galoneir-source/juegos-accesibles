import CategoryPage from '@/components/games/CategoryPage'
import { categoryMetadata } from '@/lib/games'

export const metadata = categoryMetadata('audio')

export default function Page() {
  return <CategoryPage id="audio" />
}
