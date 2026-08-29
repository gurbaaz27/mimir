import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import type { Annotation, NormalizedRect, Point } from '#/lib/annotations'
import { resizeBounds, resizeHandleAnchors, resizeHandlePoint, sameRect, type ResizeHandle } from '#/lib/annotation-geometry'
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
/** Handle sizes in CSS pixels, before the note's own zoom scaling is undone. */
const HANDLE_PIXELS = 10
const HANDLE_HIT_PIXELS = 22
/** Below this, the mid-edge handles would overlap the corners, so they are dropped. */
const EDGE_HANDLE_MINIMUM_PIXELS = HANDLE_PIXELS * 3

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max))
}

/**
 * Pointer plumbing shared by the sticky note and the text box. Both resize a
 * normalized rect against the page, preview it locally while the pointer is
 * down, and commit once at the end.
 */
function useBoxResize({
  pageWidth,
  pageHeight,
  bounds,
  onCommit,
}: {
  pageWidth: number
  pageHeight: number
  /** The rect the next drag starts from; read once, at pointer down. */
  bounds: NormalizedRect
  onCommit: (bounds: NormalizedRect) => void
}) {
  const [active, setActive] = useState<{ handle: ResizeHandle; bounds: NormalizedRect } | null>(null)
  const preview = active?.bounds ?? null
  const resizeRef = useRef<{
    pointerId: number
    handle: ResizeHandle
    clientX: number
    clientY: number
    origin: NormalizedRect
    next: NormalizedRect
  } | null>(null)

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>, handle: ResizeHandle) => {
    if (event.button !== 0) return
    event.stopPropagation()
    event.preventDefault()
    resizeRef.current = {
      pointerId: event.pointerId,
      handle,
      clientX: event.clientX,
      clientY: event.clientY,
      origin: bounds,
      next: bounds,
    }
    setActive({ handle, bounds })
  }

  const move = (event: globalThis.PointerEvent) => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    event.preventDefault()
    // `resizeBounds` wants the new position of the dragged edge. Offsetting the
    // handle's own starting point keeps the grab offset; offsetting the rect's
    // origin instead — as this used to — collapses the box whenever the east or
    // south edge is dragged.
    const grab = resizeHandlePoint(resize.origin, resize.handle)
    const next = resizeBounds(
      resize.origin,
      resize.handle,
      {
        x: grab.x + (event.clientX - resize.clientX) / Math.max(pageWidth, 1),
        y: grab.y + (event.clientY - resize.clientY) / Math.max(pageHeight, 1),
      },
      pageWidth,
      pageHeight,
      event.shiftKey,
    )
    resize.next = next
    setActive({ handle: resize.handle, bounds: next })
  }

  const end = (commit: boolean) => {
    const resize = resizeRef.current
    resizeRef.current = null
    setActive(null)
    // A click that never moved must not land an entry on the undo stack.
    if (!resize || !commit || sameRect(resize.next, resize.origin)) return
    onCommit(resize.next)
  }

  // Tracked on the window, not on a captured element: a missed pointerup would
  // strand the drag with the preview stuck on screen and the wrong handle lit.
  const handlersRef = useRef({ move, end })
  handlersRef.current = { move, end }

  useEffect(() => {
    if (!active) return
    const onMove = (event: globalThis.PointerEvent) => handlersRef.current.move(event)
    const onUp = (event: globalThis.PointerEvent) => handlersRef.current.end(event.type === 'pointerup')
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      handlersRef.current.end(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('keydown', onKey)
    }
  }, [Boolean(active)])

  return { preview, activeHandle: active?.handle ?? null, onPointerDown }
}

/** The eight grab points around a box, sized so they never scale with the page zoom. */
function ResizeHandles({
  label,
  width,
  height,
  scale,
  activeHandle,
  onPointerDown,
}: {
  label: string
  /** Rendered size of the box in CSS pixels, used to drop handles that would collide. */
  width: number
  height: number
  /** CSS scale already applied to the box, which the handles undo. */
  scale: number
  /** The handle being dragged, so it stays lit wherever the pointer goes. */
  activeHandle: ResizeHandle | null
  onPointerDown: (event: PointerEvent<HTMLButtonElement>, handle: ResizeHandle) => void
}) {
  const safeScale = Math.max(scale, 0.01)
  const wideEnough = width >= EDGE_HANDLE_MINIMUM_PIXELS
  const tallEnough = height >= EDGE_HANDLE_MINIMUM_PIXELS
  // Cap the hit target at half the box so neighbouring handles never both cover
  // the same point — otherwise stacking order, not proximity, picks the winner.
  const hitPixels = Math.max(HANDLE_PIXELS, Math.min(HANDLE_HIT_PIXELS, width / 2, height / 2))
  return (
    <div
      className="annotation-resize-handles"
      style={{
        '--handle-size': `${HANDLE_PIXELS / safeScale}px`,
        '--handle-hit': `${hitPixels / safeScale}px`,
      } as React.CSSProperties}
    >
      {resizeHandleAnchors.map((handle) => {
        if ((handle.name === 'n' || handle.name === 's') && !wideEnough) return null
        if ((handle.name === 'e' || handle.name === 'w') && !tallEnough) return null
        return (
          <button
            key={handle.name}
            type="button"
            className={`annotation-resize-handle is-${handle.name} ${activeHandle === handle.name ? 'is-resizing' : ''}`}
            aria-label={`Resize ${label} from the ${handle.label}`}
            style={{ cursor: handle.cursor }}
            onPointerDown={(event) => onPointerDown(event, handle.name)}
          />
        )
      })}
    </div>
  )
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
  // `pageWidth` already includes the zoom, so the default note keeps a fixed
  // pixel size and a zoom-independent normalized one.
  const defaultWidth = Math.min(0.9, NOTE_WIDTH * zoom / Math.max(pageWidth, 1))
  const defaultHeight = Math.min(0.9, NOTE_HEIGHT * zoom / Math.max(pageHeight, 1))
  const defaultBounds: NormalizedRect = {
    x: clamp(annotation.point.x, 0, 1 - defaultWidth),
    y: clamp(annotation.point.y, 0, 1 - defaultHeight),
    width: defaultWidth,
    height: defaultHeight,
  }
  const storedBounds = annotation.bounds ?? defaultBounds
  const baseBounds = {
    ...storedBounds,
    x: storedBounds.x + (groupOffset?.dx ?? 0),
    y: storedBounds.y + (groupOffset?.dy ?? 0),
  }
  const resize = useBoxResize({
    pageWidth,
    pageHeight,
    bounds: storedBounds,
    // `point` stays the note's anchor — the exporter and the agent tools read it
    // — so it has to follow the resized top-left corner.
    onCommit: (next) =>
      void update(annotation.id, { point: { x: next.x, y: next.y }, bounds: next } as Partial<Annotation>),
  })
  const bounds = resize.preview ?? (dragPoint
    ? { ...baseBounds, x: dragPoint.x, y: dragPoint.y }
    : baseBounds)
  // The note is laid out unscaled and then scaled with the page, so its own
  // width and height are the on-screen size divided back out by the zoom.
  const width = collapsed ? PIN_SIZE * zoom : bounds.width * pageWidth
  const height = collapsed ? PIN_SIZE * zoom : bounds.height * pageHeight
  const left = clamp(bounds.x * pageWidth, 0, Math.max(0, pageWidth - width))
  const top = clamp(bounds.y * pageHeight, 0, Math.max(0, pageHeight - height))

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
        x: clamp(baseBounds.x + dx / pageWidth, 0, 1 - baseBounds.width),
        y: clamp(baseBounds.y + dy / pageHeight, 0, 1 - baseBounds.height),
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
      const patch = annotation.bounds
        ? { point: dragPoint, bounds: { ...annotation.bounds, x: dragPoint.x, y: dragPoint.y } }
        : { point: dragPoint }
      void update(annotation.id, patch as Partial<Annotation>).finally(() => setDragPoint(null))
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
        width: width / Math.max(zoom, 0.01),
        height: height / Math.max(zoom, 0.01),
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
      {tool === 'select' && selected && selectedIds.length === 1 && !annotationDrag && (
        <ResizeHandles
          label="note"
          width={width}
          height={height}
          scale={zoom}
          activeHandle={resize.activeHandle}
          onPointerDown={resize.onPointerDown}
        />
      )}
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
  const resize = useBoxResize({
    pageWidth,
    pageHeight,
    bounds: annotation.bounds,
    onCommit: (next) => void update(annotation.id, { bounds: next } as Partial<Annotation>),
  })
  // The stored height is a floor: a manual resize sets it, and typing past it
  // grows the box so text is never clipped.
  const bounds = resize.preview ?? dragBounds ?? {
    ...baseBounds,
    height: Math.max(baseBounds.height, contentHeight ?? 0),
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
    // Only ever grow: shrinking here would undo a manual resize the moment the
    // body is edited.
    const grownHeight = Math.max(annotation.bounds.height, contentHeight ?? 0)
    const nextBounds = grownHeight - annotation.bounds.height > 0.0001
      ? { ...annotation.bounds, height: grownHeight }
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
      {tool === 'select' && selected && selectedIds.length === 1 && !annotationDrag && (
        <ResizeHandles
          label="text box"
          width={bounds.width * pageWidth}
          height={bounds.height * pageHeight}
          scale={1}
          activeHandle={resize.activeHandle}
          onPointerDown={resize.onPointerDown}
        />
      )}
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
