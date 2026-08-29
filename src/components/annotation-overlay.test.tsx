// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { editorStore } from '#/lib/editor-store.client'
import type { Annotation } from '#/lib/annotations'
import { AnnotationOverlay } from './annotation-overlay'

const PAGE_WIDTH = 600
const PAGE_HEIGHT = 800

function shape(fields: Record<string, unknown>) {
  return {
    id: 'a1',
    documentId: 'd1',
    pageNumber: 1,
    kind: 'shape',
    style: { color: '#c0392b', opacity: 0.9, strokeWidth: 2 },
    createdBy: 'human',
    lastModifiedBy: 'human',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...fields,
  } as unknown as Annotation
}

/** The handles' hit targets, in page pixels, keyed by the direction they resize. */
function hitTargets(annotation: Annotation) {
  editorStore.setState({
    tool: 'select',
    selectedAnnotationId: 'a1',
    selectedAnnotationIds: ['a1'],
    annotationDrag: null,
  })
  const { container } = render(
    <AnnotationOverlay
      pageNumber={1}
      annotations={[annotation]}
      pageWidth={PAGE_WIDTH}
      pageHeight={PAGE_HEIGHT}
    />,
  )
  return [...container.querySelectorAll('.annotation-resize-hit')].map((rect) => {
    const read = (name: string) => Number(rect.getAttribute(name))
    return {
      label: rect.getAttribute('aria-label') ?? '',
      left: read('x') * PAGE_WIDTH,
      top: read('y') * PAGE_HEIGHT,
      right: (read('x') + read('width')) * PAGE_WIDTH,
      bottom: (read('y') + read('height')) * PAGE_HEIGHT,
    }
  })
}

type Target = ReturnType<typeof hitTargets>[number]

// Touching edges are fine; only a real, visible overlap would let paint order
// steal the pointer from the handle it is nearest to.
const OVERLAP_TOLERANCE = 1e-3
function overlap(a: Target, b: Target) {
  return (
    Math.min(a.right, b.right) - Math.max(a.left, b.left) > OVERLAP_TOLERANCE &&
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > OVERLAP_TOLERANCE
  )
}

describe('resize handle hit targets', () => {
  afterEach(cleanup)

  it.each([
    ['a roomy rectangle', { x: 0.1, y: 0.1, width: 0.5, height: 0.4 }],
    ['a small rectangle', { x: 0.4, y: 0.4, width: 0.05, height: 0.03 }],
    ['a flat sliver', { x: 0.4, y: 0.4, width: 0.4, height: 0.008 }],
  ])('never let two handles cover the same point on %s', (_name, bounds) => {
    const targets = hitTargets(shape({ shape: 'rectangle', bounds }))
    const clashes = targets.flatMap((a, index) =>
      targets.slice(index + 1).filter((b) => overlap(a, b)).map((b) => `${a.label} / ${b.label}`),
    )

    expect(clashes).toEqual([])
  })

  it('gives each edge to the handle that sits on it', () => {
    const targets = hitTargets(shape({ shape: 'rectangle', bounds: { x: 0.1, y: 0.1, width: 0.5, height: 0.4 } }))
    const owner = (x: number, y: number) =>
      targets.filter((target) => x >= target.left && x <= target.right && y >= target.top && y <= target.bottom)
        .map((target) => target.label)

    expect(owner(0.6 * PAGE_WIDTH, 0.3 * PAGE_HEIGHT)).toEqual(['Resize rectangle from the right'])
    expect(owner(0.35 * PAGE_WIDTH, 0.5 * PAGE_HEIGHT)).toEqual(['Resize rectangle from the bottom'])
    expect(owner(0.1 * PAGE_WIDTH, 0.1 * PAGE_HEIGHT)).toEqual(['Resize rectangle from the top left'])
  })

  it('offers one grab point per endpoint on a line', () => {
    const targets = hitTargets(shape({ shape: 'arrow', start: { x: 0.2, y: 0.2 }, end: { x: 0.7, y: 0.6 } }))

    expect(targets.map((target) => target.label)).toEqual([
      'Move the start of the arrow',
      'Move the end of the arrow',
    ])
  })
})
