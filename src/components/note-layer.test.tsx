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

describe('note layer', () => {
  beforeEach(() => {
    editorStore.setState({
      tool: 'select',
      selectedAnnotationId: note.id,
      selectedAnnotationIds: [note.id],
    })
  })

  afterEach(() => cleanup())

  it('collapses the selected note when a pointer lands outside it', async () => {
    render(
      <div
        data-testid="outside"
        onPointerDown={() => editorStore.getState().setSelectedAnnotation(null)}
      >
        <NoteLayer pageNumber={1} annotations={[note]} pageWidth={612} pageHeight={792} zoom={1} />
      </div>,
    )

    expect(screen.getByRole('textbox')).toBeTruthy()

    fireEvent.pointerDown(screen.getByTestId('outside'))

    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
  })
})
