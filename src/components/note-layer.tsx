import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import type { Annotation, NormalizedRect, Point } from '#/lib/annotations'
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
const TEXT_BOX_LINE_HEIGHT = 1.28
const TEXT_BOX_VERTICAL_PADDING = 4
const TEXT_BOX_VERTICAL_BORDER = 2

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
  const tool = useEditorStore((state) => state.tool)
  const selectedIds = useEditorStore((state) => state.selectedAnnotationIds)
  const setSelected = useEditorStore((state) => state.setSelectedAnnotation)
  const setSelectedAnnotations = useEditorStore((state) => state.setSelectedAnnotations)
  const beginAnnotationDrag = useEditorStore((state) => state.beginAnnotationDrag)
  const updateAnnotationDrag = useEditorStore((state) => state.updateAnnotationDrag)
  const finishAnnotationDrag = useEditorStore((state) => state.finishAnnotationDrag)
  const update = useEditorStore((state) => state.updateAnnotation)
  const annotationDrag = useEditorStore((state) => state.annotationDrag)
  const [body, setBody] = useState(annotation.body)
  const [collapsed, setCollapsed] = useState(annotation.resolved)
  const [dragPoint, setDragPoint] = useState<Point | null>(null)
  const suppressClickRef = useRef(false)
  const dragRef = useRef<{ x: number; y: number; moved: boolean; group: boolean } | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => setBody(annotation.body), [annotation.body])
  useEffect(() => setCollapsed(annotation.resolved), [annotation.resolved])
  useEffect(() => {
    if (selected && !collapsed && !annotation.body) bodyRef.current?.focus()
  }, [selected, collapsed, annotation.body])

  const groupOffset = annotationDrag?.ids.includes(annotation.id) ? annotationDrag : null
  const point = dragPoint ?? {
    x: annotation.point.x + (groupOffset?.dx ?? 0),
    y: annotation.point.y + (groupOffset?.dy ?? 0),
  }
  const width = (collapsed ? PIN_SIZE : NOTE_WIDTH) * zoom
  const height = (collapsed ? PIN_SIZE : NOTE_HEIGHT) * zoom
  const left = clamp(point.x * pageWidth, 0, Math.max(0, pageWidth - width))
  const top = clamp(point.y * pageHeight, 0, Math.max(0, pageHeight - height))

  const select = () => {
    setSelected(annotation.id)
  }

  const commitBody = () => {
    if (body !== annotation.body) void update(annotation.id, { body } as Partial<Annotation>)
  }

  const handleDragStart = (event: PointerEvent<HTMLElement>) => {
    event.stopPropagation()
    suppressClickRef.current = false
    if (tool === 'select') {
      const ids = selectedIds.includes(annotation.id) ? selectedIds : [annotation.id]
      if (!selectedIds.includes(annotation.id)) setSelectedAnnotations([annotation.id])
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      dragRef.current = { x: event.clientX, y: event.clientY, moved: false, group: true }
      beginAnnotationDrag(ids)
      return
    }
    select()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { x: event.clientX, y: event.clientY, moved: false, group: false }
  }

  const handleDragMove = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || !pageWidth || !pageHeight) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    if (!drag.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return
    drag.moved = true
    suppressClickRef.current = true
    if (drag.group) {
      updateAnnotationDrag(dx / pageWidth, dy / pageHeight)
    } else {
      setDragPoint({
        x: clamp(annotation.point.x + dx / pageWidth, 0, 1),
        y: clamp(annotation.point.y + dy / pageHeight, 0, 1),
      })
    }
  }

  const handleDragEnd = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (drag?.group) {
      void finishAnnotationDrag()
    } else if (drag?.moved && dragPoint) {
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
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
        onClick={() => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false
            return
          }
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
  const tool = useEditorStore((state) => state.tool)
  const selectedIds = useEditorStore((state) => state.selectedAnnotationIds)
  const setSelected = useEditorStore((state) => state.setSelectedAnnotation)
  const setSelectedAnnotations = useEditorStore((state) => state.setSelectedAnnotations)
  const beginAnnotationDrag = useEditorStore((state) => state.beginAnnotationDrag)
  const updateAnnotationDrag = useEditorStore((state) => state.updateAnnotationDrag)
  const finishAnnotationDrag = useEditorStore((state) => state.finishAnnotationDrag)
  const update = useEditorStore((state) => state.updateAnnotation)
  const annotationDrag = useEditorStore((state) => state.annotationDrag)
  const [body, setBody] = useState(annotation.body)
  const [contentHeight, setContentHeight] = useState<number | null>(null)
  const [dragBounds, setDragBounds] = useState<NormalizedRect | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const dragRef = useRef<{ x: number; y: number; moved: boolean; group: boolean } | null>(null)
  const dragBoundsRef = useRef<NormalizedRect | null>(null)

  useEffect(() => setBody(annotation.body), [annotation.body])
  useEffect(() => {
    if (selected && !annotation.body) inputRef.current?.focus()
  }, [selected, annotation.body])

  const groupOffset = annotationDrag?.ids.includes(annotation.id) ? annotationDrag : null
  const baseBounds = {
    ...annotation.bounds,
    x: annotation.bounds.x + (groupOffset?.dx ?? 0),
    y: annotation.bounds.y + (groupOffset?.dy ?? 0),
  }
  const bounds = dragBounds ?? {
    ...baseBounds,
    height: contentHeight ?? baseBounds.height,
  }

  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input || !pageHeight) return

    // Let the textarea report its natural height instead of the current box
    // height. This includes wrapped lines as well as explicit newlines.
    const previousHeight = input.style.height
    input.style.height = '0px'
    const requiredHeight = input.scrollHeight + TEXT_BOX_VERTICAL_BORDER
    input.style.height = previousHeight

    const fontSize = (annotation.style.fontSize ?? 12) * zoom
    const minimumHeight = (fontSize * TEXT_BOX_LINE_HEIGHT + TEXT_BOX_VERTICAL_PADDING + TEXT_BOX_VERTICAL_BORDER) / pageHeight
    const nextHeight = Math.min(1, Math.max(minimumHeight, requiredHeight / pageHeight))
    setContentHeight((current) => current === nextHeight ? current : nextHeight)
  }, [annotation.bounds.height, annotation.bounds.width, annotation.style.fontSize, body, pageHeight, pageWidth, zoom])

  const handleDragStart = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (tool === 'select') {
      const ids = selectedIds.includes(annotation.id) ? selectedIds : [annotation.id]
      if (!selectedIds.includes(annotation.id)) setSelectedAnnotations([annotation.id])
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      dragRef.current = { x: event.clientX, y: event.clientY, moved: false, group: true }
      beginAnnotationDrag(ids)
      return
    }
    setSelected(annotation.id)
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { x: event.clientX, y: event.clientY, moved: false, group: false }
    dragBoundsRef.current = bounds
  }

  const handleDragMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || !pageWidth || !pageHeight) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    if (!drag.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return
    drag.moved = true
    if (drag.group) {
      updateAnnotationDrag(dx / pageWidth, dy / pageHeight)
      return
    }
    const nextBounds = {
      ...(dragBoundsRef.current ?? bounds),
      x: clamp(annotation.bounds.x + dx / pageWidth, 0, 1 - annotation.bounds.width),
      y: clamp(annotation.bounds.y + dy / pageHeight, 0, 1 - annotation.bounds.height),
    }
    dragBoundsRef.current = nextBounds
    setDragBounds(nextBounds)
  }

  const handleDragEnd = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (drag?.group) {
      void finishAnnotationDrag()
      return
    }
    const nextBounds = dragBoundsRef.current
    dragBoundsRef.current = null
    if (drag?.moved && nextBounds) {
      void update(annotation.id, { bounds: nextBounds } as Partial<Annotation>).finally(() => setDragBounds(null))
    } else {
      setDragBounds(null)
    }
  }

  const commit = () => {
    const nextBounds = contentHeight !== null && Math.abs(contentHeight - annotation.bounds.height) > 0.0001
      ? { ...annotation.bounds, height: contentHeight }
      : undefined
    if (body === annotation.body && !nextBounds) return
    void update(annotation.id, { body, ...(nextBounds ? { bounds: nextBounds } : {}) } as Partial<Annotation>)
  }

  return (
    <div
      className={`text-annotation-box ${selected ? 'is-selected' : ''}`}
      style={{
        left: bounds.x * pageWidth,
        top: bounds.y * pageHeight,
        width: bounds.width * pageWidth,
        height: bounds.height * pageHeight,
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
        onFocus={() => setSelected(annotation.id)}
        onChange={(event) => setBody(event.target.value)}
        onBlur={commit}
      />
      <button
        type="button"
        className="text-annotation-drag-handle"
        aria-label="Move text box"
        title="Move text box"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        <span aria-hidden="true" />
      </button>
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
  const selectedIds = useEditorStore((state) => state.selectedAnnotationIds)
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
            selected={selectedIds.includes(annotation.id)}
            pageWidth={pageWidth}
            pageHeight={pageHeight}
            zoom={zoom}
          />
        ) : (
          <TextBox
            key={annotation.id}
            annotation={annotation}
            selected={selectedIds.includes(annotation.id)}
            pageWidth={pageWidth}
            pageHeight={pageHeight}
            zoom={zoom}
          />
        ),
      )}
    </div>
  )
}
