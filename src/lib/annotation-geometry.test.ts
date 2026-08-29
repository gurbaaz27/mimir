import { describe, expect, it } from 'vitest'
import { constrainDrawingEnd, resizeBounds, resizeHandlePoint } from './annotation-geometry'

describe('resizing from a handle', () => {
  it('reports the point each handle grabs', () => {
    const rect = { x: 0.2, y: 0.25, width: 0.3, height: 0.2 }

    expect(resizeHandlePoint(rect, 'nw')).toEqual({ x: 0.2, y: 0.25 })
    expect(resizeHandlePoint(rect, 'se')).toEqual({ x: 0.5, y: 0.45 })
    expect(resizeHandlePoint(rect, 'e')).toMatchObject({ x: 0.5 })
    expect(resizeHandlePoint(rect, 's').y).toBeCloseTo(0.45)
  })

  it('resizes a rectangle from each side without leaving the page', () => {
    const original = { x: 0.2, y: 0.25, width: 0.3, height: 0.2 }

    expect(resizeBounds(original, 'se', { x: 0.7, y: 0.6 }, 600, 800)).toMatchObject({
      x: 0.2,
      y: 0.25,
      height: 0.35,
    })
    expect(resizeBounds(original, 'se', { x: 0.7, y: 0.6 }, 600, 800).width).toBeCloseTo(0.5)
    expect(resizeBounds(original, 'nw', { x: 0, y: 0 }, 600, 800)).toEqual({
      x: 0,
      y: 0,
      width: 0.5,
      height: 0.45,
    })
    expect(resizeBounds(original, 'e', { x: 1, y: 0.4 }, 600, 800)).toEqual({
      x: 0.2,
      y: 0.25,
      width: 0.8,
      height: 0.2,
    })
  })

  it('keeps a corner resize proportional when Shift is held', () => {
    const resized = resizeBounds(
      { x: 0.2, y: 0.2, width: 0.3, height: 0.2 },
      'se',
      { x: 0.7, y: 0.45 },
      600,
      800,
      true,
    )

    expect(resized.width * 600).toBeCloseTo(resized.height * 800 * 1.125)
  })

  it('leaves edge handles unconstrained even while Shift is held', () => {
    const original = { x: 0.2, y: 0.2, width: 0.3, height: 0.2 }

    expect(resizeBounds(original, 'e', { x: 0.9, y: 0.9 }, 600, 800, true)).toEqual(
      resizeBounds(original, 'e', { x: 0.9, y: 0.9 }, 600, 800, false),
    )
  })

  it('falls back to a free resize when the original has no aspect ratio', () => {
    const flat = { x: 0.2, y: 0.2, width: 0.3, height: 0 }
    const resized = resizeBounds(flat, 'se', { x: 0.6, y: 0.6 }, 600, 800, true)

    expect(Number.isFinite(resized.width)).toBe(true)
    expect(Number.isFinite(resized.height)).toBe(true)
    expect(resized.height).toBeGreaterThan(0)
  })

  it('never shrinks below the pixel minimum or spills off the page', () => {
    const original = { x: 0.2, y: 0.25, width: 0.3, height: 0.2 }

    // Dragging an edge past its opposite one stops at the minimum instead of flipping.
    const collapsed = resizeBounds(original, 'e', { x: -5, y: 0.3 }, 600, 800, false, 8)
    expect(collapsed.width * 600).toBeCloseTo(8)
    expect(collapsed.x).toBeCloseTo(0.2)

    // A rect already pinned against the page edge still keeps its minimum inside it.
    const pinned = resizeBounds({ x: 0.999, y: 0.5, width: 0.001, height: 0.2 }, 'e', { x: 9, y: 0.6 }, 600, 800, false, 8)
    expect(pinned.x + pinned.width).toBeLessThanOrEqual(1)
    expect(pinned.width * 600).toBeCloseTo(8)

    const off = resizeBounds(original, 'nw', { x: -3, y: -3 }, 600, 800)
    expect(off.x).toBe(0)
    expect(off.y).toBe(0)
  })
  it('keeps rectangles square in page pixels', () => {
    const end = constrainDrawingEnd(
      { x: 0.2, y: 0.2 },
      { x: 0.5, y: 0.4 },
      'rectangle',
      true,
      600,
      800,
    )

    expect((end.x - 0.2) * 600).toBeCloseTo((end.y - 0.2) * 800)
    expect(end.x).toBeCloseTo(0.5)
    expect(end.y).toBeCloseTo(0.425)
  })

  it('keeps a circle square in page pixels while dragging in either direction', () => {
    const end = constrainDrawingEnd(
      { x: 0.7, y: 0.7 },
      { x: 0.5, y: 0.65 },
      'ellipse',
      true,
      600,
      800,
    )

    expect((0.7 - end.x) * 600).toBeCloseTo((0.7 - end.y) * 800)
    expect(end).toEqual({ x: 0.5, y: 0.55 })
  })

  it('snaps arrows to the dominant horizontal or vertical axis', () => {
    expect(constrainDrawingEnd({ x: 0.2, y: 0.3 }, { x: 0.8, y: 0.5 }, 'arrow', true, 600, 800)).toEqual({
      x: 0.8,
      y: 0.3,
    })
    expect(constrainDrawingEnd({ x: 0.2, y: 0.3 }, { x: 0.3, y: 0.9 }, 'arrow', true, 600, 800)).toEqual({
      x: 0.2,
      y: 0.9,
    })
  })

  it('does not constrain shapes when Shift is not held', () => {
    const end = { x: 0.5, y: 0.4 }
    expect(constrainDrawingEnd({ x: 0.2, y: 0.2 }, end, 'ellipse', false, 600, 800)).toBe(end)
  })
})
