// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import type { Annotation } from '#/lib/annotations'
import type { DocumentRecord } from '#/lib/db.client'
import { defaultNoteSizePx, notePinSizePx } from '#/lib/annotation-geometry'
import { editorStore } from '#/lib/editor-store.client'
import { AnnotationOverlay } from './annotation-overlay'

const pageWidth = 612
const pageHeight = 792

const activeDocument = { id: 'document-1', pageCount: 1 } as DocumentRecord

const originalGetBoundingClientRect = SVGElement.prototype.getBoundingClientRect
const originalLocalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage')
const storage = new Map<string, string>()
const localStorageMock = {
  clear: () => storage.clear(),
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
}

const collapsedNote: Annotation = {
  schemaVersion: 1,
  id: 'note-1',
  documentId: 'document-1',
  pageNumber: 1,
  style: { color: '#f5c84b', opacity: 1, strokeWidth: 2 },
  createdBy: 'human',
  lastModifiedBy: 'human',
  createdAt: '2026-08-31T00:00:00.000Z',
  updatedAt: '2026-08-31T00:00:00.000Z',
  kind: 'note',
  point: { x: 0.9, y: 0.2 },
  bounds: { x: 0.645, y: 0.2, width: defaultNoteSizePx.width / pageWidth, height: defaultNoteSizePx.height / pageHeight },
  anchorRight: true,
  body: 'Remember this.',
  resolved: false,
}

describe('annotation overlay note placement', () => {
  let created: Array<Annotation> = []

  beforeEach(() => {
    created = []
    SVGElement.prototype.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: pageWidth, height: pageHeight, right: pageWidth, bottom: pageHeight, x: 0, y: 0 }) as DOMRect
    editorStore.setState({
      tool: 'note',
      activeDocument,
      selectedAnnotationId: null,
      selectedAnnotationIds: [],
      createAnnotations: async (annotations) => {
        created = annotations
      },
    })
  })

  afterEach(() => {
    cleanup()
    SVGElement.prototype.getBoundingClientRect = originalGetBoundingClientRect
  })

  const placeNoteAt = (clientX: number) => {
    const { container } = render(
      <AnnotationOverlay pageNumber={1} annotations={[]} pageWidth={pageWidth} pageHeight={pageHeight} zoom={1} />,
    )
    const svg = container.querySelector('svg')
    if (!svg) throw new Error('overlay did not render')
    fireEvent.pointerDown(svg, { clientX, clientY: 0.2 * pageHeight, pointerId: 1 })
    const note = created[0]
    if (note?.kind !== 'note') throw new Error('no note was created')
    return note
  }

  it('leaves the pin where it was clicked near the right margin', () => {
    const note = placeNoteAt(0.9 * pageWidth)

    expect(note.point.x).toBeCloseTo(0.9)
    expect(note.anchorRight).toBe(true)
    // The panel opens toward the page, ending flush with the pin's right edge.
    expect(note.bounds && (note.bounds.x + note.bounds.width) * pageWidth).toBeCloseTo(0.9 * pageWidth + notePinSizePx)
    expect(note.bounds && note.bounds.x).toBeGreaterThanOrEqual(0)
  })

  it('opens from the pin when the panel fits to the right', () => {
    const note = placeNoteAt(0.2 * pageWidth)

    expect(note.point.x).toBeCloseTo(0.2)
    expect(note.anchorRight).toBe(false)
    expect(note.bounds?.x).toBeCloseTo(0.2)
    expect(note.bounds?.width).toBeCloseTo(defaultNoteSizePx.width / pageWidth)
  })

  it('holds only the pin on the page, not the panel', () => {
    const note = placeNoteAt(pageWidth)

    expect(note.point.x).toBeCloseTo(1 - notePinSizePx / pageWidth)
  })
})

describe('annotation overlay marquee selection', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: localStorageMock })
    localStorageMock.clear()
    SVGElement.prototype.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: pageWidth, height: pageHeight, right: pageWidth, bottom: pageHeight, x: 0, y: 0 }) as DOMRect
    editorStore.setState({
      tool: 'select',
      activeDocument,
      selectedAnnotationId: null,
      selectedAnnotationIds: [],
    })
  })

  afterEach(() => {
    cleanup()
    SVGElement.prototype.getBoundingClientRect = originalGetBoundingClientRect
    if (originalLocalStorage) Object.defineProperty(window, 'localStorage', originalLocalStorage)
  })

  const marqueeOver = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const { container } = render(
      <AnnotationOverlay pageNumber={1} annotations={[collapsedNote]} pageWidth={pageWidth} pageHeight={pageHeight} zoom={1} />,
    )
    const svg = container.querySelector('svg')
    if (!svg) throw new Error('overlay did not render')
    svg.setPointerCapture = () => {}
    svg.hasPointerCapture = () => true
    svg.releasePointerCapture = () => {}
    fireEvent.pointerDown(svg, { clientX: from.x * pageWidth, clientY: from.y * pageHeight, pointerId: 1 })
    fireEvent.pointerMove(svg, { clientX: to.x * pageWidth, clientY: to.y * pageHeight, pointerId: 1 })
    fireEvent.pointerUp(svg, { clientX: to.x * pageWidth, clientY: to.y * pageHeight, pointerId: 1 })
    await waitFor(() => expect(editorStore.getState().selectedAnnotationIds).toBeDefined())
    return editorStore.getState().selectedAnnotationIds
  }

  it('catches a collapsed note by its pin rather than the panel it would open to', async () => {
    localStorageMock.setItem('mimir:sticky-note-collapsed:note-1', 'true')

    // A box drawn just around the pin — far too small to contain the panel.
    expect(await marqueeOver({ x: 0.88, y: 0.18 }, { x: 0.96, y: 0.26 })).toEqual(['note-1'])
  })

  it('catches an open note by its panel', async () => {
    localStorageMock.setItem('mimir:sticky-note-collapsed:note-1', 'false')

    expect(await marqueeOver({ x: 0.6, y: 0.18 }, { x: 0.95, y: 0.5 })).toEqual(['note-1'])
  })
})
