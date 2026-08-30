import { describe, expect, it } from 'vitest'
import {
  annotationBounds,
  annotationSchema,
  annotationSidecarSchema,
  createAnnotationBase,
  translateAnnotation,
  type Annotation,
} from './annotations'

const style = { color: '#f5c84b', opacity: 0.34, strokeWidth: 1.7 }

function markup(): Annotation {
  return {
    ...createAnnotationBase('document-1', 3, 'human', style),
    kind: 'markup',
    markup: 'highlight',
    selectedText: 'Structured annotations remain portable.',
    quoteAnchor: { quote: 'Structured annotations remain portable.' },
    quads: [
      { x: 0.1, y: 0.2, width: 0.25, height: 0.03 },
      { x: 0.1, y: 0.24, width: 0.18, height: 0.03 },
    ],
  }
}

describe('annotation schema', () => {
  it('accepts a complete text markup annotation', () => {
    expect(annotationSchema.parse(markup()).kind).toBe('markup')
  })

  it('rejects out-of-page normalized coordinates', () => {
    const invalid = markup()
    if (invalid.kind !== 'markup') throw new Error('Fixture should be markup')
    invalid.quads[0] = { x: -0.1, y: 0.2, width: 0.2, height: 0.03 }
    expect(() => annotationSchema.parse(invalid)).toThrow()
  })

  it('rejects empty selected text and invalid page numbers', () => {
    expect(() => annotationSchema.parse({ ...markup(), selectedText: '', pageNumber: 0 })).toThrow()
  })

  it('computes a bounding box across multiple markup quads', () => {
    const bounds = annotationBounds(markup())
    expect(bounds?.x).toBeCloseTo(0.1)
    expect(bounds?.y).toBeCloseTo(0.2)
    expect(bounds?.width).toBeCloseTo(0.25)
    expect(bounds?.height).toBeCloseTo(0.07)
  })

  it('computes ink bounds independently of zoom', () => {
    const base = createAnnotationBase('document-1', 1, 'webmcp', { ...style, opacity: 1 })
    const ink = annotationSchema.parse({
      ...base,
      kind: 'ink',
      strokes: [[{ x: 0.2, y: 0.5 }, { x: 0.7, y: 0.1 }, { x: 0.4, y: 0.9 }]],
    })
    const bounds = annotationBounds(ink)
    expect(bounds?.x).toBeCloseTo(0.2)
    expect(bounds?.y).toBeCloseTo(0.1)
    expect(bounds?.width).toBeCloseTo(0.5)
    expect(bounds?.height).toBeCloseTo(0.8)
  })

  it('uses persisted note dimensions and keeps them aligned when moving', () => {
    const note = annotationSchema.parse({
      ...createAnnotationBase('document-1', 1, 'human', style),
      kind: 'note',
      point: { x: 0.1, y: 0.2 },
      bounds: { x: 0.1, y: 0.2, width: 0.3, height: 0.15 },
      body: 'Resizable note',
      resolved: false,
    })

    expect(note.kind).toBe('note')
    if (note.kind !== 'note') throw new Error('Fixture should be a note')
    expect(annotationBounds(note)).toEqual(note.bounds)
    const moved = translateAnnotation(note, 0.2, 0.1)
    expect(moved.kind).toBe('note')
    if (moved.kind !== 'note') throw new Error('Fixture should be a note')
    expect(moved.point.x).toBeCloseTo(0.3)
    expect(moved.point.y).toBeCloseTo(0.3)
    expect(moved.bounds?.x).toBeCloseTo(0.3)
    expect(moved.bounds?.y).toBeCloseTo(0.3)
    expect(moved.bounds?.width).toBeCloseTo(0.3)
    expect(moved.bounds?.height).toBeCloseTo(0.15)
  })
})

describe('annotation sidecar', () => {
  it('validates the portable envelope and annotations', () => {
    const sidecar = {
      schemaVersion: 1,
      app: 'mimir',
      appVersion: '0.1.0',
      document: { fingerprint: 'abc123', name: 'paper.pdf', pageCount: 8 },
      exportedAt: new Date().toISOString(),
      annotations: [markup()],
    }
    expect(annotationSidecarSchema.parse(sidecar).annotations).toHaveLength(1)
  })

  it('rejects a future schema version rather than silently misreading it', () => {
    expect(() => annotationSidecarSchema.parse({
      schemaVersion: 2,
      app: 'mimir',
      appVersion: '1.0.0',
      document: { fingerprint: 'abc123', name: 'paper.pdf', pageCount: 8 },
      exportedAt: new Date().toISOString(),
      annotations: [],
    })).toThrow()
  })
})
