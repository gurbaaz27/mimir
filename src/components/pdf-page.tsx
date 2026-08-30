import { useEffect, useRef, useState } from 'react'
import { TextLayer, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist'
import 'pdfjs-dist/web/pdf_viewer.css'
import { createAnnotationBase, type Annotation, type MarkupType } from '#/lib/annotations'
import { mergeTextQuads, textLayerAttribute } from '#/lib/annotation-geometry'
import { useEditorStore } from '#/lib/editor-store.client'
import { AnnotationOverlay } from './annotation-overlay'
import { NoteLayer } from './note-layer'
import { cn } from '#/lib/utils'

interface PdfPageProps {
  pdf: PDFDocumentProxy
  pageNumber: number
  zoom: number
  rotation: number
  annotations: Array<Annotation>
  onPageWidth?: (width: number) => void
}

export function PdfPage({ pdf, pageNumber, zoom, rotation, annotations, onPageWidth }: PdfPageProps) {
  const pageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const renderTaskRef = useRef<RenderTask | null>(null)
  const textLayerRef = useRef<TextLayer | null>(null)
  const [dimensions, setDimensions] = useState({ width: 612 * zoom, height: 792 * zoom })
  const [ready, setReady] = useState(false)
  const tool = useEditorStore((state) => state.tool)
  const color = useEditorStore((state) => state.color)
  const activeDocument = useEditorStore((state) => state.activeDocument)
  const createAnnotations = useEditorStore((state) => state.createAnnotations)
  const setCurrentPage = useEditorStore((state) => state.setCurrentPage)

  useEffect(() => {
    const element = pageRef.current
    if (!element) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && entry.intersectionRatio > 0.45) setCurrentPage(pageNumber)
      },
      { threshold: [0.45, 0.7] },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [pageNumber, setCurrentPage])

  useEffect(() => {
    let cancelled = false
    setReady(false)
    const render = async () => {
      const page = await pdf.getPage(pageNumber)
      if (cancelled) return
      const viewport = page.getViewport({ scale: zoom, rotation: page.rotate + rotation })
      setDimensions({ width: viewport.width, height: viewport.height })
      onPageWidth?.(viewport.width)
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const canvas = canvasRef.current
      const textContainer = textRef.current
      if (!canvas || !textContainer || cancelled) return
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(viewport.width * pixelRatio)
      canvas.height = Math.floor(viewport.height * pixelRatio)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      renderTaskRef.current?.cancel()
      renderTaskRef.current = page.render({
        canvas,
        viewport,
        transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
      })
      await renderTaskRef.current.promise.catch((error: unknown) => {
        if (!cancelled && error instanceof Error && error.name !== 'RenderingCancelledException') throw error
      })
      if (cancelled) return
      textLayerRef.current?.cancel()
      textContainer.replaceChildren()
      const content = await page.getTextContent()
      const textLayer = new TextLayer({ textContentSource: content, container: textContainer, viewport })
      textLayerRef.current = textLayer
      await textLayer.render()
      if (!cancelled) setReady(true)
    }
    void render()
    return () => {
      cancelled = true
      renderTaskRef.current?.cancel()
      textLayerRef.current?.cancel()
    }
  }, [pdf, pageNumber, rotation, zoom])

  const createTextMarkup = async () => {
    if (!['highlight', 'underline', 'strikeout'].includes(tool) || !activeDocument || !pageRef.current) return
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.rangeCount) return
    const range = selection.getRangeAt(0)
    if (!pageRef.current.contains(range.commonAncestorContainer)) return
    const pageRect = pageRef.current.getBoundingClientRect()
    const markup = tool as MarkupType
    const rawQuads = Array.from(range.getClientRects())
      .filter((rect) => rect.width > 1 && rect.height > 1)
      .map((rect) => ({
        x: (rect.left - pageRect.left) / pageRect.width,
        y: (rect.top - pageRect.top) / pageRect.height,
        width: rect.width / pageRect.width,
        height: rect.height / pageRect.height,
      }))
      .filter((quad) => quad.x >= 0 && quad.y >= 0 && quad.x + quad.width <= 1.01 && quad.y + quad.height <= 1.01)
    const quads = mergeTextQuads(rawQuads, markup !== 'highlight')
    const selectedText = selection.toString().trim()
    if (!quads.length || !selectedText) return
    const base = createAnnotationBase(activeDocument.id, pageNumber, 'human', {
      color,
      opacity: markup === 'highlight' ? 0.34 : 0.92,
      strokeWidth: 1.7,
    })
    await createAnnotations(
      [{ ...base, kind: 'markup', markup, selectedText, quoteAnchor: { quote: selectedText }, quads }],
      `Add ${markup}`,
    )
    selection.removeAllRanges()
  }

  return (
    <div
      ref={pageRef}
      className="relative mt-14 shrink-0 origin-top overflow-visible bg-paper shadow-page transition duration-160 ease-out [&>canvas]:absolute [&>canvas]:inset-0 [&>canvas]:block"
      data-page-number={pageNumber}
      style={{ width: dimensions.width, height: dimensions.height }}
      onPointerUp={() => void createTextMarkup()}
    >
      <canvas ref={canvasRef} aria-label={`Page ${pageNumber}`} />
      <div ref={textRef} {...{ [textLayerAttribute]: '' }} className="absolute inset-0 z-2 origin-top-left overflow-hidden leading-none [text-size-adjust:none] [&_span]:absolute [&_span]:origin-top-left [&_span]:cursor-text [&_span]:whitespace-pre [&_span]:text-transparent [&_::selection]:bg-[oklch(.82_.05_85/.7)]" />
      <AnnotationOverlay
        pageNumber={pageNumber}
        annotations={annotations}
        pageWidth={dimensions.width}
        pageHeight={dimensions.height}
        zoom={zoom}
      />
      <NoteLayer
        pageNumber={pageNumber}
        annotations={annotations}
        pageWidth={dimensions.width}
        pageHeight={dimensions.height}
        zoom={zoom}
      />
      {!ready && <div className={cn('absolute inset-0 z-4 bg-paper px-[11%] py-[10%] transition-opacity duration-180 [&_span]:mb-[3.4%] [&_span]:block [&_span]:h-[2.4%] [&_span]:w-4/5 [&_span]:animate-skeleton [&_span]:rounded [&_span]:bg-[oklch(.945_.003_85)] [&_span:nth-child(2)]:w-[64%] [&_span:nth-child(3)]:mt-[8%] [&_span:nth-child(3)]:w-[82%] [&_span:nth-child(4)]:w-[70%]', ready && 'pointer-events-none opacity-0')} aria-hidden="true"><span /><span /><span /><span /></div>}
      <span className="absolute top-3 left-[-36px] grid h-5 w-[26px] place-items-center rounded-md bg-[oklch(1_0_0/.5)] text-[10px] font-[540] text-bark tabular-nums max-[820px]:hidden" aria-hidden="true">{pageNumber}</span>
    </div>
  )
}
