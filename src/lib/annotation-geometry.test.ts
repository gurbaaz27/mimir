import { describe, expect, it } from 'vitest'
import { constrainDrawingEnd, mergeTextQuads, pointForResizeHandle, resizeRectFromHandle } from './annotation-geometry'

describe('text markup geometry', () => {
  it('merges overlapping fragments on the same line without merging separate lines', () => {
    expect(
      mergeTextQuads([
        { x: 0.1, y: 0.2, width: 0.2, height: 0.03 },
        { x: 0.295, y: 0.201, width: 0.2, height: 0.03 },
        { x: 0.1, y: 0.25, width: 0.2, height: 0.03 },
      ]),
    ).toEqual([
      { x: 0.1, y: 0.2, width: 0.395, height: 0.031 },
      { x: 0.1, y: 0.25, width: 0.2, height: 0.03 },
    ])
  })

  it('bridges normal inline gaps for continuous underlines', () => {
    const merged = mergeTextQuads([
      { x: 0.1, y: 0.2, width: 0.2, height: 0.03 },
      { x: 0.32, y: 0.2, width: 0.2, height: 0.03 },
      { x: 0.7, y: 0.2, width: 0.1, height: 0.03 },
    ], true)

    expect(merged).toHaveLength(2)
    expect(merged[0]).toMatchObject({ x: 0.1, y: 0.2, height: 0.03 })
    expect(merged[0]?.width).toBeCloseTo(0.42)
    expect(merged[1]).toEqual({ x: 0.7, y: 0.2, width: 0.1, height: 0.03 })
  })
})

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

describe('annotation resize geometry', () => {
  const bounds = { x: 0.2, y: 0.3, width: 0.4, height: 0.2 }

  it('places all edge and corner handles on the expected bounds', () => {
    expect(pointForResizeHandle(bounds, 'nw')).toEqual({ x: 0.2, y: 0.3 })
    expect(pointForResizeHandle(bounds, 'n')).toEqual({ x: 0.4, y: 0.3 })
    expect(pointForResizeHandle(bounds, 'e').x).toBeCloseTo(0.6)
    expect(pointForResizeHandle(bounds, 'e').y).toBeCloseTo(0.4)
    expect(pointForResizeHandle(bounds, 'se').x).toBeCloseTo(0.6)
    expect(pointForResizeHandle(bounds, 'se').y).toBeCloseTo(0.5)
  })

  it('moves one edge while keeping the opposite edge anchored', () => {
    const resized = resizeRectFromHandle(bounds, 'e', { x: 0.85, y: 0.1 }, 600, 800)
    expect(resized.x).toBeCloseTo(0.2)
    expect(resized.y).toBeCloseTo(0.3)
    expect(resized.width).toBeCloseTo(0.65)
    expect(resized.height).toBeCloseTo(0.2)
  })

  it('allows a corner handle to cross its anchor cleanly', () => {
    const resized = resizeRectFromHandle(bounds, 'nw', { x: 0.8, y: 0.7 }, 600, 800)
    expect(resized.x).toBeCloseTo(0.6)
    expect(resized.y).toBeCloseTo(0.5)
    expect(resized.width).toBeCloseTo(0.2)
    expect(resized.height).toBeCloseTo(0.2)
  })

  it('preserves the original visual aspect ratio with Shift', () => {
    const resized = resizeRectFromHandle(
      { x: 0.2, y: 0.2, width: 0.3, height: 0.2 },
      'se',
      { x: 0.8, y: 0.7 },
      600,
      800,
      true,
    )

    expect(resized.x).toBeCloseTo(0.2)
    expect(resized.y).toBeCloseTo(0.2)
    expect((resized.width * 600) / (resized.height * 800)).toBeCloseTo((0.3 * 600) / (0.2 * 800))
  })

  it('keeps resized content on the page and enforces usable minimums', () => {
    const resized = resizeRectFromHandle(
      bounds,
      'nw',
      { x: 0.599, y: 0.499 },
      600,
      800,
      false,
      { width: 60, height: 80 },
    )

    expect(resized.width).toBeCloseTo(0.1)
    expect(resized.height).toBeCloseTo(0.1)
    expect(resized.x).toBeGreaterThanOrEqual(0)
    expect(resized.y).toBeGreaterThanOrEqual(0)
    expect(resized.x + resized.width).toBeLessThanOrEqual(1)
    expect(resized.y + resized.height).toBeLessThanOrEqual(1)
  })

  it('keeps the minimum box inside the page when its anchor is near an edge', () => {
    const resized = resizeRectFromHandle(
      { x: 0.99, y: 0.99, width: 0.005, height: 0.005 },
      'se',
      { x: 1, y: 1 },
      600,
      800,
      false,
      12,
    )

    expect(resized.width).toBeCloseTo(12 / 600)
    expect(resized.height).toBeCloseTo(12 / 800)
    expect(resized.x + resized.width).toBeLessThanOrEqual(1)
    expect(resized.y + resized.height).toBeLessThanOrEqual(1)
  })
})
