import { useMemo, useRef, useState, type PointerEvent } from 'react'
import type { Annotation, Point } from '#/lib/annotations'
import { annotationBounds, annotationColors, createAnnotationBase } from '#/lib/annotations'
import { useEditorStore } from '#/lib/editor-store.client'

interface AnnotationOverlayProps {
  pageNumber: number
  annotations: Array<Annotation>
}

function asPoint(event: PointerEvent<SVGSVGElement>): Point {
  const rect = event.currentTarget.getBoundingClientRect()
  return {
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
  }
}

function AnnotationGlyph({ annotation, selected }: { annotation: Annotation; selected: boolean }) {
  const setSelected = useEditorStore((state) => state.setSelectedAnnotation)
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
      onPointerDown={(event) => {
        event.stopPropagation()
        setSelected(annotation.id)
      }}
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
      {annotation.kind === 'text' && (
        <foreignObject {...annotation.bounds} className="text-annotation-object">
          <div style={{ color: annotation.style.color, fontSize: `${annotation.style.fontSize ?? 12}px` }}>
            {annotation.body || 'Type a note…'}
          </div>
        </foreignObject>
      )}
      {annotation.kind === 'note' && (
        <>
          <foreignObject x={annotation.point.x - 0.016} y={annotation.point.y - 0.016} width="0.04" height="0.04" className="note-annotation-object">
            <div style={{ background: annotation.style.color }} aria-label={annotation.body || 'Empty note'}>
              <span />
            </div>
          </foreignObject>
          {annotation.body && (
            <foreignObject
              x={Math.min(annotation.point.x + 0.022, 0.72)}
              y={Math.min(Math.max(0.01, annotation.point.y - 0.016), 0.89)}
              width="0.26"
              height="0.11"
              className="note-preview-object"
            >
              <div>{annotation.body}</div>
            </foreignObject>
          )}
        </>
      )}
      {selected && bounds && (
        <rect
          className="annotation-selection"
          x={Math.max(0, bounds.x - 0.006)}
          y={Math.max(0, bounds.y - 0.006)}
          width={Math.min(1 - bounds.x, bounds.width + 0.012)}
          height={Math.min(1 - bounds.y, bounds.height + 0.012)}
          pathLength="1"
        />
      )}
    </g>
  )
}

export function AnnotationOverlay({ pageNumber, annotations }: AnnotationOverlayProps) {
  const tool = useEditorStore((state) => state.tool)
  const color = useEditorStore((state) => state.color)
  const activeDocument = useEditorStore((state) => state.activeDocument)
  const selectedId = useEditorStore((state) => state.selectedAnnotationId)
  const setSelected = useEditorStore((state) => state.setSelectedAnnotation)
  const setInspectorOpen = useEditorStore((state) => state.setInspectorOpen)
  const createAnnotations = useEditorStore((state) => state.createAnnotations)
  const startRef = useRef<Point | null>(null)
  const pointsRef = useRef<Array<Point>>([])
  const [draftEnd, setDraftEnd] = useState<Point | null>(null)
  const isDirectTool = ['ink', 'rectangle', 'ellipse', 'line', 'arrow', 'text', 'note'].includes(tool)
  const pageAnnotations = useMemo(
    () => annotations.filter((annotation) => annotation.pageNumber === pageNumber),
    [annotations, pageNumber],
  )

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
          bounds: { x: point.x, y: point.y, width: Math.min(0.3, 0.98 - point.x), height: 0.08 },
          body: '',
          alignment: 'left',
        }],
        'Add text',
      )
    }
    setInspectorOpen(true)
  }

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (!isDirectTool) {
      if (tool === 'select') setSelected(null)
      return
    }
    const point = asPoint(event)
    if (tool === 'note' || tool === 'text') {
      void createAtPoint(point)
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    startRef.current = point
    pointsRef.current = [point]
    setDraftEnd(point)
  }

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!startRef.current) return
    const point = asPoint(event)
    if (tool === 'ink') pointsRef.current.push(point)
    setDraftEnd(point)
  }

  const handlePointerUp = async (event: PointerEvent<SVGSVGElement>) => {
    const start = startRef.current
    const end = draftEnd ?? asPoint(event)
    startRef.current = null
    setDraftEnd(null)
    if (!start || !activeDocument) return
    const style = { color, opacity: 0.92, strokeWidth: tool === 'ink' ? 2.4 : 2 }
    const base = createAnnotationBase(activeDocument.id, pageNumber, 'human', style)
    if (tool === 'ink' && pointsRef.current.length > 1) {
      await createAnnotations([{ ...base, kind: 'ink', strokes: [pointsRef.current] }], 'Draw ink')
    } else if (['rectangle', 'ellipse'].includes(tool)) {
      const bounds = {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
      }
      if (bounds.width > 0.004 && bounds.height > 0.004) {
        await createAnnotations([{ ...base, kind: 'shape', shape: tool as 'rectangle' | 'ellipse', bounds }], `Add ${tool}`)
      }
    } else if (['line', 'arrow'].includes(tool)) {
      await createAnnotations([{ ...base, kind: 'shape', shape: tool as 'line' | 'arrow', start, end }], `Add ${tool}`)
    }
    pointsRef.current = []
  }

  const draftBounds = startRef.current && draftEnd
    ? {
        x: Math.min(startRef.current.x, draftEnd.x),
        y: Math.min(startRef.current.y, draftEnd.y),
        width: Math.abs(draftEnd.x - startRef.current.x),
        height: Math.abs(draftEnd.y - startRef.current.y),
      }
    : null

  return (
    <svg
      className={`annotation-layer ${isDirectTool ? 'is-drawing' : ''}`}
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => void handlePointerUp(event)}
    >
      {pageAnnotations.map((annotation) => (
        <AnnotationGlyph key={annotation.id} annotation={annotation} selected={selectedId === annotation.id} />
      ))}
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
