import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { LibraryView } from '#/components/library-view'

export const Route = createFileRoute('/')({
  component: Home,
  ssr: false,
})

function Home() {
  return (
    <ClientOnly fallback={<div className="app-boot">Preparing your local workspace…</div>}>
      <LibraryView />
    </ClientOnly>
  )
}
