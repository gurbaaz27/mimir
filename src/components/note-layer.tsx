import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import type { Annotation, NormalizedRect, Point } from '#/lib/annotations'
import { defaultNoteSizePx, resizeRectFromHandle, type ResizeHandle } from '#/lib/annotation-geometry'
import { useEditorStore } from '#/lib/editor-store.client'
import { ResizeHandles } from './annotation-resize-handles'

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
const PIN_SIZE = 22
const TEXT_BOX_LINE_HEIGHT = 1.28
const TEXT_BOX_VERTICAL_PADDING = 4
const TEXT_BOX_VERTICAL_BORDER = 2

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max))
}

function pointInNoteLayer(event: { clientX: number; clientY: number; currentTarget: HTMLElement }): Point | null {
  const layer = event.currentTarget.closest('.note-layer')
  if (!(layer instanceof HTMLElement)) return null
  const rect = layer.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  return {
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
    y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
  }
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
  const [resizeBounds, setResizeBounds] = useState<NormalizedRect | null>(null)
  const suppressClickRef = useRef(false)
  const dragRef = useRef<{ x: number; y: number; moved: boolean; group: boolean } | null>(null)
  const resizeRef = useRef<{ pointerId: number; handle: ResizeHandle; bounds: NormalizedRect; moved: boolean } | null>(null)
  const resizeBoundsRef = useRef<NormalizedRect | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => setBody(annotation.body), [annotation.body])
  useEffect(() => setCollapsed(annotation.resolved), [annotation.resolved])
  useEffect(() => {
    if (selected && !collapsed && !annotation.body) bodyRef.current?.focus()
  }, [selected, collapsed, annotation.body])

  const groupOffset = annotationDrag?.ids.includes(annotation.id) ? annotationDrag : null
  const storedBounds = annotation.bounds ?? {
    x: annotation.point.x,
    y: annotation.point.y,
    width: Math.min(1, defaultNoteSizePx.width * zoom / pageWidth),
    height: Math.min(1, defaultNoteSizePx.height * zoom / pageHeight),
  }
  const point = dragPoint ?? {
    x: storedBounds.x + (groupOffset?.dx ?? 0),
    y: storedBounds.y + (groupOffset?.dy ?? 0),
  }
  const displayedBounds = resizeBounds ?? { ...storedBounds, x: point.x, y: point.y }
  const width = collapsed ? PIN_SIZE : displayedBounds.width * pageWidth / zoom
  const height = collapsed ? PIN_SIZE : displayedBounds.height * pageHeight / zoom
  const left = clamp((collapsed ? point.x : displayedBounds.x) * pageWidth, 0, Math.max(0, pageWidth - width * zoom))
  const top = clamp((collapsed ? point.y : displayedBounds.y) * pageHeight, 0, Math.max(0, pageHeight - height * zoom))

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
        x: clamp(storedBounds.x + dx / pageWidth, 0, 1 - storedBounds.width),
        y: clamp(storedBounds.y + dy / pageHeight, 0, 1 - storedBounds.height),
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
      void update(annotation.id, {
        point: dragPoint,
        bounds: { ...storedBounds, x: dragPoint.x, y: dragPoint.y },
      } as Partial<Annotation>).finally(() => setDragPoint(null))
    } else {
      setDragPoint(null)
    }
  }

  const handleResizeStart = (event: PointerEvent<HTMLButtonElement>, handle: ResizeHandle) => {
    event.stopPropagation()
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeRef.current = { pointerId: event.pointerId, handle, bounds: displayedBounds, moved: false }
    resizeBoundsRef.current = displayedBounds
    setResizeBounds(displayedBounds)
  }

  const handleResizeMove = (event: PointerEvent<HTMLButtonElement>) => {
    const resize = resizeRef.current
    const pointer = pointInNoteLayer(event)
    if (!resize || resize.pointerId !== event.pointerId || !pointer) return
    event.stopPropagation()
    event.preventDefault()
    const nextBounds = resizeRectFromHandle(
      resize.bounds,
      resize.handle,
      pointer,
      pageWidth,
      pageHeight,
      event.shiftKey,
      { width: 110 * zoom, height: 70 * zoom },
    )
    resize.moved = true
    resizeBoundsRef.current = nextBounds
    setResizeBounds(nextBounds)
  }

  const handleResizeEnd = (event: PointerEvent<HTMLButtonElement>) => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    event.stopPropagation()
    resizeRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    const nextBounds = resizeBoundsRef.current
    if (!nextBounds || !resize.moved) {
      resizeBoundsRef.current = null
      setResizeBounds(null)
      return
    }
    void update(annotation.id, {
      point: { x: nextBounds.x, y: nextBounds.y },
      bounds: nextBounds,
    } as Partial<Annotation>).finally(() => {
      resizeBoundsRef.current = null
      setResizeBounds(null)
    })
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
        width,
        height,
        transform: `scale(${zoom})`,
        '--note-color': annotation.style.color,
      } as React.CSSProperties}
      data-annotation-id={annotation.id}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {selected && tool === 'select' && selectedIds.length === 1 && (
        <ResizeHandles
          bounds={displayedBounds}
          zoom={zoom}
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
        />
      )}
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
  const [resizeBounds, setResizeBounds] = useState<NormalizedRect | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const dragRef = useRef<{ x: number; y: number; moved: boolean; group: boolean } | null>(null)
  const dragBoundsRef = useRef<NormalizedRect | null>(null)
  const resizeRef = useRef<{ pointerId: number; handle: ResizeHandle; bounds: NormalizedRect; moved: boolean } | null>(null)
  const resizeBoundsRef = useRef<NormalizedRect | null>(null)

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
  const bounds = resizeBounds ?? dragBounds ?? {
    ...baseBounds,
    height: annotation.autoHeight === false ? baseBounds.height : contentHeight ?? baseBounds.height,
  }

  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input || !pageHeight || annotation.autoHeight === false) return

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
  }, [annotation.autoHeight, annotation.bounds.height, annotation.bounds.width, annotation.style.fontSize, body, pageHeight, pageWidth, zoom])

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

  const handleResizeStart = (event: PointerEvent<HTMLButtonElement>, handle: ResizeHandle) => {
    event.stopPropagation()
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeRef.current = { pointerId: event.pointerId, handle, bounds, moved: false }
    resizeBoundsRef.current = bounds
    setResizeBounds(bounds)
  }

  const handleResizeMove = (event: PointerEvent<HTMLButtonElement>) => {
    const resize = resizeRef.current
    const pointer = pointInNoteLayer(event)
    if (!resize || resize.pointerId !== event.pointerId || !pointer) return
    event.stopPropagation()
    event.preventDefault()
    const fontSize = annotation.style.fontSize ?? 12
    const nextBounds = resizeRectFromHandle(
      resize.bounds,
      resize.handle,
      pointer,
      pageWidth,
      pageHeight,
      event.shiftKey,
      { width: 56 * zoom, height: (fontSize * TEXT_BOX_LINE_HEIGHT + 8) * zoom },
    )
    resize.moved = true
    resizeBoundsRef.current = nextBounds
    setResizeBounds(nextBounds)
  }

  const handleResizeEnd = (event: PointerEvent<HTMLButtonElement>) => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    event.stopPropagation()
    resizeRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    const nextBounds = resizeBoundsRef.current
    if (!nextBounds || !resize.moved) {
      resizeBoundsRef.current = null
      setResizeBounds(null)
      return
    }
    void update(annotation.id, {
      bounds: nextBounds,
      autoHeight: false,
      ...(body !== annotation.body ? { body } : {}),
    } as Partial<Annotation>).finally(() => {
      resizeBoundsRef.current = null
      setResizeBounds(null)
    })
  }

  const commit = () => {
    const nextBounds = !resizeRef.current && annotation.autoHeight !== false && contentHeight !== null && Math.abs(contentHeight - annotation.bounds.height) > 0.0001
      ? { ...annotation.bounds, height: contentHeight }
      : undefined
    if (body === annotation.body && !nextBounds) return
    void update(annotation.id, { body, ...(nextBounds ? { bounds: nextBounds } : {}) } as Partial<Annotation>)
  }

  return (
    <div
      className={`text-annotation-box ${selected ? 'is-selected' : ''} ${annotation.autoHeight === false || resizeBounds ? 'is-fixed-height' : ''}`}
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
      {selected && tool === 'select' && selectedIds.length === 1 && (
        <ResizeHandles
          bounds={bounds}
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
        />
      )}
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
