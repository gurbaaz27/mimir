import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Annotation } from '#/lib/annotations'
import { useEditorStore } from '#/lib/editor-store.client'
import { PdfPage } from './pdf-page'

interface PdfViewerProps {
  pdf: PDFDocumentProxy
  pageCount: number
  zoom: number
  rotation: number
  annotations: Array<Annotation>
}

export function PdfViewer({ pdf, pageCount, zoom, rotation, annotations }: PdfViewerProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const panRef = useRef<{ pointerId: number; clientX: number; clientY: number; scrollLeft: number; scrollTop: number } | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [maxPageWidth, setMaxPageWidth] = useState(612 * zoom)
  const tool = useEditorStore((state) => state.tool)
  const virtualizer = useVirtualizer({
    count: pageCount,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => 820 * zoom + 28,
    overscan: 1,
    gap: 28,
  })

  useEffect(() => {
    setMaxPageWidth(612 * zoom)
  }, [pdf, rotation, zoom])

  const reportPageWidth = (width: number) => {
    setMaxPageWidth((current) => Math.max(current, width))
  }

  useEffect(() => {
    const navigate = (event: Event) => {
      const detail = (event as CustomEvent<{ pageNumber?: number }>).detail
      if (detail.pageNumber) virtualizer.scrollToIndex(detail.pageNumber - 1, { align: 'start' })
    }
    window.addEventListener('mimir:navigate', navigate)
    return () => window.removeEventListener('mimir:navigate', navigate)
  }, [virtualizer])

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (tool !== 'pan' || event.button !== 0) return
    const scroller = event.currentTarget
    event.preventDefault()
    panRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      scrollLeft: scroller.scrollLeft,
      scrollTop: scroller.scrollTop,
    }
    scroller.setPointerCapture(event.pointerId)
    setIsPanning(true)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current
    if (!pan || pan.pointerId !== event.pointerId) return
    const scroller = event.currentTarget
    event.preventDefault()
    scroller.scrollLeft = pan.scrollLeft - (event.clientX - pan.clientX)
    scroller.scrollTop = pan.scrollTop - (event.clientY - pan.clientY)
  }

  const endPan = (event: PointerEvent<HTMLDivElement>) => {
    if (!panRef.current || panRef.current.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    panRef.current = null
    setIsPanning(false)
  }

  return (
    <div
      ref={scrollerRef}
      className={`document-scroller ${tool === 'pan' ? 'is-pan-enabled' : ''} ${isPanning ? 'is-panning' : ''}`}
      data-testid="document-scroller"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onLostPointerCapture={() => {
        panRef.current = null
        setIsPanning(false)
      }}
    >
      <div className="virtual-page-stack" style={{ height: virtualizer.getTotalSize(), minWidth: maxPageWidth }}>
        {virtualizer.getVirtualItems().map((item) => (
          <div
            key={item.key}
            ref={virtualizer.measureElement}
            data-index={item.index}
            className="virtual-page-item"
            style={{ transform: `translateY(${item.start}px)` }}
          >
            <PdfPage
              pdf={pdf}
              pageNumber={item.index + 1}
              zoom={zoom}
              rotation={rotation}
              annotations={annotations}
              onPageWidth={reportPageWidth}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
