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
  BotIcon,
  ChevronDownIcon,
  DownloadIcon,
  MinusIcon,
  MoreIcon,
  PanelLeftOpenIcon,
  PlusIcon,
  RedoIcon,
  RotateCwIcon,
  SearchIcon,
  UndoIcon,
} from '#/components/icons'
import { AnnotationToolbar } from './annotation-toolbar'
import { ChatSidebar } from './chat-sidebar'
import { DocumentSidebar } from './document-sidebar'
import { PdfViewer } from './pdf-viewer'
import { SearchPanel } from './search-panel'
import { SelectionBar } from './selection-bar'
import { cn } from '#/lib/utils'
import {
  Button,
  IconButton,
  MimirMark,
  dialogOverlayClass,
  dialogSurfaceClass,
  documentLabel,
  menuContentClass,
  menuItemClass,
} from './ui'

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
  const selectedIds = useEditorStore((state) => state.selectedAnnotationIds)
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
  const [chatOpen, setChatOpen] = useState(false)
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
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId && selectedIds.length === 1) {
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
  }, [deleteAnnotations, redo, selectedId, selectedIds.length, setSearchOpen, setTool, undo])

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
        className="relative grid h-dvh w-screen grid-rows-[54px_minmax(0,1fr)] overflow-hidden bg-desk"
        onPointerDown={(event) => {
          if (!selectedId) return
          const target = event.target
          if (target instanceof Element && target.closest('[data-selection-bar]')) return
          setSelected(null)
        }}
      >
        <header className="relative z-30 grid grid-cols-[minmax(260px,1fr)_auto_minmax(260px,1fr)] items-center border-b border-line bg-paper px-[11px] shadow-[0_1px_0_oklch(.2_.005_60/.03)] max-[1100px]:grid-cols-[minmax(190px,1fr)_auto_minmax(190px,1fr)] max-[820px]:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex min-w-0 items-center gap-[7px]">
            <IconButton label="Back to library" icon={ArrowLeftIcon} onClick={() => void goToLibrary()} />
            <MimirMark compact />
            <div className="ml-0.5 min-w-0">
              <strong className="block max-w-[360px] overflow-hidden text-ellipsis whitespace-nowrap font-display text-lg leading-none font-[620] tracking-[-.03em] max-[1100px]:max-w-40 max-[1100px]:text-base max-[600px]:max-w-30 max-[600px]:text-[15px]">{documentLabel(activeDocument)}</strong>
            </div>
          </div>
          <div className="flex min-w-0 items-center justify-center gap-[3px] max-[820px]:hidden">
            <label className="flex items-center gap-[5px] text-[11px] text-muted whitespace-nowrap">
              <span className="sr-only">Current page</span>
              <input
                className="h-[29px] w-10 rounded-lg border border-line bg-surface p-0 text-center text-[11px] text-ink tabular-nums"
                value={currentPage}
                inputMode="numeric"
                onChange={(event) => setCurrentPage(Number(event.target.value) || 1)}
                onBlur={() => window.dispatchEvent(new CustomEvent('mimir:navigate', { detail: { pageNumber: currentPage } }))}
              />
              <span>of {activeDocument.pageCount}</span>
            </label>
            <span className="mx-1.5 h-[18px] w-px bg-line" />
            <IconButton label="Zoom out" shortcut="−" icon={MinusIcon} size={16} onClick={() => setZoom(zoom - 0.1)} disabled={zoom <= 0.5} />
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="inline-flex h-[30px] min-w-[62px] items-center justify-center gap-[3px] rounded-lg border-0 bg-transparent text-[11px] text-ink-soft tabular-nums transition-[background,transform] duration-150 ease-spring hover:bg-sunken active:scale-[.94]" type="button">{Math.round(zoom * 100)}% <ChevronDownIcon size={13} /></button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content className={cn(menuContentClass, 'min-w-24')} sideOffset={7}>
                  {[0.75, 1, 1.25, 1.5, 2].map((value) => (
                    <DropdownMenu.Item className={menuItemClass} key={value} onSelect={() => setZoom(value)}>{Math.round(value * 100)}%</DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <IconButton label="Zoom in" shortcut="+" icon={PlusIcon} size={16} onClick={() => setZoom(zoom + 0.1)} disabled={zoom >= 3} />
          </div>
          <div className="flex min-w-0 items-center justify-end gap-0.5">
            <AgentStatus documentId={activeDocument.id} variant="reader" />
            <IconButton label="Ask Mimir" icon={BotIcon} active={chatOpen} onClick={() => setChatOpen(!chatOpen)} />
            <IconButton data-search-trigger label="Search" shortcut="⌘F" icon={SearchIcon} active={searchOpen} onClick={() => setSearchOpen(!searchOpen)} />
            <IconButton className="max-[600px]:hidden" label="Rotate clockwise" icon={RotateCwIcon} onClick={() => setRotation(rotation + 90)} />
            <IconButton className="max-[600px]:hidden" label="Undo" shortcut="⌘Z" icon={UndoIcon} disabled={!history.length} onClick={() => void undo()} />
            <IconButton className="max-[600px]:hidden" label="Redo" shortcut="⇧⌘Z" icon={RedoIcon} disabled={!future.length} onClick={() => void redo()} />
            {/* The header has no room for these below 600px, so touch users reach them here instead. */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="hidden size-[34px] shrink-0 place-items-center rounded-[9px] border-0 bg-transparent p-0 text-ink-soft transition-[background,color,transform] duration-150 ease-out hover:bg-sunken hover:text-ink active:scale-90 max-[600px]:inline-grid" type="button" aria-label="More actions">
                  <MoreIcon size={17} />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content className={menuContentClass} sideOffset={7} align="end">
                  <DropdownMenu.Item className={menuItemClass} onSelect={() => setRotation(rotation + 90)}>
                    <RotateCwIcon size={15} /> Rotate clockwise
                  </DropdownMenu.Item>
                  <DropdownMenu.Item className={menuItemClass} disabled={!history.length} onSelect={() => void undo()}>
                    <UndoIcon size={15} /> Undo
                  </DropdownMenu.Item>
                  <DropdownMenu.Item className={menuItemClass} disabled={!future.length} onSelect={() => void redo()}>
                    <RedoIcon size={15} /> Redo
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <Button size="mobileIcon" className="ml-[9px] min-h-[34px] px-[15px] text-[12.5px] font-[570] max-[600px]:[&_.icon-glyph]:flex max-[600px]:[&_.icon-glyph]:size-4 max-[600px]:[&_.icon-glyph]:shrink-0 max-[600px]:[&_.icon-glyph]:items-center max-[600px]:[&_.icon-glyph]:justify-center" onClick={() => setExportOpen(true)}><DownloadIcon size={16} /> Export</Button>
          </div>
        </header>

        <AnnotationToolbar />
        {searchOpen && <SearchPanel />}

        {/* The chat column is its own grid so the reader's own sidebar/viewer
            split keeps working untouched, and so the conversation survives a
            collapse: the panel stays mounted at zero width. */}
        <div className={cn(
          'grid min-h-0 grid-cols-[minmax(0,1fr)_0] overflow-hidden transition-[grid-template-columns] duration-280 ease-spring',
          chatOpen && 'grid-cols-[minmax(0,1fr)_352px] max-[1100px]:grid-cols-[minmax(0,1fr)_312px] max-[820px]:grid-cols-[0_minmax(0,1fr)]',
        )}>
        <div className={cn(
          'relative grid min-h-0 grid-cols-[0_minmax(0,1fr)] overflow-hidden transition-[grid-template-columns] duration-280 ease-spring max-[820px]:grid-cols-[minmax(0,1fr)]',
          sidebarOpen && 'grid-cols-[228px_minmax(0,1fr)] max-[1100px]:grid-cols-[196px_minmax(0,1fr)] max-[820px]:grid-cols-[minmax(0,1fr)]',
        )}>
          {!sidebarOpen && (
            <button className="absolute top-3 left-3 z-5 inline-grid size-[34px] animate-panel-in place-items-center rounded-[10px] border border-line bg-paper text-ink-soft shadow-menu transition-transform duration-130 ease-spring active:scale-[.92]" type="button" aria-label="Open document navigation" onClick={() => setSidebarOpen(true)}><PanelLeftOpenIcon size={17} /></button>
          )}
          {pdf && <DocumentSidebar pdf={pdf} open={sidebarOpen} />}
          <section className="relative min-h-0 min-w-0 overflow-hidden bg-desk after:pointer-events-none after:absolute after:inset-0 after:z-6 after:shadow-[inset_0_10px_20px_-14px_oklch(.3_.03_70/.55)] after:content-['']" aria-label="PDF reader">
            {pdf ? (
              <PdfViewer pdf={pdf} pageCount={activeDocument.pageCount} zoom={zoom} rotation={rotation} annotations={annotations} />
            ) : loadError ? (
              <div className="flex h-full flex-col items-center justify-center gap-2.5 text-xs text-muted"><strong className="text-ink">This PDF could not be rendered.</strong><p className="m-0 max-w-[430px] text-center">{loadError}</p></div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2.5 text-xs text-muted"><LoaderCircle className="animate-spin-slow" /><span>Preparing the document…</span></div>
            )}
            <SelectionBar />
          </section>
        </div>
          <ChatSidebar documentId={activeDocument.id} open={chatOpen} onClose={() => setChatOpen(false)} />
        </div>

        {toast && (
          <div className="fixed right-[18px] bottom-[18px] z-80 flex min-h-11 max-w-[380px] animate-toast-in items-center gap-3 rounded-xl bg-ink py-2.5 pr-[11px] pl-[15px] text-xs text-paper shadow-menu [&_button]:rounded-[7px] [&_button]:border-0 [&_button]:bg-paper [&_button]:px-2.5 [&_button]:py-1.5 [&_button]:text-[11px] [&_button]:font-[560] [&_button]:text-ink [&_button]:transition-transform [&_button]:duration-130 [&_button]:ease-spring [&_button]:active:scale-[.94]" role="status">
            <span>{toast}</span>
            {toast.includes('Undo') && <button type="button" onClick={() => void undo()}>Undo</button>}
          </div>
        )}

        <Dialog.Root open={exportOpen} onOpenChange={setExportOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className={dialogOverlayClass} />
            <Dialog.Content className={cn(dialogSurfaceClass, 'w-[min(520px,calc(100vw-32px))] p-6')} aria-describedby="export-description">
              <Dialog.Title className="m-0 font-display text-[22px] font-[620] tracking-[-.03em]">Take your work with you</Dialog.Title>
              <Dialog.Description className="mt-2 mb-5 text-[12.5px] text-muted" id="export-description">
                Export a readable PDF or the editable annotation source.
              </Dialog.Description>
              <div className="grid gap-2">
                <button type="button" className={cn('grid min-h-[78px] grid-cols-[46px_minmax(0,1fr)] items-center gap-3.5 rounded-[14px] border border-line bg-paper p-3 text-left transition-[border-color,background,transform] duration-150 ease-spring hover:border-line-strong hover:bg-surface active:scale-[.99]', exportFormat === 'pdf' && 'border-ink bg-paper shadow-[inset_0_0_0_1px_var(--color-ink)]')} onClick={() => setExportFormat('pdf')}>
                  <span className="grid h-[50px] w-[42px] place-items-center rounded-md bg-cream text-[9px] font-[640] tracking-[.04em] text-bark shadow-[inset_0_0_0_1px_oklch(.7_.03_72/.28)]">PDF</span>
                  <span><strong className="block text-[13px] font-[560]">Annotated PDF</strong><small className="mt-[5px] block text-[11px] leading-[1.45] text-muted">Marks drawn into the original pages. Notes include a comments appendix.</small></span>
                </button>
                <button type="button" className={cn('grid min-h-[78px] grid-cols-[46px_minmax(0,1fr)] items-center gap-3.5 rounded-[14px] border border-line bg-paper p-3 text-left transition-[border-color,background,transform] duration-150 ease-spring hover:border-line-strong hover:bg-surface active:scale-[.99]', exportFormat === 'json' && 'border-ink bg-paper shadow-[inset_0_0_0_1px_var(--color-ink)]')} onClick={() => setExportFormat('json')}>
                  <span className="grid size-[42px] place-items-center rounded-[11px] bg-cream text-xs font-[640] text-bark shadow-[inset_0_0_0_1px_oklch(.7_.03_72/.28)]">{'{ }'}</span>
                  <span><strong className="block text-[13px] font-[560]">Annotation sidecar</strong><small className="mt-[5px] block text-[11px] leading-[1.45] text-muted">Versioned JSON that remains editable by Mimir and browser agents.</small></span>
                </button>
              </div>
              {exportProgress !== null && <div className="mt-[15px] mb-[-5px] h-[3px] overflow-hidden rounded bg-sunken"><span className="block h-full rounded-[inherit] bg-ink transition-[width] duration-180" style={{ width: `${exportProgress * 100}%` }} /></div>}
              <div className="mt-5 flex items-center justify-end gap-2 max-[600px]:[&>button]:min-w-0 max-[600px]:[&>button]:px-[11px] max-[600px]:[&>button]:text-xs max-[600px]:[&>button]:whitespace-nowrap">
                <label className="relative mr-auto inline-flex h-9 items-center overflow-hidden rounded-[9px] px-2.5 text-xs font-[520] text-ink-soft transition-colors hover:bg-sunken [&_input]:absolute [&_input]:inset-0 [&_input]:opacity-0">
                  Import sidecar
                  <input type="file" accept="application/json,.json" onChange={(event) => void importAnnotations(event.target.files?.[0])} />
                </label>
                <Dialog.Close asChild><Button tone="paper">Cancel</Button></Dialog.Close>
                <Button disabled={exportProgress !== null} onClick={() => void saveExport()}>
                  {exportProgress !== null ? <LoaderCircle className="animate-spin-slow" size={16} /> : <DownloadIcon size={16} />}
                  {exportProgress !== null ? 'Preparing…' : `Save ${exportFormat.toUpperCase()}`}
                </Button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </main>
    </Tooltip.Provider>
  )
}
