import { useEffect, useRef, useState } from 'react'
import { TextLayer, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist'
import 'pdfjs-dist/web/pdf_viewer.css'
import { createAnnotationBase, type Annotation, type MarkupType } from '#/lib/annotations'
import { useEditorStore } from '#/lib/editor-store.client'
import { AnnotationOverlay } from './annotation-overlay'
import { NoteLayer } from './note-layer'

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
    const quads = Array.from(range.getClientRects())
      .filter((rect) => rect.width > 1 && rect.height > 1)
      .map((rect) => ({
        x: (rect.left - pageRect.left) / pageRect.width,
        y: (rect.top - pageRect.top) / pageRect.height,
        width: rect.width / pageRect.width,
        height: rect.height / pageRect.height,
      }))
      .filter((quad) => quad.x >= 0 && quad.y >= 0 && quad.x + quad.width <= 1.01 && quad.y + quad.height <= 1.01)
    const selectedText = selection.toString().trim()
    if (!quads.length || !selectedText) return
    const markup = tool as MarkupType
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
      className={`pdf-page ${ready ? 'is-ready' : ''}`}
      data-page-number={pageNumber}
      style={{ width: dimensions.width, height: dimensions.height }}
      onPointerUp={() => void createTextMarkup()}
    >
      <canvas ref={canvasRef} aria-label={`Page ${pageNumber}`} />
      <div ref={textRef} className="textLayer" />
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
      {!ready && <div className="page-skeleton" aria-hidden="true"><span /><span /><span /><span /></div>}
      <span className="page-number-badge" aria-hidden="true">{pageNumber}</span>
    </div>
  )
}
