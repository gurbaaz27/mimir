// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Annotation } from '#/lib/annotations'
import { editorStore } from '#/lib/editor-store.client'
import { NoteLayer } from './note-layer'

const note: Annotation = {
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
  point: { x: 0.2, y: 0.2 },
  body: 'Remember this.',
  resolved: false,
}

const originalLocalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage')
const storage = new Map<string, string>()
const localStorageMock = {
  clear: () => storage.clear(),
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
}

describe('note layer', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: localStorageMock })
    localStorageMock.clear()
    editorStore.setState({
      tool: 'select',
      selectedAnnotationId: note.id,
      selectedAnnotationIds: [note.id],
    })
  })

  afterEach(() => {
    cleanup()
    if (originalLocalStorage) Object.defineProperty(window, 'localStorage', originalLocalStorage)
  })

  it('collapses the selected note when a pointer lands outside it', async () => {
    render(
      <div
        data-testid="outside"
        onPointerDown={() => editorStore.getState().setSelectedAnnotation(null)}
      >
        <NoteLayer pageNumber={1} annotations={[note]} pageWidth={612} pageHeight={792} zoom={1} />
      </div>,
    )

    expect(document.querySelector('[data-annotation-id="note-1"]')).toBeTruthy()

    fireEvent.pointerDown(screen.getByTestId('outside'))

    await waitFor(() => expect(document.querySelector('[data-annotation-id="note-1"]')).toBeNull())
    expect(window.localStorage.getItem('mimir:sticky-note-collapsed:note-1')).toBe('true')
  })

  it('restores a note as collapsed after it is remounted', () => {
    window.localStorage.setItem('mimir:sticky-note-collapsed:note-1', 'true')

    render(<NoteLayer pageNumber={1} annotations={[note]} pageWidth={612} pageHeight={792} zoom={1} />)

    expect(document.querySelector('[data-annotation-id="note-1"]')).toBeNull()
    expect(screen.getByRole('button', { name: /open note/i })).toBeTruthy()
  })

  it('shows a note body as formatted markdown until it is clicked into', () => {
    render(
      <NoteLayer
        pageNumber={1}
        annotations={[{ ...note, body: '**Check** this' }]}
        pageWidth={612}
        pageHeight={792}
        zoom={1}
      />,
    )

    const preview = screen.getByLabelText('Note body')
    expect(preview.querySelector('strong')?.textContent).toBe('Check')
    expect(screen.queryByRole('textbox')).toBeNull()

    fireEvent.click(preview)

    // The editor holds the markdown source itself, styled rather than stripped.
    const editor = screen.getByRole('textbox')
    expect(editor.textContent).toBe('**Check** this')
    expect(editor.querySelector('.font-\\[680\\]')?.textContent).toBe('Check')
  })

  it('opens a note near the right edge toward the page instead of overflowing', () => {
    window.localStorage.setItem('mimir:sticky-note-collapsed:note-1', 'true')
    const rightEdgeNote = { ...note, point: { x: 0.9, y: 0.2 } }

    render(<NoteLayer pageNumber={1} annotations={[rightEdgeNote]} pageWidth={612} pageHeight={792} zoom={1} />)

    fireEvent.click(screen.getByRole('button'))

    const noteElement = document.querySelector('[data-annotation-id="note-1"]') as HTMLElement
    expect(noteElement).toBeTruthy()
    expect(Number.parseFloat(noteElement.style.left)).toBeCloseTo(394.8)
    expect(Number.parseFloat(noteElement.style.left) + Number.parseFloat(noteElement.style.width)).toBeCloseTo(572.8)
  })

  it('honours the stored side for a note that mounts already open', () => {
    // The shape the note tool writes at the right margin: pin where it was
    // clicked, panel already placed to its left.
    const placed: Annotation = {
      ...note,
      point: { x: 0.9, y: 0.2 },
      bounds: { x: 394.8 / 612, y: 0.2, width: 178 / 612, height: 118 / 792 },
      anchorRight: true,
    }

    render(<NoteLayer pageNumber={1} annotations={[placed]} pageWidth={612} pageHeight={792} zoom={1} />)

    const noteElement = document.querySelector('[data-annotation-id="note-1"]') as HTMLElement
    expect(noteElement).toBeTruthy()
    expect(Number.parseFloat(noteElement.style.left)).toBeCloseTo(394.8)
    expect(Number.parseFloat(noteElement.style.left) + Number.parseFloat(noteElement.style.width)).toBeCloseTo(572.8)
  })

  it('keeps a legacy note flush with its pin when the panel still fits', () => {
    const legacy: Annotation = {
      ...note,
      point: { x: 0.2, y: 0.2 },
      bounds: { x: 0.2, y: 0.2, width: 178 / 612, height: 118 / 792 },
    }

    render(<NoteLayer pageNumber={1} annotations={[legacy]} pageWidth={612} pageHeight={792} zoom={1} />)

    const noteElement = document.querySelector('[data-annotation-id="note-1"]') as HTMLElement
    expect(Number.parseFloat(noteElement.style.left)).toBeCloseTo(0.2 * 612)
  })
})
