import type { NormalizedRect, Point } from './annotations'

export type ConstrainedShape = 'rectangle' | 'ellipse' | 'arrow'
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

/**
 * How the rendered PDF text layer is found in the DOM.
 *
 * Quote anchoring walks this element, so it is a contract between the renderer
 * and every tool that anchors to page text — not a styling detail. It used to
 * be the class `.textLayer`, which the Tailwind v4 migration replaced with
 * utility classes; nothing pointed at the tools that queried it, and quote
 * anchoring reported every page as an unreadable scan until it was found. A
 * data attribute keeps the hook out of the way of styling, and exporting it
 * means the renderer and the query cannot drift apart again.
 */
export const textLayerAttribute = 'data-text-layer'
export const textLayerSelector = `[${textLayerAttribute}]`

export const resizeHandles: ReadonlyArray<ResizeHandle> = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
export const defaultNoteSizePx = { width: 178, height: 118 } as const

/**
 * Browser ranges over PDF.js text layers can split one visual line into many
 * rectangles, often one per text item. Keep those fragments from producing
 * seams or double-painted edges while preserving actual line breaks.
 *
 * Underlines and strikeouts opt into bridging normal inline gaps so spaces do
 * not interrupt the mark. Highlights only merge touching/overlapping fragments
 * (plus a small fractional-pixel tolerance), so they do not paint across wide
 * layout gaps such as columns.
 */
export function mergeTextQuads(
  quads: ReadonlyArray<NormalizedRect>,
  bridgeInlineGaps = false,
): Array<NormalizedRect> {
  if (quads.length < 2) return [...quads]

  const sorted = [...quads].sort((first, second) => first.y - second.y || first.x - second.x)
  const lines: Array<{ baseline: number; height: number; quads: Array<NormalizedRect> }> = []

  for (const quad of sorted) {
    const baseline = quad.y + quad.height
    const line = lines.find(
      (candidate) => Math.abs(candidate.baseline - baseline) <= Math.max(candidate.height, quad.height) * 0.35,
    )
    if (line) {
      line.quads.push(quad)
      line.baseline = (line.baseline * (line.quads.length - 1) + baseline) / line.quads.length
      line.height = Math.max(line.height, quad.height)
    } else {
      lines.push({ baseline, height: quad.height, quads: [quad] })
    }
  }

  return lines.flatMap((line) => {
    const lineQuads = [...line.quads].sort((first, second) => first.x - second.x)
    const merged: Array<NormalizedRect> = []
    for (const quad of lineQuads) {
      const previous = merged.at(-1)
      if (!previous) {
        merged.push({ ...quad })
        continue
      }

      const gap = quad.x - (previous.x + previous.width)
      const gapTolerance = Math.max(previous.height, quad.height) * (bridgeInlineGaps ? 0.75 : 0.08)
      if (gap > gapTolerance) {
        merged.push({ ...quad })
        continue
      }

      const right = Math.max(previous.x + previous.width, quad.x + quad.width)
      const bottom = Math.max(previous.y + previous.height, quad.y + quad.height)
      previous.x = Math.min(previous.x, quad.x)
      previous.y = Math.min(previous.y, quad.y)
      previous.width = right - previous.x
      previous.height = bottom - previous.y
    }
    return merged
  })
}

const handleDirections: Record<ResizeHandle, { x: -1 | 0 | 1; y: -1 | 0 | 1 }> = {
  nw: { x: -1, y: -1 },
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
}

export function pointForResizeHandle(bounds: NormalizedRect, handle: ResizeHandle): Point {
  const direction = handleDirections[handle]
  return {
    x: direction.x < 0 ? bounds.x : direction.x > 0 ? bounds.x + bounds.width : bounds.x + bounds.width / 2,
    y: direction.y < 0 ? bounds.y : direction.y > 0 ? bounds.y + bounds.height : bounds.y + bounds.height / 2,
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

/**
 * Resizes a normalized rectangle from one of its eight handles. The opposite
 * edge/corner stays anchored, handles may cross over it, and corner drags can
 * preserve the rectangle's visual (page-pixel) aspect ratio.
 */
export function resizeRectFromHandle(
  bounds: NormalizedRect,
  handle: ResizeHandle,
  pointer: Point,
  pageWidth: number,
  pageHeight: number,
  preserveAspectRatio = false,
  minimumSizePx: number | { width: number; height: number } = 8,
): NormalizedRect {
  const direction = handleDirections[handle]
  const minimumWidthPx = typeof minimumSizePx === 'number' ? minimumSizePx : minimumSizePx.width
  const minimumHeightPx = typeof minimumSizePx === 'number' ? minimumSizePx : minimumSizePx.height
  const minWidth = Math.min(1, minimumWidthPx / Math.max(1, pageWidth))
  const minHeight = Math.min(1, minimumHeightPx / Math.max(1, pageHeight))
  const left = bounds.x
  const right = bounds.x + bounds.width
  const top = bounds.y
  const bottom = bounds.y + bounds.height

  let x1 = direction.x < 0 ? clamp(pointer.x, 0, 1) : left
  let x2 = direction.x > 0 ? clamp(pointer.x, 0, 1) : right
  let y1 = direction.y < 0 ? clamp(pointer.y, 0, 1) : top
  let y2 = direction.y > 0 ? clamp(pointer.y, 0, 1) : bottom

  if (direction.x === 0) {
    x1 = left
    x2 = right
  }
  if (direction.y === 0) {
    y1 = top
    y2 = bottom
  }

  // Shift-resizing from a corner keeps the original ratio in physical page
  // pixels, which matters on portrait pages where normalized X/Y differ.
  if (preserveAspectRatio && direction.x !== 0 && direction.y !== 0) {
    const anchorX = direction.x < 0 ? right : left
    const anchorY = direction.y < 0 ? bottom : top
    const signX = (pointer.x < anchorX ? -1 : 1)
    const signY = (pointer.y < anchorY ? -1 : 1)
    const originalWidthPx = Math.max(minimumWidthPx, bounds.width * pageWidth)
    const originalHeightPx = Math.max(minimumHeightPx, bounds.height * pageHeight)
    const requestedWidthPx = Math.max(minimumWidthPx, Math.abs(pointer.x - anchorX) * pageWidth)
    const requestedHeightPx = Math.max(minimumHeightPx, Math.abs(pointer.y - anchorY) * pageHeight)
    const scale = Math.max(requestedWidthPx / originalWidthPx, requestedHeightPx / originalHeightPx)
    let widthPx = originalWidthPx * scale
    let heightPx = originalHeightPx * scale
    const availableWidthPx = (signX > 0 ? 1 - anchorX : anchorX) * pageWidth
    const availableHeightPx = (signY > 0 ? 1 - anchorY : anchorY) * pageHeight
    const boundaryScale = Math.min(1, availableWidthPx / widthPx, availableHeightPx / heightPx)
    widthPx *= boundaryScale
    heightPx *= boundaryScale
    x1 = anchorX
    x2 = anchorX + signX * widthPx / pageWidth
    y1 = anchorY
    y2 = anchorY + signY * heightPx / pageHeight
  }

  if (direction.x !== 0 && Math.abs(x2 - x1) < minWidth) {
    const anchor = direction.x < 0 ? right : left
    const sign = (direction.x < 0 ? pointer.x < anchor : pointer.x >= anchor) ? 1 : -1
    if (direction.x < 0) x1 = clamp(anchor - sign * minWidth, 0, 1)
    else x2 = clamp(anchor + sign * minWidth, 0, 1)
  }
  if (direction.y !== 0 && Math.abs(y2 - y1) < minHeight) {
    const anchor = direction.y < 0 ? bottom : top
    const sign = (direction.y < 0 ? pointer.y < anchor : pointer.y >= anchor) ? 1 : -1
    if (direction.y < 0) y1 = clamp(anchor - sign * minHeight, 0, 1)
    else y2 = clamp(anchor + sign * minHeight, 0, 1)
  }

  let x = Math.min(x1, x2)
  let y = Math.min(y1, y2)
  let width = Math.abs(x2 - x1)
  let height = Math.abs(y2 - y1)
  if (width < minWidth) {
    x = clamp(direction.x < 0 ? Math.max(x1, x2) - minWidth : x, 0, 1 - minWidth)
    width = minWidth
  }
  if (height < minHeight) {
    y = clamp(direction.y < 0 ? Math.max(y1, y2) - minHeight : y, 0, 1 - minHeight)
    height = minHeight
  }
  return { x, y, width, height }
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
