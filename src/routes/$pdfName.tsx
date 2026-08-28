import { ClientOnly, createFileRoute, Link } from '@tanstack/react-router'
import { lazy, Suspense, useEffect, useState } from 'react'
import { getDocumentPathSegment } from '#/lib/document-route'
import { editorStore, useEditorStore } from '#/lib/editor-store.client'

const ReaderWorkspace = lazy(() =>
  import('#/components/reader-workspace').then((module) => ({ default: module.ReaderWorkspace })),
)

export const Route = createFileRoute('/$pdfName')({
  component: DocumentRoute,
  ssr: false,
})

function DocumentRoute() {
  return (
    <ClientOnly fallback={<div className="app-boot">Preparing your local workspace…</div>}>
      <DocumentPage />
    </ClientOnly>
  )
}

function DocumentPage() {
  const { pdfName } = Route.useParams()
  const activeDocument = useEditorStore((state) => state.activeDocument)
  const loadLibrary = useEditorStore((state) => state.loadLibrary)
  const openDocument = useEditorStore((state) => state.openDocument)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
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
    }
  }, [loadLibrary, openDocument, pdfName])

  const isCurrentDocument = activeDocument && getDocumentPathSegment(activeDocument) === pdfName
  if (notFound) {
    return (
      <div className="app-boot">
        <strong>That document is not in your local library.</strong>
        <Link to="/">Back to library</Link>
      </div>
    )
  }
  if (error) return <div className="app-boot">{error}</div>
  if (loading || !isCurrentDocument) {
    return <div className="app-boot">Opening your reading workspace…</div>
  }

  return (
    <Suspense fallback={<div className="app-boot">Opening your reading workspace…</div>}>
      <ReaderWorkspace />
    </Suspense>
  )
}
