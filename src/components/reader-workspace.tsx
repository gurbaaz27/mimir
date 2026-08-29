import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { LoaderCircle } from 'lucide-react'
import { Dialog, DropdownMenu, Tooltip } from 'radix-ui'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Annotation } from '#/lib/annotations'
import { AgentStatus } from './agent-status'
import { editorStore, useEditorStore, type EditorTool } from '#/lib/editor-store.client'
import { loadPdf } from '#/lib/pdf.client'
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  DownloadIcon,
  MinusIcon,
  PanelLeftOpenIcon,
  PlusIcon,
  RedoIcon,
  RotateCwIcon,
  SearchIcon,
  UndoIcon,
} from '#/components/icons'
import { AnnotationToolbar } from './annotation-toolbar'
import { DocumentSidebar } from './document-sidebar'
import { PdfViewer } from './pdf-viewer'
import { SearchPanel } from './search-panel'
import { SelectionBar } from './selection-bar'
import { IconButton, MimirMark, documentLabel } from './ui'

export function ReaderWorkspace() {
  const navigate = useNavigate()
  const activeDocument = useEditorStore((state) => state.activeDocument)
  const annotations = useEditorStore((state) => state.annotations)
  const currentPage = useEditorStore((state) => state.currentPage)
  const zoom = useEditorStore((state) => state.zoom)
  const rotation = useEditorStore((state) => state.rotation)
  const sidebarOpen = useEditorStore((state) => state.sidebarOpen)
  const searchOpen = useEditorStore((state) => state.searchOpen)
  const toast = useEditorStore((state) => state.toast)
  const history = useEditorStore((state) => state.history)
  const future = useEditorStore((state) => state.future)
  const selectedId = useEditorStore((state) => state.selectedAnnotationId)
  const setSelected = useEditorStore((state) => state.setSelectedAnnotation)
  const closeDocument = useEditorStore((state) => state.closeDocument)
  const setCurrentPage = useEditorStore((state) => state.setCurrentPage)
  const setZoom = useEditorStore((state) => state.setZoom)
  const setRotation = useEditorStore((state) => state.setRotation)
  const setSidebarOpen = useEditorStore((state) => state.setSidebarOpen)
  const setSearchOpen = useEditorStore((state) => state.setSearchOpen)
  const setTool = useEditorStore((state) => state.setTool)
  const commit = useEditorStore((state) => state.commit)
  const notify = useEditorStore((state) => state.notify)
  const undo = useEditorStore((state) => state.undo)
  const redo = useEditorStore((state) => state.redo)
  const deleteAnnotations = useEditorStore((state) => state.deleteAnnotations)
  const indexDocument = useEditorStore((state) => state.indexDocument)
  const loadOutline = useEditorStore((state) => state.loadOutline)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportFormat, setExportFormat] = useState<'pdf' | 'json'>('pdf')
  const [exportProgress, setExportProgress] = useState<number | null>(null)
  const temporaryPanTool = useRef<EditorTool | null>(null)

  const goToLibrary = async () => {
    await closeDocument()
    await navigate({ to: '/' })
  }

  const restoreTemporaryPan = () => {
    const previousTool = temporaryPanTool.current
    if (!previousTool) return
    temporaryPanTool.current = null
    if (editorStore.getState().tool === 'pan') editorStore.getState().setTool(previousTool)
  }

  useEffect(() => {
    if (!activeDocument) return
    let cancelled = false
    setPdf(null)
    void loadPdf(activeDocument.blob)
      .then((document) => {
        if (cancelled) return void document.cleanup()
        setPdf(document)
        void indexDocument(document)
        void loadOutline(document)
      })
      .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : 'The PDF could not be rendered.'))
    return () => {
      cancelled = true
    }
  }, [activeDocument?.id])

  useEffect(() => {
    const prepare = (event: Event) => {
      const format = (event as CustomEvent<{ format: 'pdf' | 'json' }>).detail.format
      setExportFormat(format)
      setExportOpen(true)
    }
    window.addEventListener('mimir:prepare-export', prepare)
    return () => window.removeEventListener('mimir:prepare-export', prepare)
  }, [])

  useEffect(() => {
    const unsubscribe = editorStore.subscribe((state, previousState) => {
      if (temporaryPanTool.current && state.tool !== previousState.tool && state.tool !== 'pan') {
        temporaryPanTool.current = null
      }
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    restoreTemporaryPan()
  }, [activeDocument?.id])

  useEffect(() => () => restoreTemporaryPan(), [])

  useEffect(() => {
    const shortcuts: Record<string, () => void> = {
      h: () => setTool('highlight'),
      u: () => setTool('underline'),
      d: () => setTool('ink'),
      t: () => setTool('text'),
      n: () => setTool('note'),
      r: () => setTool('rectangle'),
      e: () => setTool('ellipse'),
      a: () => setTool('arrow'),
    }
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        restoreTemporaryPan()
        setTool('select')
        return
      }
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, [contenteditable="true"]')) return
      if (event.code === 'Space' && !event.repeat) {
        event.preventDefault()
        const currentTool = editorStore.getState().tool
        if (currentTool !== 'pan') {
          temporaryPanTool.current = currentTool
          setTool('pan')
        }
        return
      }
      const key = event.key.toLowerCase()
      if ((event.metaKey || event.ctrlKey) && key === 'z') {
        event.preventDefault()
        void (event.shiftKey ? redo() : undo())
      } else if ((event.metaKey || event.ctrlKey) && key === 'f') {
        event.preventDefault()
        setSearchOpen(true)
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        event.preventDefault()
        void deleteAnnotations([selectedId])
      } else if (event.shiftKey && key === 's') {
        setTool('strikeout')
      } else if (!event.metaKey && !event.ctrlKey && !event.altKey) {
        shortcuts[key]?.()
      }
    }
    const keyup = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      event.preventDefault()
      restoreTemporaryPan()
    }
    window.addEventListener('keydown', keydown)
    window.addEventListener('keyup', keyup)
    window.addEventListener('blur', restoreTemporaryPan)
    return () => {
      window.removeEventListener('keydown', keydown)
      window.removeEventListener('keyup', keyup)
      window.removeEventListener('blur', restoreTemporaryPan)
    }
  }, [deleteAnnotations, redo, selectedId, setSearchOpen, setTool, undo])

  useEffect(() => {
    return () => {
      void pdf?.cleanup()
    }
  }, [pdf])

  if (!activeDocument) return null

  const saveExport = async () => {
    if (exportFormat === 'json') {
      const { exportSidecar } = await import('#/lib/export.client')
      exportSidecar(activeDocument, annotations)
      setExportOpen(false)
      notify('Annotation sidecar saved')
      return
    }
    setExportProgress(0.02)
    try {
      const { exportAnnotatedPdf } = await import('#/lib/export.client')
      await exportAnnotatedPdf(activeDocument, annotations, setExportProgress)
      notify('Annotated PDF saved')
      setExportOpen(false)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Export failed')
    } finally {
      setExportProgress(null)
    }
  }

  const importAnnotations = async (file?: File) => {
    if (!file) return
    try {
      const { parseSidecar } = await import('#/lib/export.client')
      const sidecar = await parseSidecar(file)
      if (sidecar.document.fingerprint !== activeDocument.fingerprint) {
        throw new Error('This sidecar belongs to a different PDF.')
      }
      const normalized = sidecar.annotations.map((annotation) => ({ ...annotation, documentId: activeDocument.id })) as Array<Annotation>
      const importedIds = new Set(normalized.map((annotation) => annotation.id))
      const before = annotations.filter((annotation) => importedIds.has(annotation.id))
      await commit(before, normalized, `Import ${normalized.length} annotations`)
      notify(`Imported ${normalized.length} annotation${normalized.length === 1 ? '' : 's'}`)
      setExportOpen(false)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The sidecar could not be imported.')
    }
  }

  return (
    <Tooltip.Provider>
      <main
        className="reader-shell"
        onPointerDown={(event) => {
          if (!selectedId) return
          const target = event.target
          if (target instanceof Element && target.closest('.selection-bar')) return
          setSelected(null)
        }}
      >
        <header className="reader-topbar">
          <div className="reader-identity">
            <IconButton label="Back to library" icon={ArrowLeftIcon} onClick={() => void goToLibrary()} />
            <MimirMark compact />
            <div className="document-title">
              <strong>{documentLabel(activeDocument)}</strong>
            </div>
          </div>
          <div className="reader-navigation">
            <label>
              <span className="visually-hidden">Current page</span>
              <input
                value={currentPage}
                inputMode="numeric"
                onChange={(event) => setCurrentPage(Number(event.target.value) || 1)}
                onBlur={() => window.dispatchEvent(new CustomEvent('mimir:navigate', { detail: { pageNumber: currentPage } }))}
              />
              <span>of {activeDocument.pageCount}</span>
            </label>
            <span className="topbar-divider" />
            <IconButton label="Zoom out" shortcut="−" icon={MinusIcon} size={16} onClick={() => setZoom(zoom - 0.1)} disabled={zoom <= 0.5} />
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="zoom-trigger" type="button">{Math.round(zoom * 100)}% <ChevronDownIcon size={13} /></button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content className="menu-content zoom-menu" sideOffset={7}>
                  {[0.75, 1, 1.25, 1.5, 2].map((value) => (
                    <DropdownMenu.Item className="menu-item" key={value} onSelect={() => setZoom(value)}>{Math.round(value * 100)}%</DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <IconButton label="Zoom in" shortcut="+" icon={PlusIcon} size={16} onClick={() => setZoom(zoom + 0.1)} disabled={zoom >= 3} />
          </div>
          <div className="reader-actions">
            <AgentStatus documentId={activeDocument.id} variant="reader" />
            <IconButton label="Search" shortcut="⌘F" icon={SearchIcon} active={searchOpen} onClick={() => setSearchOpen(!searchOpen)} />
            <IconButton label="Rotate clockwise" icon={RotateCwIcon} onClick={() => setRotation(rotation + 90)} />
            <IconButton label="Undo" shortcut="⌘Z" icon={UndoIcon} disabled={!history.length} onClick={() => void undo()} />
            <IconButton label="Redo" shortcut="⇧⌘Z" icon={RedoIcon} disabled={!future.length} onClick={() => void redo()} />
            <button className="export-button" type="button" onClick={() => setExportOpen(true)}><DownloadIcon size={16} /> Export</button>
          </div>
        </header>

        <AnnotationToolbar />
        {searchOpen && <SearchPanel />}

        <div className={`reader-body ${sidebarOpen ? 'has-sidebar' : ''}`}>
          {!sidebarOpen && (
            <button className="open-panel" type="button" aria-label="Open document navigation" onClick={() => setSidebarOpen(true)}><PanelLeftOpenIcon size={17} /></button>
          )}
          {pdf && <DocumentSidebar pdf={pdf} open={sidebarOpen} />}
          <section className="viewer-stage" aria-label="PDF reader">
            {pdf ? (
              <PdfViewer pdf={pdf} pageCount={activeDocument.pageCount} zoom={zoom} rotation={rotation} annotations={annotations} />
            ) : loadError ? (
              <div className="viewer-error"><strong>This PDF could not be rendered.</strong><p>{loadError}</p></div>
            ) : (
              <div className="viewer-loading"><LoaderCircle className="spin" /><span>Preparing the document…</span></div>
            )}
            <SelectionBar />
          </section>
        </div>

        {toast && (
          <div className="toast" role="status">
            <span>{toast}</span>
            {toast.includes('Undo') && <button type="button" onClick={() => void undo()}>Undo</button>}
          </div>
        )}

        <Dialog.Root open={exportOpen} onOpenChange={setExportOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content className="export-dialog" aria-describedby="export-description">
              <Dialog.Title>Take your work with you</Dialog.Title>
              <Dialog.Description id="export-description">
                Export a readable PDF or the editable annotation source.
              </Dialog.Description>
              <div className="export-options">
                <button type="button" className={exportFormat === 'pdf' ? 'is-active' : ''} onClick={() => setExportFormat('pdf')}>
                  <span className="export-icon">PDF</span>
                  <span><strong>Annotated PDF</strong><small>Marks drawn into the original pages. Notes include a comments appendix.</small></span>
                </button>
                <button type="button" className={exportFormat === 'json' ? 'is-active' : ''} onClick={() => setExportFormat('json')}>
                  <span className="export-icon code">{'{ }'}</span>
                  <span><strong>Annotation sidecar</strong><small>Versioned JSON that remains editable by Mimir and browser agents.</small></span>
                </button>
              </div>
              {exportProgress !== null && <div className="export-progress"><span style={{ width: `${exportProgress * 100}%` }} /></div>}
              <div className="dialog-actions">
                <label className="import-sidecar">
                  Import sidecar
                  <input type="file" accept="application/json,.json" onChange={(event) => void importAnnotations(event.target.files?.[0])} />
                </label>
                <Dialog.Close asChild><button type="button" className="secondary-button">Cancel</button></Dialog.Close>
                <button type="button" className="primary-button" disabled={exportProgress !== null} onClick={() => void saveExport()}>
                  {exportProgress !== null ? <LoaderCircle className="spin" size={16} /> : <DownloadIcon size={16} />}
                  {exportProgress !== null ? 'Preparing…' : `Save ${exportFormat.toUpperCase()}`}
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </main>
    </Tooltip.Provider>
  )
}
