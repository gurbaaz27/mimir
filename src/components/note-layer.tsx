import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import type { Annotation, NormalizedRect, Point } from '#/lib/annotations'
import { defaultNoteSizePx, resizeRectFromHandle, type ResizeHandle } from '#/lib/annotation-geometry'
import { useEditorStore } from '#/lib/editor-store.client'
import { cn } from '#/lib/utils'
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
const stickyNoteCollapsedStoragePrefix = 'mimir:sticky-note-collapsed:'

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max))
}

function pointInNoteLayer(event: { clientX: number; clientY: number; currentTarget: HTMLElement }): Point | null {
  const layer = event.currentTarget.closest('[data-note-layer]')
  if (!(layer instanceof HTMLElement)) return null
  const rect = layer.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  return {
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
    y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
  }
}

function readStickyNoteCollapsed(id: string, fallback: boolean) {
  if (typeof window === 'undefined') return fallback
  try {
    const saved = window.localStorage.getItem(`${stickyNoteCollapsedStoragePrefix}${id}`)
    if (saved === 'true') return true
    if (saved === 'false') return false
  } catch {
    // The note still works for this session when storage is unavailable.
  }
  return fallback
}

function persistStickyNoteCollapsed(id: string, collapsed: boolean) {
  try {
    window.localStorage.setItem(`${stickyNoteCollapsedStoragePrefix}${id}`, String(collapsed))
  } catch {
    // The note still works for this session when storage is unavailable.
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
  const [collapsed, setCollapsedState] = useState(() => readStickyNoteCollapsed(annotation.id, annotation.resolved))
  const [dragPoint, setDragPoint] = useState<Point | null>(null)
  const [resizeBounds, setResizeBounds] = useState<NormalizedRect | null>(null)
  const suppressClickRef = useRef(false)
  const dragRef = useRef<{ x: number; y: number; moved: boolean; group: boolean } | null>(null)
  const resizeRef = useRef<{ pointerId: number; handle: ResizeHandle; bounds: NormalizedRect; moved: boolean } | null>(null)
  const resizeBoundsRef = useRef<NormalizedRect | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const previousSelectedRef = useRef(selected)
  const previousResolvedRef = useRef(annotation.resolved)

  const setCollapsed = (nextCollapsed: boolean) => {
    setCollapsedState(nextCollapsed)
    persistStickyNoteCollapsed(annotation.id, nextCollapsed)
  }

  useEffect(() => setBody(annotation.body), [annotation.body])
  useEffect(() => {
    if (previousResolvedRef.current !== annotation.resolved) {
      setCollapsed(annotation.resolved)
      previousResolvedRef.current = annotation.resolved
    }
  }, [annotation.resolved])
  useEffect(() => {
    if (previousSelectedRef.current && !selected) setCollapsed(true)
    previousSelectedRef.current = selected
  }, [selected])
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
        className={cn(
          'absolute grid origin-top-left cursor-grab content-center justify-start gap-[3px] rounded-[2px_2px_5px_2px] border-0 bg-[color-mix(in_oklab,var(--note-color)_62%,white)] px-[3px] py-1 shadow-[inset_0_0_0_1px_oklch(.3_.05_75/.18),0_1px_1px_oklch(.3_.05_75/.2),0_4px_8px_oklch(.3_.05_75/.18)] hover:brightness-104 [&_span]:block [&_span]:h-px [&_span]:w-3.5 [&_span]:bg-[oklch(.28_.03_75/.55)] [&_span:last-child]:w-[9px]',
          annotation.resolved && 'opacity-66',
        )}
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
      className="absolute origin-top-left drop-shadow-[0_1px_1px_oklch(.3_.05_75/.22)] transition-[filter] duration-150 hover:drop-shadow-[0_10px_20px_oklch(.3_.05_75/.24)]"
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
          hideVisuals
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
        />
      )}
      <div className={cn(
        `relative flex size-full flex-col overflow-hidden rounded-sm bg-[color-mix(in_oklab,var(--note-color)_30%,white)] [clip-path:polygon(0_0,100%_0,100%_calc(100%-14px),calc(100%-14px)_100%,0_100%)] after:absolute after:right-0 after:bottom-0 after:border-[7px] after:border-transparent after:border-t-[color-mix(in_oklab,var(--note-color)_58%,white)] after:border-l-[color-mix(in_oklab,var(--note-color)_58%,white)] after:content-['']`,
        annotation.resolved && 'opacity-66',
      )}>
        <div
          className="flex h-[17px] shrink-0 touch-none cursor-grab items-center gap-1 bg-[color-mix(in_oklab,var(--note-color)_62%,white)] pr-[3px] pl-1.5 active:cursor-grabbing"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
        >
          <span className="mr-auto h-[5px] w-[18px] shrink-0 border-y border-[oklch(.3_.03_75/.3)]" aria-hidden="true" />
          {annotation.resolved && <Check className="shrink-0 text-[oklch(.32_.03_75/.8)]" size={11} aria-label="Resolved" />}
          <button
            type="button"
            className="grid size-3.5 shrink-0 place-items-center rounded-[3px] border-0 bg-transparent p-0 text-[oklch(.3_.03_75/.72)] hover:bg-[oklch(1_0_0/.5)] hover:text-[oklch(.24_.03_75)]"
            aria-label="Collapse note"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setCollapsed(true)}
          >
            <ChevronDown size={11} />
          </button>
        </div>
        <textarea
          ref={bodyRef}
          className="min-h-0 w-full flex-1 resize-none border-0 bg-transparent px-2 pt-1.5 pb-3 font-sans text-[11px] leading-[1.42] font-medium text-[oklch(.24_.025_75)] outline-none [overflow-wrap:anywhere] placeholder:text-[oklch(.35_.02_75/.5)]"
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
      className="group/text-box absolute"
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
          hideVisuals
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
        />
      )}
      <textarea
        ref={inputRef}
        className={cn(
          'h-full min-h-0 w-full resize-none overflow-hidden rounded border border-transparent bg-transparent px-[3px] py-0.5 font-sans leading-[1.28] outline-none [overflow-wrap:anywhere]',
          selected && 'bg-[oklch(1_0_0/.6)]',
          (annotation.autoHeight === false || resizeBounds) && 'overflow-auto',
        )}
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
        className={cn(
          'absolute top-0.5 right-0.5 z-1 grid h-[15px] w-[18px] touch-none cursor-grab place-items-center rounded-[3px] border-0 bg-[oklch(1_0_0/.76)] p-0 text-ink-soft opacity-0 transition-[opacity,background] duration-120 group-hover/text-box:opacity-100 hover:bg-paper active:cursor-grabbing',
          selected && 'opacity-100',
          `[&_span]:block [&_span]:h-px [&_span]:w-[9px] [&_span]:bg-current [&_span]:before:absolute [&_span]:before:block [&_span]:before:h-px [&_span]:before:w-[9px] [&_span]:before:-translate-y-[3px] [&_span]:before:bg-current [&_span]:before:content-[''] [&_span]:after:absolute [&_span]:after:block [&_span]:after:h-px [&_span]:after:w-[9px] [&_span]:after:translate-y-[3px] [&_span]:after:bg-current [&_span]:after:content-['']`,
        )}
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
    <div data-note-layer className={cn('pointer-events-none absolute inset-0 z-3', interactive && '[&>*]:pointer-events-auto')}>
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
