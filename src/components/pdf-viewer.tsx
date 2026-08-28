import { useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Annotation } from '#/lib/annotations'
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
  const virtualizer = useVirtualizer({
    count: pageCount,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => 820 * zoom + 28,
    overscan: 1,
    gap: 28,
  })

  useEffect(() => {
    const navigate = (event: Event) => {
      const detail = (event as CustomEvent<{ pageNumber?: number }>).detail
      if (detail.pageNumber) virtualizer.scrollToIndex(detail.pageNumber - 1, { align: 'start' })
    }
    window.addEventListener('mimir:navigate', navigate)
    return () => window.removeEventListener('mimir:navigate', navigate)
  }, [virtualizer])

  return (
    <div ref={scrollerRef} className="document-scroller" data-testid="document-scroller">
      <div className="virtual-page-stack" style={{ height: virtualizer.getTotalSize() }}>
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
            />
          </div>
        ))}
      </div>
    </div>
  )
}
