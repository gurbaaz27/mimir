import { useEffect, useRef, useState } from 'react'
import { BookTextIcon, BookmarkIcon, PanelLeftCloseIcon } from '#/components/icons'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { useEditorStore } from '#/lib/editor-store.client'
import { cn } from '#/lib/utils'

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
      className={cn(
        'flex min-h-[142px] w-[146px] flex-col items-center gap-2 rounded-[10px] border border-transparent bg-transparent p-1.5 transition-[background,border-color] duration-150 hover:bg-surface [&>span:last-child]:text-[10px] [&>span:last-child]:text-muted [&>span:last-child]:tabular-nums',
        active && 'border-clay bg-cream [&>span:last-child]:font-[560] [&>span:last-child]:text-bark',
      )}
      aria-label={`Go to page ${pageNumber}`}
      aria-current={active ? 'page' : undefined}
      onClick={() => window.dispatchEvent(new CustomEvent('mimir:navigate', { detail: { pageNumber } }))}
    >
      <span className="grid h-30 min-w-[104px] place-items-center overflow-hidden bg-paper shadow-[0_0_0_1px_oklch(.2_.005_60/.07),0_2px_8px_oklch(.2_.005_60/.1)] [&_canvas]:block [&_canvas]:max-h-30 [&_canvas]:max-w-28"><canvas ref={canvasRef} /></span>
      <span>{pageNumber}</span>
    </button>
  )
}

export function DocumentSidebar({ pdf, open }: { pdf: PDFDocumentProxy; open: boolean }) {
  const currentPage = useEditorStore((state) => state.currentPage)
  const pageCount = useEditorStore((state) => state.activeDocument?.pageCount ?? 0)
  const setSidebarOpen = useEditorStore((state) => state.setSidebarOpen)
  const outline = useEditorStore((state) => state.outline)
  const loadOutline = useEditorStore((state) => state.loadOutline)
  const [tab, setTab] = useState<'pages' | 'outline'>('pages')
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: pageCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 164,
    overscan: 2,
  })

  useEffect(() => {
    if (tab !== 'outline') return
    void loadOutline(pdf)
  }, [loadOutline, pdf, tab])

  useEffect(() => {
    if (tab === 'pages') virtualizer.scrollToIndex(Math.max(0, currentPage - 1), { align: 'auto' })
  }, [currentPage, tab, virtualizer])

  return (
    <aside className={cn(
      'min-h-0 min-w-0 overflow-hidden bg-paper shadow-[inset_-1px_0_0_var(--color-desk-deep)] [&>*]:min-w-[228px]',
      'max-[820px]:absolute max-[820px]:inset-y-0 max-[820px]:left-0 max-[820px]:z-12 max-[820px]:w-[min(290px,82vw)] max-[820px]:-translate-x-[101%] max-[820px]:shadow-menu max-[820px]:transition-transform max-[820px]:duration-280 max-[820px]:ease-spring max-[820px]:[&>*]:min-w-0',
      open && 'max-[820px]:translate-x-0',
    )} aria-label="Document navigation" inert={!open}>
      <div className="flex h-11 items-center gap-[3px] border-b border-line p-1.5">
        <div className="flex h-8 min-w-0 flex-1 gap-[3px] [&_button]:inline-flex [&_button]:flex-1 [&_button]:items-center [&_button]:justify-center [&_button]:gap-1.5 [&_button]:rounded-lg [&_button]:border-0 [&_button]:bg-transparent [&_button]:text-[11px] [&_button]:text-muted [&_button]:transition-[background,color,transform] [&_button]:duration-150 [&_button]:ease-spring [&_button]:hover:text-ink-soft [&_button]:active:scale-95 [&_button[aria-selected=true]]:bg-sunken [&_button[aria-selected=true]]:font-[540] [&_button[aria-selected=true]]:text-ink" role="tablist" aria-label="Navigation view">
          <button type="button" role="tab" aria-selected={tab === 'pages'} onClick={() => setTab('pages')}>
            <BookmarkIcon size={15} /> Pages
          </button>
          <button type="button" role="tab" aria-selected={tab === 'outline'} onClick={() => setTab('outline')}>
            <BookTextIcon size={15} /> Outline
          </button>
        </div>
        <button className="grid size-[30px] shrink-0 place-items-center rounded-lg border-0 bg-transparent p-0 text-muted transition-[background,color,transform] duration-150 ease-spring hover:bg-sunken hover:text-ink active:scale-90" type="button" aria-label="Close document navigation" onClick={() => setSidebarOpen(false)}>
          <PanelLeftCloseIcon size={17} />
        </button>
      </div>
      {tab === 'pages' ? (
        <div ref={scrollRef} className="h-[calc(100%-44px)] overflow-auto">
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((item) => (
              <div
                key={item.key}
                ref={virtualizer.measureElement}
                data-index={item.index}
                className="absolute top-0 left-0 flex w-full justify-center px-2.5 pt-[13px] pb-[9px]"
                style={{ transform: `translateY(${item.start}px)` }}
              >
                <Thumbnail pdf={pdf} pageNumber={item.index + 1} active={currentPage === item.index + 1} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <nav className="h-[calc(100%-44px)] overflow-auto p-2 [&>button]:flex [&>button]:min-h-9 [&>button]:w-full [&>button]:items-center [&>button]:justify-between [&>button]:gap-2 [&>button]:rounded-lg [&>button]:border-0 [&>button]:bg-transparent [&>button]:px-[9px] [&>button]:py-[7px] [&>button]:text-left [&>button]:text-[11px] [&>button]:text-ink-soft [&>button]:transition-colors [&>button]:duration-150 [&>button]:enabled:hover:bg-surface [&>button]:enabled:hover:text-ink [&>button_span]:overflow-hidden [&>button_span]:text-ellipsis [&>button_small]:text-[10px] [&>button_small]:text-faint [&>button_small]:tabular-nums" aria-label="PDF outline">
          {outline?.length ? (
            outline.map((item, index) => (
              <button
                type="button"
                key={`${item.title}-${index}`}
                disabled={!item.pageNumber}
                style={item.level ? { paddingInlineStart: `${12 + item.level * 12}px` } : undefined}
                onClick={() => item.pageNumber && window.dispatchEvent(new CustomEvent('mimir:navigate', { detail: { pageNumber: item.pageNumber } }))}
              >
                <span>{item.title}</span>
                {item.pageNumber && <small>{item.pageNumber}</small>}
              </button>
            ))
          ) : outline ? (
            <div className="flex h-full min-h-50 flex-col items-center justify-center px-6 py-[34px] text-center text-muted [&_svg]:text-faint [&_p]:mt-2.5 [&_p]:mb-0 [&_p]:max-w-[215px] [&_p]:text-[11px] [&_p]:leading-[1.55] [&_p]:text-pretty"><BookTextIcon size={22} /><p>This PDF has no outline.</p></div>
          ) : (
            <div className="flex h-full min-h-50 flex-col items-center justify-center px-6 py-[34px] text-center text-muted [&_svg]:text-faint [&_p]:mt-2.5 [&_p]:mb-0 [&_p]:max-w-[215px] [&_p]:text-[11px] [&_p]:leading-[1.55] [&_p]:text-pretty"><BookTextIcon size={22} /><p>Reading the outline…</p></div>
          )}
        </nav>
      )}
    </aside>
  )
}
