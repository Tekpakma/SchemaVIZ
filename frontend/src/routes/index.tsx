import { MainScreen } from '@/features/canvas/components/MainScreen'
import { createFileRoute } from '@tanstack/react-router'



export const Route = createFileRoute('/')({
  component: MainScreen,
  ssr: false,
})