import type { Point } from './annotations'

export type ConstrainedShape = 'rectangle' | 'ellipse' | 'arrow'

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

  if (shape === 'arrow') {
    const dx = Math.abs(end.x - start.x) * pageWidth
    const dy = Math.abs(end.y - start.y) * pageHeight
    return dx >= dy ? { x: end.x, y: start.y } : { x: start.x, y: end.y }
  }

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
