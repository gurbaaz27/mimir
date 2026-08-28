// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { db } from '#/lib/db.client'
import { editorStore } from '#/lib/editor-store.client'
import { LibraryView } from './library-view'

describe('local document library', () => {
  beforeEach(async () => {
    await db.documents.clear()
    editorStore.setState({ documents: [], activeDocument: null, status: 'idle', error: null })
  })

  afterEach(cleanup)

  it('teaches the private local-first upload workflow on first run', async () => {
    render(<LibraryView />)
    expect(screen.getByRole('heading', { name: 'Read closely.' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /drop a pdf to begin/i })).toBeTruthy()
    expect(screen.getByText(/processed locally and never uploaded/i)).toBeTruthy()
    await waitFor(() => expect(editorStore.getState().documents).toHaveLength(0))
  })
})
