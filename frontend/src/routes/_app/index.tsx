import { createFileRoute } from '@tanstack/react-router'

import { MainScreen } from '@/features/canvas/components/MainScreen'

export const Route = createFileRoute('/_app/')({
  component: MainScreen,
  ssr: false,
})
