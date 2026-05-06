import { Outlet, createFileRoute } from '@tanstack/react-router'

import { Navbar } from '@/components/Navbar'

export const Route = createFileRoute('/_app')({
  component: AppLayout,
})

function AppLayout() {
  return (
    <div className="app-shell">
      <Navbar />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
