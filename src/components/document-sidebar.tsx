import { useEffect, useRef, useState } from 'react'
import { Bookmark, ListTree, X } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { useEditorStore } from '#/lib/editor-store.client'

function Thumbnail({ pdf, pageNumber, active }: { pdf: PDFDocumentProxy; pageNumber: number; active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const taskRef = useRef<RenderTask | null>(null)
  useEffect(() => {
    let cancelled = false
    const render = async () => {
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 0.19, rotation: page.rotate })
      const canvas = canvasRef.current
      if (!canvas || cancelled) return
      canvas.width = Math.floor(viewport.width * 1.5)
      canvas.height = Math.floor(viewport.height * 1.5)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      taskRef.current = page.render({ canvas, viewport, transform: [1.5, 0, 0, 1.5, 0, 0] })
      await taskRef.current.promise.catch(() => undefined)
    }
    void render()
    return () => {
      cancelled = true
      taskRef.current?.cancel()
    }
  }, [pageNumber, pdf])
  return (
    <button
      type="button"
      className={`thumbnail-button ${active ? 'is-active' : ''}`}
      aria-label={`Go to page ${pageNumber}`}
      aria-current={active ? 'page' : undefined}
      onClick={() => window.dispatchEvent(new CustomEvent('mimir:navigate', { detail: { pageNumber } }))}
    >
      <span className="thumbnail-canvas"><canvas ref={canvasRef} /></span>
      <span>{pageNumber}</span>
    </button>
  )
}

export function DocumentSidebar({ pdf }: { pdf: PDFDocumentProxy }) {
  const currentPage = useEditorStore((state) => state.currentPage)
  const pageCount = useEditorStore((state) => state.activeDocument?.pageCount ?? 0)
  const setSidebarOpen = useEditorStore((state) => state.setSidebarOpen)
  const [tab, setTab] = useState<'pages' | 'outline'>('pages')
  const [outline, setOutline] = useState<Array<{ title: string; pageNumber?: number }>>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: pageCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 164,
    overscan: 2,
  })

  useEffect(() => {
    if (tab !== 'outline') return
    void pdf.getOutline().then(async (items) => {
      if (!items) return setOutline([])
      const entries = await Promise.all(
        items.map(async (item) => {
          let pageNumber: number | undefined
          try {
            const destination = typeof item.dest === 'string' ? await pdf.getDestination(item.dest) : item.dest
            const reference = destination?.[0]
            if (reference && typeof reference === 'object') pageNumber = (await pdf.getPageIndex(reference)) + 1
          } catch {
            pageNumber = undefined
          }
          return { title: item.title, pageNumber }
        }),
      )
      setOutline(entries)
    })
  }, [pdf, tab])

  useEffect(() => {
    if (tab === 'pages') virtualizer.scrollToIndex(Math.max(0, currentPage - 1), { align: 'auto' })
  }, [currentPage, tab, virtualizer])

  return (
    <aside className="document-sidebar" aria-label="Document navigation">
      <div className="sidebar-header">
        <div className="sidebar-tabs" role="tablist" aria-label="Navigation view">
          <button type="button" role="tab" aria-selected={tab === 'pages'} onClick={() => setTab('pages')}>
            <Bookmark size={15} /> Pages
          </button>
          <button type="button" role="tab" aria-selected={tab === 'outline'} onClick={() => setTab('outline')}>
            <ListTree size={15} /> Outline
          </button>
        </div>
        <button className="close-sidebar" type="button" aria-label="Close document navigation" onClick={() => setSidebarOpen(false)}>
          <X size={16} />
        </button>
      </div>
      {tab === 'pages' ? (
        <div ref={scrollRef} className="thumbnail-scroll">
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((item) => (
              <div
                key={item.key}
                ref={virtualizer.measureElement}
                data-index={item.index}
                className="thumbnail-item"
                style={{ transform: `translateY(${item.start}px)` }}
              >
                <Thumbnail pdf={pdf} pageNumber={item.index + 1} active={currentPage === item.index + 1} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <nav className="outline-list" aria-label="PDF outline">
          {outline.length ? (
            outline.map((item, index) => (
              <button
                type="button"
                key={`${item.title}-${index}`}
                disabled={!item.pageNumber}
                onClick={() => item.pageNumber && window.dispatchEvent(new CustomEvent('mimir:navigate', { detail: { pageNumber: item.pageNumber } }))}
              >
                <span>{item.title}</span>
                {item.pageNumber && <small>{item.pageNumber}</small>}
              </button>
            ))
          ) : (
            <div className="panel-empty compact"><ListTree size={22} /><p>This PDF has no outline.</p></div>
          )}
        </nav>
      )}
    </aside>
  )
}
