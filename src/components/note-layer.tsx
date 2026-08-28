import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import type { Annotation, Point } from '#/lib/annotations'
import { useEditorStore } from '#/lib/editor-store.client'

type NoteAnnotation = Extract<Annotation, { kind: 'note' }>
type TextAnnotation = Extract<Annotation, { kind: 'text' }>

interface NoteLayerProps {
  pageNumber: number
  annotations: Array<Annotation>
  pageWidth: number
  pageHeight: number
  zoom: number
}

/** Base sticky sizes in CSS pixels at 100% zoom; the note is scaled with the page. */
const NOTE_WIDTH = 178
const NOTE_HEIGHT = 118
const PIN_SIZE = 22

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max))
}

function StickyNote({
  annotation,
  selected,
  pageWidth,
  pageHeight,
  zoom,
}: {
  annotation: NoteAnnotation
  selected: boolean
  pageWidth: number
  pageHeight: number
  zoom: number
}) {
  const setSelected = useEditorStore((state) => state.setSelectedAnnotation)
  const setInspectorOpen = useEditorStore((state) => state.setInspectorOpen)
  const update = useEditorStore((state) => state.updateAnnotation)
  const [body, setBody] = useState(annotation.body)
  const [collapsed, setCollapsed] = useState(annotation.resolved)
  const [dragPoint, setDragPoint] = useState<Point | null>(null)
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => setBody(annotation.body), [annotation.body])
  useEffect(() => setCollapsed(annotation.resolved), [annotation.resolved])
  useEffect(() => {
    if (selected && !collapsed && !annotation.body) bodyRef.current?.focus()
  }, [selected, collapsed, annotation.body])

  const point = dragPoint ?? annotation.point
  const width = (collapsed ? PIN_SIZE : NOTE_WIDTH) * zoom
  const height = (collapsed ? PIN_SIZE : NOTE_HEIGHT) * zoom
  const left = clamp(point.x * pageWidth, 0, Math.max(0, pageWidth - width))
  const top = clamp(point.y * pageHeight, 0, Math.max(0, pageHeight - height))

  const select = () => {
    setSelected(annotation.id)
    setInspectorOpen(true)
  }

  const commitBody = () => {
    if (body !== annotation.body) void update(annotation.id, { body } as Partial<Annotation>)
  }

  const handleDragStart = (event: PointerEvent<HTMLElement>) => {
    event.stopPropagation()
    select()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { x: event.clientX, y: event.clientY, moved: false }
  }

  const handleDragMove = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || !pageWidth || !pageHeight) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    if (!drag.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return
    drag.moved = true
    setDragPoint({
      x: clamp(annotation.point.x + dx / pageWidth, 0, 1),
      y: clamp(annotation.point.y + dy / pageHeight, 0, 1),
    })
  }

  const handleDragEnd = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    dragRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
    if (drag?.moved && dragPoint) {
      void update(annotation.id, { point: dragPoint } as Partial<Annotation>).finally(() => setDragPoint(null))
    } else {
      setDragPoint(null)
    }
  }

  if (collapsed) {
    return (
      <button
        type="button"
        className={`sticky-pin ${selected ? 'is-selected' : ''} ${annotation.resolved ? 'is-resolved' : ''}`}
        style={{
          left,
          top,
          width: PIN_SIZE,
          height: PIN_SIZE,
          transform: `scale(${zoom})`,
          '--note-color': annotation.style.color,
        } as React.CSSProperties}
        title={annotation.body || 'Empty note'}
        aria-label={`Open note: ${annotation.body || 'empty note'}`}
        onClick={() => {
          setCollapsed(false)
          select()
        }}
      >
        <span />
        <span />
      </button>
    )
  }

  return (
    <div
      className={`sticky-note ${selected ? 'is-selected' : ''} ${annotation.resolved ? 'is-resolved' : ''}`}
      style={{
        left,
        top,
        width: NOTE_WIDTH,
        height: NOTE_HEIGHT,
        transform: `scale(${zoom})`,
        '--note-color': annotation.style.color,
      } as React.CSSProperties}
      data-annotation-id={annotation.id}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="sticky-note-paper">
        <div
          className="sticky-note-head"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
        >
          <span className="sticky-note-grip" aria-hidden="true" />
          {annotation.resolved && <Check className="sticky-note-resolved" size={11} aria-label="Resolved" />}
          <button
            type="button"
            className="sticky-note-collapse"
            aria-label="Collapse note"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setCollapsed(true)}
          >
            <ChevronDown size={11} />
          </button>
        </div>
        <textarea
          ref={bodyRef}
          className="sticky-note-body"
          value={body}
          placeholder="Add your thought…"
          spellCheck={false}
          onFocus={select}
          onChange={(event) => setBody(event.target.value)}
          onBlur={commitBody}
        />
      </div>
    </div>
  )
}

function TextBox({
  annotation,
  selected,
  pageWidth,
  pageHeight,
  zoom,
}: {
  annotation: TextAnnotation
  selected: boolean
  pageWidth: number
  pageHeight: number
  zoom: number
}) {
  const setSelected = useEditorStore((state) => state.setSelectedAnnotation)
  const setInspectorOpen = useEditorStore((state) => state.setInspectorOpen)
  const update = useEditorStore((state) => state.updateAnnotation)
  const [body, setBody] = useState(annotation.body)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => setBody(annotation.body), [annotation.body])
  useEffect(() => {
    if (selected && !annotation.body) inputRef.current?.focus()
  }, [selected, annotation.body])

  return (
    <div
      className={`text-annotation-box ${selected ? 'is-selected' : ''}`}
      style={{
        left: annotation.bounds.x * pageWidth,
        top: annotation.bounds.y * pageHeight,
        width: annotation.bounds.width * pageWidth,
        height: annotation.bounds.height * pageHeight,
        '--note-color': annotation.style.color,
      } as React.CSSProperties}
      data-annotation-id={annotation.id}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <textarea
        ref={inputRef}
        className="text-annotation-input"
        value={body}
        placeholder="Type on the page…"
        spellCheck={false}
        style={{
          color: annotation.style.color,
          opacity: annotation.style.opacity,
          fontSize: (annotation.style.fontSize ?? 12) * zoom,
          textAlign: annotation.alignment,
        }}
        onFocus={() => {
          setSelected(annotation.id)
          setInspectorOpen(true)
        }}
        onChange={(event) => setBody(event.target.value)}
        onBlur={() => {
          if (body !== annotation.body) void update(annotation.id, { body } as Partial<Annotation>)
        }}
      />
    </div>
  )
}

/**
 * Notes and text boxes are plain HTML rather than SVG `foreignObject`: inside the
 * normalized `viewBox="0 0 1 1"` overlay one user unit spans the whole page, so any
 * pixel-sized CSS there is scaled by the page width and the content renders invisibly.
 */
export function NoteLayer({ pageNumber, annotations, pageWidth, pageHeight, zoom }: NoteLayerProps) {
  const tool = useEditorStore((state) => state.tool)
  const selectedId = useEditorStore((state) => state.selectedAnnotationId)
  const pageAnnotations = useMemo(
    () =>
      annotations.filter(
        (annotation): annotation is NoteAnnotation | TextAnnotation =>
          annotation.pageNumber === pageNumber && (annotation.kind === 'note' || annotation.kind === 'text'),
      ),
    [annotations, pageNumber],
  )
  if (!pageAnnotations.length) return null

  const interactive = tool === 'select' || tool === 'note' || tool === 'text'
  return (
    <div className={`note-layer ${interactive ? 'is-interactive' : ''}`}>
      {pageAnnotations.map((annotation) =>
        annotation.kind === 'note' ? (
          <StickyNote
            key={annotation.id}
            annotation={annotation}
            selected={selectedId === annotation.id}
            pageWidth={pageWidth}
            pageHeight={pageHeight}
            zoom={zoom}
          />
        ) : (
          <TextBox
            key={annotation.id}
            annotation={annotation}
            selected={selectedId === annotation.id}
            pageWidth={pageWidth}
            pageHeight={pageHeight}
            zoom={zoom}
          />
        ),
      )}
    </div>
  )
}
