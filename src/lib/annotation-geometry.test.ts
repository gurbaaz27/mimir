import { describe, expect, it } from 'vitest'
import { constrainDrawingEnd } from './annotation-geometry'

describe('constrained shape drawing', () => {
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
