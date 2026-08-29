import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import type { Annotation, NormalizedRect, Point } from '#/lib/annotations'
import { annotationBounds, annotationColors, createAnnotationBase } from '#/lib/annotations'
import {
  constrainDrawingEnd,
  constrainToAxis,
  resizeBounds,
  resizeHandleAnchors,
  resizeHandlePoint,
  sameRect,
  samePoint,
  type ResizeHandle,
} from '#/lib/annotation-geometry'
import { useEditorStore } from '#/lib/editor-store.client'

interface AnnotationOverlayProps {
  pageNumber: number
  annotations: Array<Annotation>
  pageWidth: number
  pageHeight: number
}

/** Handle sizes in CSS pixels; they are converted to page units so they neither stretch nor zoom. */
const HANDLE_PIXELS = 9
const HANDLE_HIT_PIXELS = 22
/** Below this, the mid-edge handles would overlap the corners, so they are dropped. */
const EDGE_HANDLE_MINIMUM_PIXELS = HANDLE_PIXELS * 3

function asPoint(event: { clientX: number; clientY: number }, svg: SVGSVGElement): Point {
  const rect = svg.getBoundingClientRect()
  return {
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
  }
}

function boundsBetween(start: Point, end: Point) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  }
}

type ResizeTarget = ResizeHandle | 'start' | 'end'

type ResizePreview = {
  id: string
  bounds?: NormalizedRect
  start?: Point
  end?: Point
}

/** A single grab point: a generous transparent hit area behind a small visible marker. */
function ResizeHandle({
  cursor,
  label,
  round,
  x,
  y,
  halfWidth,
  halfHeight,
  hitWidth,
  hitHeight,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  cursor: string
  label: string
  round: boolean
  x: number
  y: number
  halfWidth: number
  halfHeight: number
  hitWidth: number
  hitHeight: number
  onPointerDown: (event: PointerEvent<SVGGElement>) => void
  onPointerMove: (event: PointerEvent<SVGGElement>) => void
  onPointerUp: (event: PointerEvent<SVGGElement>) => void
}) {
  return (
    <g
      className="annotation-resize-handle"
      role="button"
      aria-label={label}
      style={{ cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <rect
        className="annotation-resize-hit"
        x={x - hitWidth}
        y={y - hitHeight}
        width={hitWidth * 2}
        height={hitHeight * 2}
      />
      {round ? (
        <ellipse className="annotation-resize-dot" cx={x} cy={y} rx={halfWidth} ry={halfHeight} />
      ) : (
        <rect
          className="annotation-resize-dot"
          x={x - halfWidth}
          y={y - halfHeight}
          width={halfWidth * 2}
          height={halfHeight * 2}
          rx={halfWidth * 0.35}
          ry={halfHeight * 0.35}
        />
      )}
    </g>
  )
}

function AnnotationGlyph({
  annotation,
  selected,
  editable,
  pageWidth,
  pageHeight,
  dragOffset,
  resizePreview,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
}: {
  annotation: Annotation
  selected: boolean
  editable: boolean
  pageWidth: number
  pageHeight: number
  dragOffset: { dx: number; dy: number } | null
  resizePreview: ResizePreview | null
  onPointerDown: (event: PointerEvent<SVGGElement>, id: string) => void
  onPointerMove: (event: PointerEvent<SVGGElement>) => void
  onPointerUp: (event: PointerEvent<SVGGElement>) => void
  onResizeStart: (event: PointerEvent<SVGGElement>, annotation: Annotation, handle: ResizeTarget) => void
  onResizeMove: (event: PointerEvent<SVGGElement>) => void
  onResizeEnd: (event: PointerEvent<SVGGElement>) => void
}) {
  const preview = resizePreview?.id === annotation.id ? resizePreview : null
  const displayedAnnotation = preview && annotation.kind === 'shape'
    ? { ...annotation, ...(preview.bounds ? { bounds: preview.bounds } : {}), ...(preview.start ? { start: preview.start } : {}), ...(preview.end ? { end: preview.end } : {}) }
    : annotation
  const bounds = annotationBounds(displayedAnnotation)
  const common = {
    stroke: annotation.style.color,
    opacity: annotation.style.opacity,
    vectorEffect: 'non-scaling-stroke' as const,
  }

  // The overlay is a 0..1 viewBox stretched over the page, so a circle drawn in
  // user units renders as an ellipse and grows with the zoom. Every handle
  // dimension is therefore expressed as a fraction of the current page size.
  const unitX = 1 / Math.max(pageWidth, 1)
  const unitY = 1 / Math.max(pageHeight, 1)
  const handleGeometry = {
    halfWidth: HANDLE_PIXELS / 2 * unitX,
    halfHeight: HANDLE_PIXELS / 2 * unitY,
    hitWidth: HANDLE_HIT_PIXELS / 2 * unitX,
    hitHeight: HANDLE_HIT_PIXELS / 2 * unitY,
  }

  const shapeBounds = displayedAnnotation.kind === 'shape' ? displayedAnnotation.bounds : undefined
  const wideEnough = (shapeBounds?.width ?? 0) * pageWidth >= EDGE_HANDLE_MINIMUM_PIXELS
  const tallEnough = (shapeBounds?.height ?? 0) * pageHeight >= EDGE_HANDLE_MINIMUM_PIXELS
  const shapeHandles = shapeBounds
    ? resizeHandleAnchors
        .filter((handle) => {
          if (handle.name === 'n' || handle.name === 's') return wideEnough
          if (handle.name === 'e' || handle.name === 'w') return tallEnough
          return true
        })
        .map((handle) => ({
          name: handle.name as ResizeTarget,
          cursor: handle.cursor,
          label: `Resize ${displayedAnnotation.kind === 'shape' ? displayedAnnotation.shape : 'shape'} from the ${handle.label}`,
          round: false,
          x: shapeBounds.x + shapeBounds.width * handle.x,
          y: shapeBounds.y + shapeBounds.height * handle.y,
        }))
    : []
  const endpointHandles = displayedAnnotation.kind === 'shape' && displayedAnnotation.start && displayedAnnotation.end
    ? ([
        { point: displayedAnnotation.start, name: 'start' as const, label: 'start' },
        { point: displayedAnnotation.end, name: 'end' as const, label: 'end' },
      ]).map((entry) => ({
        name: entry.name as ResizeTarget,
        cursor: 'move',
        label: `Move the ${entry.label} of the ${displayedAnnotation.shape}`,
        round: true,
        x: entry.point.x,
        y: entry.point.y,
      }))
    : []
  const handles = shapeBounds ? shapeHandles : endpointHandles
  const showHandles = editable && displayedAnnotation.kind === 'shape' && handles.length > 0

  // While the handles are shown they sit exactly on the frame, so the frame is
  // drawn tight to the bounds; otherwise it is inset by a hairline of padding.
  const padX = showHandles ? 0 : 4 * unitX
  const padY = showHandles ? 0 : 4 * unitY
  const frame = bounds && {
    x: Math.max(0, bounds.x - padX),
    y: Math.max(0, bounds.y - padY),
    width: Math.min(1, bounds.x + bounds.width + padX) - Math.max(0, bounds.x - padX),
    height: Math.min(1, bounds.y + bounds.height + padY) - Math.max(0, bounds.y - padY),
  }

  return (
    <g
      className={`annotation-glyph ${selected ? 'is-selected' : ''}`}
      data-annotation-id={annotation.id}
      transform={dragOffset ? `translate(${dragOffset.dx} ${dragOffset.dy})` : undefined}
      onPointerDown={(event) => onPointerDown(event, annotation.id)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {annotation.kind === 'markup' &&
        annotation.quads.map((quad, index) => {
          if (annotation.markup === 'highlight') {
            return <rect key={index} {...quad} fill={annotation.style.color} opacity={annotation.style.opacity} />
          }
          const y = annotation.markup === 'underline' ? quad.y + quad.height : quad.y + quad.height * 0.52
          return (
            <line
              key={index}
              x1={quad.x}
              x2={quad.x + quad.width}
              y1={y}
              y2={y}
              {...common}
              strokeWidth={annotation.style.strokeWidth ?? 1.8}
            />
          )
        })}
      {annotation.kind === 'ink' &&
        annotation.strokes.map((stroke, index) => (
          <polyline
            key={index}
            points={stroke.map((point) => `${point.x},${point.y}`).join(' ')}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            {...common}
            strokeWidth={annotation.style.strokeWidth ?? 2.5}
          />
        ))}
      {displayedAnnotation.kind === 'shape' && displayedAnnotation.bounds && displayedAnnotation.shape === 'ellipse' && (
        <ellipse
          cx={displayedAnnotation.bounds.x + displayedAnnotation.bounds.width / 2}
          cy={displayedAnnotation.bounds.y + displayedAnnotation.bounds.height / 2}
          rx={displayedAnnotation.bounds.width / 2}
          ry={displayedAnnotation.bounds.height / 2}
          fill={displayedAnnotation.style.fill ?? 'none'}
          {...common}
          strokeWidth={displayedAnnotation.style.strokeWidth ?? 2}
        />
      )}
      {displayedAnnotation.kind === 'shape' && displayedAnnotation.bounds && displayedAnnotation.shape === 'rectangle' && (
        <rect
          {...displayedAnnotation.bounds}
          fill={displayedAnnotation.style.fill ?? 'none'}
          {...common}
          strokeWidth={displayedAnnotation.style.strokeWidth ?? 2}
        />
      )}
      {displayedAnnotation.kind === 'shape' && displayedAnnotation.start && displayedAnnotation.end && (
        <line
          x1={displayedAnnotation.start.x}
          y1={displayedAnnotation.start.y}
          x2={displayedAnnotation.end.x}
          y2={displayedAnnotation.end.y}
          fill="none"
          {...common}
          strokeWidth={displayedAnnotation.style.strokeWidth ?? 2}
          markerEnd={displayedAnnotation.shape === 'arrow' ? `url(#arrow-${displayedAnnotation.id})` : undefined}
        />
      )}
      {displayedAnnotation.kind === 'shape' && displayedAnnotation.shape === 'arrow' && (
        <defs>
          <marker id={`arrow-${annotation.id}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L7,3 z" fill={annotation.style.color} />
          </marker>
        </defs>
      )}
      {selected && frame && (
        <rect
          className={`annotation-selection ${showHandles ? 'is-editable' : ''}`}
          {...frame}
          pathLength="1"
        />
      )}
      {showHandles && (
        <g className="annotation-resize-handles">
          {handles.map((handle) => (
            <ResizeHandle
              key={handle.name}
              cursor={handle.cursor}
              label={handle.label}
              round={handle.round}
              x={handle.x}
              y={handle.y}
              {...handleGeometry}
              onPointerDown={(event) => onResizeStart(event, annotation, handle.name)}
              onPointerMove={onResizeMove}
              onPointerUp={onResizeEnd}
            />
          ))}
        </g>
      )}
    </g>
  )
}

export function AnnotationOverlay({ pageNumber, annotations, pageWidth, pageHeight }: AnnotationOverlayProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const tool = useEditorStore((state) => state.tool)
  const color = useEditorStore((state) => state.color)
  const activeDocument = useEditorStore((state) => state.activeDocument)
  const selectedIds = useEditorStore((state) => state.selectedAnnotationIds)
  const annotationDrag = useEditorStore((state) => state.annotationDrag)
  const setSelected = useEditorStore((state) => state.setSelectedAnnotation)
  const setSelectedAnnotations = useEditorStore((state) => state.setSelectedAnnotations)
  const beginAnnotationDrag = useEditorStore((state) => state.beginAnnotationDrag)
  const updateAnnotationDrag = useEditorStore((state) => state.updateAnnotationDrag)
  const finishAnnotationDrag = useEditorStore((state) => state.finishAnnotationDrag)
  const updateAnnotation = useEditorStore((state) => state.updateAnnotation)
  const createAnnotations = useEditorStore((state) => state.createAnnotations)
  const startRef = useRef<Point | null>(null)
  const pointsRef = useRef<Array<Point>>([])
  const marqueeRef = useRef<{ pointerId: number; start: Point; moved: boolean } | null>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; ids: Array<string> } | null>(null)
  const resizeRef = useRef<{
    pointerId: number
    annotation: Extract<Annotation, { kind: 'shape' }>
    handle: ResizeTarget
    /** Where the handle sat, and where the pointer was, when the drag began. */
    grab: Point
    grabPointer: Point
    preview: ResizePreview
  } | null>(null)
  const [resizePreview, setResizePreview] = useState<ResizePreview | null>(null)
  const [draftEnd, setDraftEnd] = useState<Point | null>(null)
  const [selectionEnd, setSelectionEnd] = useState<Point | null>(null)
  const isDirectTool = ['ink', 'rectangle', 'ellipse', 'line', 'arrow', 'text', 'note'].includes(tool)
  const pageAnnotations = useMemo(
    () => annotations.filter((annotation) => annotation.pageNumber === pageNumber),
    [annotations, pageNumber],
  )
  const drawableAnnotations = useMemo(
    () => pageAnnotations.filter((annotation) => annotation.kind !== 'note' && annotation.kind !== 'text'),
    [pageAnnotations],
  )

  const constrainedEnd = (start: Point, end: Point, event: PointerEvent<SVGSVGElement>) => {
    if (tool !== 'rectangle' && tool !== 'ellipse' && tool !== 'arrow') return end
    const rect = event.currentTarget.getBoundingClientRect()
    return constrainDrawingEnd(start, end, tool, event.shiftKey, rect.width, rect.height)
  }

  const createAtPoint = async (point: Point) => {
    if (!activeDocument) return
    const style = { color, opacity: 0.95, strokeWidth: 2, fontSize: 12 }
    const base = createAnnotationBase(activeDocument.id, pageNumber, 'human', style)
    if (tool === 'note') {
      await createAnnotations([{ ...base, kind: 'note', point, body: '', resolved: false }], 'Add note')
    } else if (tool === 'text') {
      await createAnnotations(
        [{
          ...base,
          kind: 'text',
          bounds: { x: point.x, y: point.y, width: Math.min(0.3, 0.98 - point.x), height: 0.027 },
          body: '',
          alignment: 'left',
        }],
        'Add text',
      )
    }
  }

  const clampDragDelta = (ids: Array<string>, dx: number, dy: number) => {
    const selected = pageAnnotations.filter((annotation) => ids.includes(annotation.id))
    const bounds = selected.map(annotationBounds).filter((value): value is NonNullable<typeof value> => value !== null)
    if (!bounds.length) return { dx, dy }
    const minX = Math.min(...bounds.map((bound) => bound.x))
    const minY = Math.min(...bounds.map((bound) => bound.y))
    const maxX = Math.max(...bounds.map((bound) => bound.x + bound.width))
    const maxY = Math.max(...bounds.map((bound) => bound.y + bound.height))
    return {
      dx: Math.max(-minX, Math.min(1 - maxX, dx)),
      dy: Math.max(-minY, Math.min(1 - maxY, dy)),
    }
  }

  const endResize = (commit: boolean) => {
    const resize = resizeRef.current
    resizeRef.current = null
    setResizePreview(null)
    if (!resize || !commit) return
    const { annotation, preview } = resize
    // A click that never moved must not land an entry on the undo stack.
    if (preview.bounds) {
      if (sameRect(preview.bounds, annotation.bounds)) return
      void updateAnnotation(annotation.id, { bounds: preview.bounds } as Partial<Annotation>)
    } else if (preview.start && preview.end) {
      if (samePoint(preview.start, annotation.start) && samePoint(preview.end, annotation.end)) return
      void updateAnnotation(annotation.id, { start: preview.start, end: preview.end } as Partial<Annotation>)
    }
  }

  // A resize holds the pointer captured, so Escape is the only way out that
  // discards the drag instead of committing it.
  useEffect(() => {
    if (!resizePreview) return
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      resizeRef.current = null
      setResizePreview(null)
    }
    window.addEventListener('keydown', cancel)
    return () => window.removeEventListener('keydown', cancel)
  }, [resizePreview])

  const handleResizeStart = (
    event: PointerEvent<SVGGElement>,
    annotation: Annotation,
    handle: ResizeTarget,
  ) => {
    if (event.button !== 0 || annotation.kind !== 'shape') return
    const isEndpoint = handle === 'start' || handle === 'end'
    if (isEndpoint ? !(annotation.start && annotation.end) : !annotation.bounds) return
    const svg = svgRef.current
    if (!svg) return
    event.stopPropagation()
    event.preventDefault()
    setSelected(annotation.id)
    event.currentTarget.setPointerCapture(event.pointerId)
    const preview: ResizePreview = isEndpoint
      ? { id: annotation.id, start: annotation.start, end: annotation.end }
      : { id: annotation.id, bounds: annotation.bounds }
    const grab = isEndpoint
      ? (handle === 'start' ? annotation.start : annotation.end) ?? { x: 0, y: 0 }
      : resizeHandlePoint(annotation.bounds ?? { x: 0, y: 0, width: 0, height: 0 }, handle)
    resizeRef.current = { pointerId: event.pointerId, annotation, handle, grab, grabPointer: asPoint(event, svg), preview }
    setResizePreview(preview)
  }

  const handleResizeMove = (event: PointerEvent<SVGGElement>) => {
    const resize = resizeRef.current
    const svg = svgRef.current
    if (!resize || resize.pointerId !== event.pointerId || !svg) return
    event.stopPropagation()
    event.preventDefault()
    const { annotation, handle, grab } = resize
    // Track the pointer as an offset from where the handle was grabbed rather
    // than snapping the edge to the cursor.
    const pointer = asPoint(event, svg)
    const target = {
      x: Math.max(0, Math.min(1, grab.x + (pointer.x - resize.grabPointer.x))),
      y: Math.max(0, Math.min(1, grab.y + (pointer.y - resize.grabPointer.y))),
    }
    let preview: ResizePreview
    if (handle === 'start' || handle === 'end') {
      const pinned = handle === 'start' ? annotation.end : annotation.start
      if (!pinned) return
      const moved = event.shiftKey ? constrainToAxis(pinned, target, pageWidth, pageHeight) : target
      preview = {
        id: annotation.id,
        start: handle === 'start' ? moved : annotation.start,
        end: handle === 'end' ? moved : annotation.end,
      }
    } else if (annotation.bounds) {
      preview = {
        id: annotation.id,
        bounds: resizeBounds(annotation.bounds, handle, target, pageWidth, pageHeight, event.shiftKey),
      }
    } else {
      return
    }
    resize.preview = preview
    setResizePreview(preview)
  }

  const handleResizeEnd = (event: PointerEvent<SVGGElement>) => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    event.stopPropagation()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    endResize(event.type !== 'pointercancel')
  }

  const handleAnnotationPointerDown = (event: PointerEvent<SVGGElement>, id: string) => {
    event.stopPropagation()
    if (tool !== 'select') {
      setSelected(id)
      return
    }
    const ids = selectedIds.includes(id) ? selectedIds : [id]
    if (!selectedIds.includes(id)) setSelectedAnnotations([id])
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, ids }
    beginAnnotationDrag(ids)
  }

  const handleAnnotationPointerMove = (event: PointerEvent<SVGGElement>) => {
    const drag = dragRef.current
    const svg = svgRef.current
    if (!drag || drag.pointerId !== event.pointerId || !svg) return
    const rect = svg.getBoundingClientRect()
    const next = clampDragDelta(drag.ids, (event.clientX - drag.startX) / rect.width, (event.clientY - drag.startY) / rect.height)
    event.preventDefault()
    updateAnnotationDrag(next.dx, next.dy)
  }

  const handleAnnotationPointerUp = (event: PointerEvent<SVGGElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    void finishAnnotationDrag()
  }

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (tool === 'select') {
      const svg = event.currentTarget
      const start = asPoint(event, svg)
      event.preventDefault()
      svg.setPointerCapture(event.pointerId)
      marqueeRef.current = { pointerId: event.pointerId, start, moved: false }
      setSelectionEnd(start)
      return
    }
    if (!isDirectTool) return
    const point = asPoint(event, event.currentTarget)
    if (tool === 'note' || tool === 'text') {
      void createAtPoint(point)
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    startRef.current = point
    pointsRef.current = [point]
    setDraftEnd(constrainedEnd(point, point, event))
  }

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const marquee = marqueeRef.current
    if (marquee?.pointerId === event.pointerId) {
      const point = asPoint(event, event.currentTarget)
      if (Math.abs(point.x - marquee.start.x) > 0.002 || Math.abs(point.y - marquee.start.y) > 0.002) marquee.moved = true
      setSelectionEnd(point)
      return
    }
    if (!startRef.current) return
    const point = asPoint(event, event.currentTarget)
    if (tool === 'ink') pointsRef.current.push(point)
    setDraftEnd(constrainedEnd(startRef.current, point, event))
  }

  const handlePointerUp = async (event: PointerEvent<SVGSVGElement>) => {
    const marquee = marqueeRef.current
    if (marquee?.pointerId === event.pointerId) {
      const end = asPoint(event, event.currentTarget)
      const selection = boundsBetween(marquee.start, end)
      marqueeRef.current = null
      setSelectionEnd(null)
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      if (!marquee.moved) {
        setSelected(null)
        return
      }
      const selected = pageAnnotations
        .filter((annotation) => {
          const bounds = annotationBounds(annotation)
          return bounds && bounds.x >= selection.x && bounds.y >= selection.y &&
            bounds.x + bounds.width <= selection.x + selection.width &&
            bounds.y + bounds.height <= selection.y + selection.height
        })
        .map((annotation) => annotation.id)
      setSelectedAnnotations(selected)
      return
    }

    const start = startRef.current
    const pointer = asPoint(event, event.currentTarget)
    const end = start ? constrainedEnd(start, pointer, event) : pointer
    startRef.current = null
    setDraftEnd(null)
    if (!start || !activeDocument) return
    const style = { color, opacity: 0.92, strokeWidth: tool === 'ink' ? 2.4 : 2 }
    const base = createAnnotationBase(activeDocument.id, pageNumber, 'human', style)
    if (tool === 'ink' && pointsRef.current.length > 1) {
      await createAnnotations([{ ...base, kind: 'ink', strokes: [pointsRef.current] }], 'Draw ink')
    } else if (['rectangle', 'ellipse'].includes(tool)) {
      const bounds = boundsBetween(start, end)
      if (bounds.width > 0.004 && bounds.height > 0.004) {
        await createAnnotations([{ ...base, kind: 'shape', shape: tool as 'rectangle' | 'ellipse', bounds }], `Add ${tool}`)
      }
    } else if (['line', 'arrow'].includes(tool)) {
      await createAnnotations([{ ...base, kind: 'shape', shape: tool as 'line' | 'arrow', start, end }], `Add ${tool}`)
    }
    pointsRef.current = []
  }

  const draftBounds = startRef.current && draftEnd ? boundsBetween(startRef.current, draftEnd) : null
  const selectionBounds = marqueeRef.current && selectionEnd ? boundsBetween(marqueeRef.current.start, selectionEnd) : null

  return (
    <svg
      ref={svgRef}
      className={`annotation-layer ${isDirectTool ? 'is-drawing' : ''} ${tool === 'select' ? 'is-selecting' : ''}`}
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => void handlePointerUp(event)}
      onPointerCancel={(event) => void handlePointerUp(event)}
    >
      {drawableAnnotations.map((annotation) => (
        <AnnotationGlyph
          key={annotation.id}
          annotation={annotation}
          selected={selectedIds.includes(annotation.id)}
          editable={tool === 'select' && selectedIds.length === 1 && selectedIds.includes(annotation.id) && !annotationDrag}
          pageWidth={pageWidth}
          pageHeight={pageHeight}
          dragOffset={annotationDrag?.ids.includes(annotation.id) ? annotationDrag : null}
          resizePreview={resizePreview}
          onPointerDown={handleAnnotationPointerDown}
          onPointerMove={handleAnnotationPointerMove}
          onPointerUp={handleAnnotationPointerUp}
          onResizeStart={handleResizeStart}
          onResizeMove={handleResizeMove}
          onResizeEnd={handleResizeEnd}
        />
      ))}
      {selectionBounds && <rect className="annotation-marquee" {...selectionBounds} />}
      {draftBounds && (tool === 'rectangle' || tool === 'ellipse') &&
        (tool === 'rectangle' ? (
          <rect className="annotation-draft" {...draftBounds} stroke={color} />
        ) : (
          <ellipse
            className="annotation-draft"
            cx={draftBounds.x + draftBounds.width / 2}
            cy={draftBounds.y + draftBounds.height / 2}
            rx={draftBounds.width / 2}
            ry={draftBounds.height / 2}
            stroke={color}
          />
        ))}
      {startRef.current && draftEnd && (tool === 'line' || tool === 'arrow') && (
        <line
          className="annotation-draft"
          x1={startRef.current.x}
          y1={startRef.current.y}
          x2={draftEnd.x}
          y2={draftEnd.y}
          stroke={color}
        />
      )}
      {tool === 'ink' && pointsRef.current.length > 1 && (
        <polyline className="annotation-draft" points={pointsRef.current.map((point) => `${point.x},${point.y}`).join(' ')} stroke={color} />
      )}
    </svg>
  )
}

export { annotationColors }
