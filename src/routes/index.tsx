import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import { LibraryView } from '#/components/library-view'
import { useEditorStore } from '#/lib/editor-store.client'

const ReaderWorkspace = lazy(() =>
  import('#/components/reader-workspace').then((module) => ({ default: module.ReaderWorkspace })),
)

export const Route = createFileRoute('/')({
  component: Home,
  ssr: false,
})

function Home() {
  return (
    <ClientOnly fallback={<div className="app-boot">Preparing your local workspace…</div>}>
      <MimirApp />
    </ClientOnly>
  )
}

function MimirApp() {
  const activeDocument = useEditorStore((state) => state.activeDocument)
  return activeDocument ? (
    <Suspense fallback={<div className="app-boot">Opening your reading workspace…</div>}>
      <ReaderWorkspace />
    </Suspense>
  ) : <LibraryView />
}
