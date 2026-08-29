import type { NormalizedRect, Point } from './annotations'

export type ConstrainedShape = 'rectangle' | 'ellipse' | 'arrow'
export type ResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

/**
 * The eight resize handles, positioned as fractions of the rectangle they
 * surround. `label` is spoken by assistive tech; `cursor` is the CSS cursor the
 * handle adopts.
 */
export const resizeHandleAnchors: ReadonlyArray<{
  name: ResizeHandle
  x: number
  y: number
  cursor: string
  label: string
}> = [
  { name: 'nw', x: 0, y: 0, cursor: 'nwse-resize', label: 'top left' },
  { name: 'n', x: 0.5, y: 0, cursor: 'ns-resize', label: 'top' },
  { name: 'ne', x: 1, y: 0, cursor: 'nesw-resize', label: 'top right' },
  { name: 'e', x: 1, y: 0.5, cursor: 'ew-resize', label: 'right' },
  { name: 'se', x: 1, y: 1, cursor: 'nwse-resize', label: 'bottom right' },
  { name: 's', x: 0.5, y: 1, cursor: 'ns-resize', label: 'bottom' },
  { name: 'sw', x: 0, y: 1, cursor: 'nesw-resize', label: 'bottom left' },
  { name: 'w', x: 0, y: 0.5, cursor: 'ew-resize', label: 'left' },
]

/** Corner handles move both axes at once; edge handles move one. */
export function isCornerHandle(handle: ResizeHandle) {
  return handle.length === 2
}

/** The shortest side a resize may produce, in page pixels. */
export const MINIMUM_RESIZE_PIXELS = 8

const COORDINATE_EPSILON = 1e-6

/**
 * The point on `rect` that `handle` grabs. Resizing tracks the pointer as a
 * delta from this point so the grab offset inside the handle is preserved
 * instead of snapping the edge to the cursor.
 */
export function resizeHandlePoint(rect: NormalizedRect, handle: ResizeHandle): Point {
  const anchor = resizeHandleAnchors.find((entry) => entry.name === handle)
  return {
    x: rect.x + rect.width * (anchor?.x ?? 0),
    y: rect.y + rect.height * (anchor?.y ?? 0),
  }
}

export function samePoint(a: Point | undefined | null, b: Point | undefined | null) {
  if (!a || !b) return a === b
  return Math.abs(a.x - b.x) < COORDINATE_EPSILON && Math.abs(a.y - b.y) < COORDINATE_EPSILON
}

export function sameRect(a: NormalizedRect | undefined | null, b: NormalizedRect | undefined | null) {
  if (!a || !b) return a === b
  return (
    Math.abs(a.x - b.x) < COORDINATE_EPSILON &&
    Math.abs(a.y - b.y) < COORDINATE_EPSILON &&
    Math.abs(a.width - b.width) < COORDINATE_EPSILON &&
    Math.abs(a.height - b.height) < COORDINATE_EPSILON
  )
}

/** Snaps `to` onto the dominant horizontal or vertical axis through `from`. */
export function constrainToAxis(from: Point, to: Point, pageWidth: number, pageHeight: number): Point {
  const dx = Math.abs(to.x - from.x) * pageWidth
  const dy = Math.abs(to.y - from.y) * pageHeight
  return dx >= dy ? { x: to.x, y: from.y } : { x: from.x, y: to.y }
}

/**
 * Applies the drawing constraints used by the shape tools while Shift is held.
 * Coordinates are normalized to the page, so page dimensions are needed to
 * keep a square visually square on pages that are not themselves square.
 */
export function constrainDrawingEnd(
  start: Point,
  end: Point,
  shape: ConstrainedShape,
  shiftKey: boolean,
  pageWidth: number,
  pageHeight: number,
): Point {
  if (!shiftKey || (shape !== 'rectangle' && shape !== 'ellipse' && shape !== 'arrow')) return end

  if (shape === 'arrow') return constrainToAxis(start, end, pageWidth, pageHeight)

  const deltaX = end.x - start.x
  const deltaY = end.y - start.y
  const directionX = Math.sign(deltaX) || 1
  const directionY = Math.sign(deltaY) || 1
  const requestedSize = Math.max(Math.abs(deltaX) * pageWidth, Math.abs(deltaY) * pageHeight)
  const availableWidth = (directionX > 0 ? 1 - start.x : start.x) * pageWidth
  const availableHeight = (directionY > 0 ? 1 - start.y : start.y) * pageHeight
  const size = Math.min(requestedSize, availableWidth, availableHeight)

  return {
    x: start.x + directionX * size / pageWidth,
    y: start.y + directionY * size / pageHeight,
  }
}

/**
 * Resizes one axis. `pointer` is where the dragged edge should land; the
 * opposite edge stays pinned. The result is always inside [0, 1] and never
 * shorter than `minimum`, however far the pointer runs past either limit.
 */
function resizeAxis(
  start: number,
  size: number,
  pointer: number,
  movesStart: boolean,
  movesEnd: boolean,
  minimum: number,
) {
  const limit = Math.min(Math.max(minimum, 0), 1)
  if (movesStart) {
    const anchor = start + size
    // The pinned edge is itself within `limit` of the page start, so there is no
    // room to honour both it and the minimum. The minimum wins.
    if (anchor - limit < 0) return { start: 0, size: limit }
    const next = Math.min(Math.max(pointer, 0), anchor - limit)
    return { start: next, size: anchor - next }
  }
  if (movesEnd) {
    const anchor = start
    if (anchor + limit > 1) return { start: 1 - limit, size: limit }
    const next = Math.max(Math.min(pointer, 1), anchor + limit)
    return { start: anchor, size: next - anchor }
  }
  // This handle leaves the axis alone, but a rect that was already degenerate or
  // off-page is still normalized so the caller never renders something unreachable.
  const clamped = Math.min(Math.max(size, limit), 1)
  return { start: Math.min(Math.max(start, 0), 1 - clamped), size: clamped }
}

/** Resize a normalized rectangle from one of its eight handles. */
export function resizeBounds(
  original: NormalizedRect,
  handle: ResizeHandle,
  pointer: Point,
  pageWidth: number,
  pageHeight: number,
  shiftKey = false,
  minimumPixels = MINIMUM_RESIZE_PIXELS,
): NormalizedRect {
  const widthPixels = Math.max(pageWidth, 1)
  const heightPixels = Math.max(pageHeight, 1)
  const movesLeft = handle.includes('w')
  const movesRight = handle.includes('e')
  const movesTop = handle.includes('n')
  const movesBottom = handle.includes('s')

  const horizontal = resizeAxis(original.x, original.width, pointer.x, movesLeft, movesRight, minimumPixels / widthPixels)
  const vertical = resizeAxis(original.y, original.height, pointer.y, movesTop, movesBottom, minimumPixels / heightPixels)
  const free = { x: horizontal.start, y: vertical.start, width: horizontal.size, height: vertical.size }
  if (!shiftKey || !isCornerHandle(handle)) return free

  // Shift locks the original aspect ratio. It is measured in page pixels so a
  // square stays square on a page that is not itself square, and the shape grows
  // to the larger of the two requested axes — the same rule `constrainDrawingEnd`
  // applies while that shape is being drawn.
  const aspect = (original.width * widthPixels) / (original.height * heightPixels)
  if (!Number.isFinite(aspect) || aspect <= 0) return free

  const anchorX = movesLeft ? original.x + original.width : original.x
  const anchorY = movesTop ? original.y + original.height : original.y
  const ceiling = Math.min((movesLeft ? anchorX : 1 - anchorX) * widthPixels, (movesTop ? anchorY : 1 - anchorY) * heightPixels * aspect)
  const floor = Math.max(minimumPixels, minimumPixels * aspect)
  // Not enough page left of the pinned corner to fit a proportional rectangle.
  if (ceiling < floor) return free

  const requested = Math.max(free.width * widthPixels, free.height * heightPixels * aspect)
  const width = Math.min(Math.max(requested, floor), ceiling) / widthPixels
  const height = width * widthPixels / aspect / heightPixels

  return {
    x: movesLeft ? anchorX - width : anchorX,
    y: movesTop ? anchorY - height : anchorY,
    width,
    height,
  }
}
