import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { LibraryView } from '#/components/library-view'
import { AppBoot } from '#/components/ui'

export const Route = createFileRoute('/')({
  component: Home,
  ssr: false,
})

function Home() {
  return (
    <ClientOnly fallback={<AppBoot>Preparing your local workspace…</AppBoot>}>
      <LibraryView />
    </ClientOnly>
  )
}
