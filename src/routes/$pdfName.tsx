import { ClientOnly, createFileRoute, Link } from '@tanstack/react-router'
import { lazy, Suspense, useEffect, useState } from 'react'
import { getDocumentPathSegment } from '#/lib/document-route'
import { editorStore, useEditorStore } from '#/lib/editor-store.client'
import { AppBoot } from '#/components/ui'

const ReaderWorkspace = lazy(() =>
  import('#/components/reader-workspace').then((module) => ({ default: module.ReaderWorkspace })),
)

export const Route = createFileRoute('/$pdfName')({
  component: DocumentRoute,
  ssr: false,
})

function DocumentRoute() {
  return (
    <ClientOnly fallback={<AppBoot>Preparing your local workspace…</AppBoot>}>
      <DocumentPage />
    </ClientOnly>
  )
}

function DocumentPage() {
  const { pdfName } = Route.useParams()
  const activeDocument = useEditorStore((state) => state.activeDocument)
  const loadLibrary = useEditorStore((state) => state.loadLibrary)
  const openDocument = useEditorStore((state) => state.openDocument)
  const cancelDocumentOpen = useEditorStore((state) => state.cancelDocumentOpen)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    cancelDocumentOpen()
    let cancelled = false
    setLoading(true)
    setNotFound(false)
    setError(null)

    const open = async () => {
      let availableDocuments = editorStore.getState().documents
      if (!availableDocuments.length) {
        await loadLibrary()
        availableDocuments = editorStore.getState().documents
      }
      if (cancelled) return

      const document = availableDocuments.find((record) => getDocumentPathSegment(record) === pdfName)
      if (!document) {
        setNotFound(true)
        setLoading(false)
        return
      }

      if (editorStore.getState().activeDocument?.id !== document.id) {
        await openDocument(document.id)
      }
      if (!cancelled) setLoading(false)
    }

    void open().catch((reason: unknown) => {
      if (cancelled) return
      setError(reason instanceof Error ? reason.message : 'The PDF could not be opened.')
      setLoading(false)
    })

    return () => {
      cancelled = true
      cancelDocumentOpen()
    }
  }, [cancelDocumentOpen, loadLibrary, openDocument, pdfName])

  const isCurrentDocument = activeDocument && getDocumentPathSegment(activeDocument) === pdfName
  if (notFound) {
    return (
      <AppBoot branded>
        <div className="grid gap-1.5">
          <strong>That document is not in your local library.</strong>
          <Link to="/">Back to library</Link>
        </div>
      </AppBoot>
    )
  }
  if (error) return <AppBoot>{error}</AppBoot>
  if (loading || !isCurrentDocument) {
    return <AppBoot>Opening your reading workspace…</AppBoot>
  }

  return (
    <Suspense fallback={<AppBoot>Opening your reading workspace…</AppBoot>}>
      <ReaderWorkspace />
    </Suspense>
  )
}
