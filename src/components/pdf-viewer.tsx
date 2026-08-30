import { useCallback, useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Annotation } from '#/lib/annotations'
import { editorStore, useEditorStore } from '#/lib/editor-store.client'
import { PdfPage } from './pdf-page'
import { cn } from '#/lib/utils'

const LARGE_PAGE_JUMP = 5
const MIN_ZOOM = 0.5
const MAX_ZOOM = 3
const ZOOM_STEP = 0.05

type Point = { clientX: number; clientY: number }

type ZoomAnchor = {
  initialZoom: number
  contentX: number
  contentY: number
}

type PinchState = ZoomAnchor & {
  initialDistance: number
}

function distanceBetween(first: Point, second: Point) {
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY)
}

function midpoint(first: Point, second: Point): Point {
  return {
    clientX: (first.clientX + second.clientX) / 2,
    clientY: (first.clientY + second.clientY) / 2,
  }
}

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
  const touchPointersRef = useRef(new Map<number, Point>())
  const pinchRef = useRef<PinchState | null>(null)
  const gestureRef = useRef<ZoomAnchor | null>(null)
  const zoomFrameRef = useRef<number | null>(null)
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
    const unsubscribe = editorStore.subscribe((state, previousState) => {
      if (previousState.tool !== 'pan' || state.tool === 'pan') return
      const scroller = scrollerRef.current
      const pointerId = panRef.current?.pointerId
      if (scroller && pointerId !== undefined && scroller.hasPointerCapture(pointerId)) {
        scroller.releasePointerCapture(pointerId)
      }
      panRef.current = null
      setIsPanning(false)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    setMaxPageWidth(612 * zoom)
  }, [pdf, rotation, zoom])

  const reportPageWidth = (width: number) => {
    setMaxPageWidth((current) => Math.max(current, width))
  }

  const createZoomAnchor = useCallback((clientX: number, clientY: number): ZoomAnchor | null => {
    const scroller = scrollerRef.current
    if (!scroller) return null
    const rect = scroller.getBoundingClientRect()
    return {
      initialZoom: editorStore.getState().zoom,
      contentX: scroller.scrollLeft + clientX - rect.left,
      contentY: scroller.scrollTop + clientY - rect.top,
    }
  }, [])

  const applyZoomFromAnchor = useCallback((requestedZoom: number, anchor: ZoomAnchor, clientX: number, clientY: number) => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const nextZoom = Math.max(
      MIN_ZOOM,
      Math.min(MAX_ZOOM, Math.round(requestedZoom / ZOOM_STEP) * ZOOM_STEP),
    )
    if (editorStore.getState().zoom !== nextZoom) editorStore.getState().setZoom(nextZoom)

    if (zoomFrameRef.current !== null) cancelAnimationFrame(zoomFrameRef.current)
    zoomFrameRef.current = requestAnimationFrame(() => {
      zoomFrameRef.current = null
      const currentScroller = scrollerRef.current
      if (!currentScroller) return
      const rect = currentScroller.getBoundingClientRect()
      const scale = nextZoom / anchor.initialZoom
      currentScroller.scrollLeft = anchor.contentX * scale - (clientX - rect.left)
      currentScroller.scrollTop = anchor.contentY * scale - (clientY - rect.top)
    })
  }, [])

  const zoomAtPoint = useCallback((requestedZoom: number, clientX: number, clientY: number) => {
    const anchor = createZoomAnchor(clientX, clientY)
    if (anchor) applyZoomFromAnchor(requestedZoom, anchor, clientX, clientY)
  }, [applyZoomFromAnchor, createZoomAnchor])

  useEffect(() => {
    const navigate = (event: Event) => {
      const detail = (event as CustomEvent<{ pageNumber?: number }>).detail
      if (detail.pageNumber) {
        const distance = Math.abs(detail.pageNumber - editorStore.getState().currentPage)
        virtualizer.scrollToIndex(detail.pageNumber - 1, {
          align: 'start',
          behavior: distance > LARGE_PAGE_JUMP ? 'auto' : 'smooth',
        })
      }
    }
    window.addEventListener('mimir:navigate', navigate)
    return () => window.removeEventListener('mimir:navigate', navigate)
  }, [virtualizer])

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') {
      const pointers = touchPointersRef.current
      pointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY })
      if (pointers.size === 2) {
        const [first, second] = [...pointers.values()]
        if (!first || !second) return
        const center = midpoint(first, second)
        const anchor = createZoomAnchor(center.clientX, center.clientY)
        if (!anchor) return
        event.preventDefault()
        const pan = panRef.current
        if (pan && event.currentTarget.hasPointerCapture(pan.pointerId)) {
          event.currentTarget.releasePointerCapture(pan.pointerId)
        }
        panRef.current = null
        setIsPanning(false)
        pinchRef.current = {
          ...anchor,
          initialDistance: Math.max(distanceBetween(first, second), 1),
        }
        event.currentTarget.setPointerCapture(event.pointerId)
        return
      }
    }

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
    if (event.pointerType === 'touch') {
      const pointers = touchPointersRef.current
      if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY })
      const pinch = pinchRef.current
      if (pinch && pointers.size >= 2) {
        const [first, second] = [...pointers.values()]
        if (!first || !second) return
        event.preventDefault()
        const center = midpoint(first, second)
        const scale = distanceBetween(first, second) / pinch.initialDistance
        applyZoomFromAnchor(pinch.initialZoom * scale, pinch, center.clientX, center.clientY)
        return
      }
    }

    const pan = panRef.current
    if (!pan || pan.pointerId !== event.pointerId) return
    if (editorStore.getState().tool !== 'pan') return
    const scroller = event.currentTarget
    event.preventDefault()
    scroller.scrollLeft = pan.scrollLeft - (event.clientX - pan.clientX)
    scroller.scrollTop = pan.scrollTop - (event.clientY - pan.clientY)
  }

  const endPan = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') {
      touchPointersRef.current.delete(event.pointerId)
      if (touchPointersRef.current.size < 2) pinchRef.current = null
    }
    if (!panRef.current || panRef.current.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    panRef.current = null
    setIsPanning(false)
  }

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    // Chromium and Firefox expose a trackpad pinch as a ctrl+wheel gesture.
    if (!event.ctrlKey) return
    event.preventDefault()
    const currentZoom = editorStore.getState().zoom
    zoomAtPoint(currentZoom * Math.exp(-event.deltaY * 0.01), event.clientX, event.clientY)
  }

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return

    // Safari exposes trackpad pinch through GestureEvents rather than wheel events.
    const beginGesture = (event: Event) => {
      event.preventDefault()
      const gesture = event as Event & { clientX?: number; clientY?: number }
      const rect = scroller.getBoundingClientRect()
      const clientX = gesture.clientX || rect.left + rect.width / 2
      const clientY = gesture.clientY || rect.top + rect.height / 2
      const anchor = createZoomAnchor(clientX, clientY)
      if (anchor) gestureRef.current = anchor
    }
    const changeGesture = (event: Event) => {
      event.preventDefault()
      const gesture = event as Event & { scale?: number; clientX?: number; clientY?: number }
      const anchor = gestureRef.current
      if (!anchor || !gesture.scale) return
      const rect = scroller.getBoundingClientRect()
      const clientX = gesture.clientX || rect.left + rect.width / 2
      const clientY = gesture.clientY || rect.top + rect.height / 2
      applyZoomFromAnchor(anchor.initialZoom * gesture.scale, anchor, clientX, clientY)
    }
    const endGesture = () => {
      gestureRef.current = null
    }
    const options: AddEventListenerOptions = { passive: false }
    scroller.addEventListener('gesturestart', beginGesture, options)
    scroller.addEventListener('gesturechange', changeGesture, options)
    scroller.addEventListener('gestureend', endGesture)
    return () => {
      scroller.removeEventListener('gesturestart', beginGesture)
      scroller.removeEventListener('gesturechange', changeGesture)
      scroller.removeEventListener('gestureend', endGesture)
    }
  }, [applyZoomFromAnchor, createZoomAnchor])

  useEffect(() => () => {
    if (zoomFrameRef.current !== null) cancelAnimationFrame(zoomFrameRef.current)
  }, [])

  return (
    <div
      ref={scrollerRef}
      className={cn(
        'h-full w-full touch-pan-x touch-pan-y overflow-auto overscroll-contain [scrollbar-gutter:stable]',
        tool === 'pan' && 'cursor-grab',
        isPanning && 'cursor-grabbing scroll-auto select-none',
      )}
      data-testid="document-scroller"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onWheel={handleWheel}
      onLostPointerCapture={() => {
        panRef.current = null
        setIsPanning(false)
      }}
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize(), minWidth: maxPageWidth }}>
        {virtualizer.getVirtualItems().map((item) => (
          <div
            key={item.key}
            ref={virtualizer.measureElement}
            data-index={item.index}
            className="absolute top-0 left-0 flex w-full justify-center"
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
