import { useMemo, useRef, useState, type PointerEvent } from 'react'
import type { Annotation, Point } from '#/lib/annotations'
import { annotationBounds, annotationColors, createAnnotationBase } from '#/lib/annotations'
import {
  constrainDrawingEnd,
  defaultNoteSizePx,
  mergeTextQuads,
  resizeRectFromHandle,
  type ResizeHandle,
} from '#/lib/annotation-geometry'
import { useEditorStore } from '#/lib/editor-store.client'
import { EndpointHandles, ResizeHandles } from './annotation-resize-handles'

interface AnnotationOverlayProps {
  pageNumber: number
  annotations: Array<Annotation>
  pageWidth: number
  pageHeight: number
  zoom: number
}

type ShapeAnnotation = Extract<Annotation, { kind: 'shape' }>
type TransformOperation =
  | { kind: 'resize'; handle: ResizeHandle }
  | { kind: 'endpoint'; endpoint: 'start' | 'end' }

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

function AnnotationGlyph({
  annotation,
  selected,
  dragOffset,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  annotation: Annotation
  selected: boolean
  dragOffset: { dx: number; dy: number } | null
  onPointerDown: (event: PointerEvent<SVGGElement>, id: string) => void
  onPointerMove: (event: PointerEvent<SVGGElement>) => void
  onPointerUp: (event: PointerEvent<SVGGElement>) => void
}) {
  const bounds = annotationBounds(annotation)
  const common = {
    stroke: annotation.style.color,
    opacity: annotation.style.opacity,
    vectorEffect: 'non-scaling-stroke' as const,
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
        mergeTextQuads(annotation.quads, annotation.markup !== 'highlight').map((quad, index) => {
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
      {annotation.kind === 'shape' && annotation.bounds && annotation.shape === 'ellipse' && (
        <ellipse
          cx={annotation.bounds.x + annotation.bounds.width / 2}
          cy={annotation.bounds.y + annotation.bounds.height / 2}
          rx={annotation.bounds.width / 2}
          ry={annotation.bounds.height / 2}
          fill={annotation.style.fill ?? 'none'}
          {...common}
          strokeWidth={annotation.style.strokeWidth ?? 2}
        />
      )}
      {annotation.kind === 'shape' && annotation.bounds && annotation.shape === 'rectangle' && (
        <rect
          {...annotation.bounds}
          fill={annotation.style.fill ?? 'none'}
          {...common}
          strokeWidth={annotation.style.strokeWidth ?? 2}
        />
      )}
      {annotation.kind === 'shape' && annotation.start && annotation.end && (
        <line
          x1={annotation.start.x}
          y1={annotation.start.y}
          x2={annotation.end.x}
          y2={annotation.end.y}
          fill="none"
          {...common}
          strokeWidth={annotation.style.strokeWidth ?? 2}
          markerEnd={annotation.shape === 'arrow' ? `url(#arrow-${annotation.id})` : undefined}
        />
      )}
      {annotation.kind === 'shape' && annotation.shape === 'arrow' && (
        <defs>
          <marker id={`arrow-${annotation.id}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L7,3 z" fill={annotation.style.color} />
          </marker>
        </defs>
      )}
      {selected && bounds && (
        <rect
          className="annotation-selection"
          x={bounds.x}
          y={bounds.y}
          width={bounds.width}
          height={bounds.height}
          pathLength="1"
        />
      )}
    </g>
  )
}

export function AnnotationOverlay({ pageNumber, annotations, pageWidth, pageHeight, zoom }: AnnotationOverlayProps) {
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
  const createAnnotations = useEditorStore((state) => state.createAnnotations)
  const updateAnnotation = useEditorStore((state) => state.updateAnnotation)
  const startRef = useRef<Point | null>(null)
  const pointsRef = useRef<Array<Point>>([])
  const marqueeRef = useRef<{ pointerId: number; start: Point; moved: boolean } | null>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; ids: Array<string> } | null>(null)
  const transformRef = useRef<{
    pointerId: number
    annotation: ShapeAnnotation
    operation: TransformOperation
    moved: boolean
  } | null>(null)
  const transformPreviewRef = useRef<ShapeAnnotation | null>(null)
  const [draftEnd, setDraftEnd] = useState<Point | null>(null)
  const [selectionEnd, setSelectionEnd] = useState<Point | null>(null)
  const [transformPreview, setTransformPreview] = useState<ShapeAnnotation | null>(null)
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
      const width = Math.min(1, defaultNoteSizePx.width * zoom / pageWidth)
      const height = Math.min(1, defaultNoteSizePx.height * zoom / pageHeight)
      const bounds = {
        x: Math.min(point.x, 1 - width),
        y: Math.min(point.y, 1 - height),
        width,
        height,
      }
      await createAnnotations([{ ...base, kind: 'note', point: { x: bounds.x, y: bounds.y }, bounds, body: '', resolved: false }], 'Add note')
    } else if (tool === 'text') {
      const width = Math.min(0.3, 1)
      const height = Math.min(0.027, 1)
      await createAnnotations(
        [{
          ...base,
          kind: 'text',
          bounds: { x: Math.min(point.x, 1 - width), y: Math.min(point.y, 1 - height), width, height },
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

  const beginTransform = (
    event: PointerEvent<HTMLButtonElement>,
    annotation: ShapeAnnotation,
    operation: TransformOperation,
  ) => {
    event.stopPropagation()
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    transformRef.current = { pointerId: event.pointerId, annotation, operation, moved: false }
    transformPreviewRef.current = annotation
    setTransformPreview(annotation)
  }

  const handleTransformMove = (event: PointerEvent<HTMLButtonElement>) => {
    const transform = transformRef.current
    const svg = svgRef.current
    if (!transform || transform.pointerId !== event.pointerId || !svg) return
    event.stopPropagation()
    event.preventDefault()
    const point = asPoint(event, svg)
    let next: ShapeAnnotation
    if (transform.operation.kind === 'resize' && transform.annotation.bounds) {
      next = {
        ...transform.annotation,
        bounds: resizeRectFromHandle(
          transform.annotation.bounds,
          transform.operation.handle,
          point,
          pageWidth,
          pageHeight,
          event.shiftKey,
        ),
      }
    } else if (transform.operation.kind === 'endpoint' && transform.annotation.start && transform.annotation.end) {
      const fixed = transform.operation.endpoint === 'start' ? transform.annotation.end : transform.annotation.start
      const nextPoint = constrainDrawingEnd(fixed, point, 'arrow', event.shiftKey, pageWidth, pageHeight)
      next = { ...transform.annotation, [transform.operation.endpoint]: nextPoint }
    } else {
      return
    }
    transform.moved = true
    transformPreviewRef.current = next
    setTransformPreview(next)
  }

  const handleTransformEnd = (event: PointerEvent<HTMLButtonElement>) => {
    const transform = transformRef.current
    if (!transform || transform.pointerId !== event.pointerId) return
    event.stopPropagation()
    transformRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    const preview = transformPreviewRef.current
    if (!preview || !transform.moved) {
      transformPreviewRef.current = null
      setTransformPreview(null)
      return
    }
    const patch = preview.bounds
      ? { bounds: preview.bounds }
      : { start: preview.start, end: preview.end }
    void updateAnnotation(preview.id, patch).finally(() => {
      transformPreviewRef.current = null
      setTransformPreview(null)
    })
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
    <>
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
      {drawableAnnotations.map((annotation) => {
        const displayedAnnotation = transformPreview?.id === annotation.id ? transformPreview : annotation
        return (
          <AnnotationGlyph
            key={annotation.id}
            annotation={displayedAnnotation}
            selected={selectedIds.includes(annotation.id)}
            dragOffset={annotationDrag?.ids.includes(annotation.id) ? annotationDrag : null}
            onPointerDown={handleAnnotationPointerDown}
            onPointerMove={handleAnnotationPointerMove}
            onPointerUp={handleAnnotationPointerUp}
          />
        )
      })}
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
    {tool === 'select' && selectedIds.length === 1 && drawableAnnotations.map((annotation) => {
      if (annotation.id !== selectedIds[0] || annotation.kind !== 'shape') return null
      const displayedAnnotation = transformPreview?.id === annotation.id ? transformPreview : annotation
      if (displayedAnnotation.bounds) {
        return (
          <div key={annotation.id} className="annotation-transform-layer">
            <ResizeHandles
              bounds={displayedAnnotation.bounds}
              coordinateSpace="page"
              onPointerDown={(event, handle) => beginTransform(event, annotation, { kind: 'resize', handle })}
              onPointerMove={handleTransformMove}
              onPointerUp={handleTransformEnd}
            />
          </div>
        )
      }
      if (displayedAnnotation.start && displayedAnnotation.end) {
        return (
          <div key={annotation.id} className="annotation-transform-layer">
            <EndpointHandles
              start={displayedAnnotation.start}
              end={displayedAnnotation.end}
              onPointerDown={(event, endpoint) => beginTransform(event, annotation, { kind: 'endpoint', endpoint })}
              onPointerMove={handleTransformMove}
              onPointerUp={handleTransformEnd}
            />
          </div>
        )
      }
      return null
    })}
    </>
  )
}

export { annotationColors }
