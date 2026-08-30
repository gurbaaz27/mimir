// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '#/lib/db.client'
import { editorStore } from '#/lib/editor-store.client'
import { LibraryView } from './library-view'

describe('local document library', () => {
  beforeEach(async () => {
    await db.documents.clear()
    editorStore.setState({ documents: [], activeDocument: null, status: 'idle', error: null })
  })

  afterEach(cleanup)

  it('teaches the local-first upload workflow on first run', async () => {
    render(<LibraryView />)
    expect(screen.getByRole('heading', { name: /where gods humans and ai study together/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /drop a pdf to begin/i })).toBeTruthy()
    expect(screen.getByText(/pdfs never leave the browser/i)).toBeTruthy()
    await waitFor(() => expect(editorStore.getState().documents).toHaveLength(0))
  })

  it('asks for confirmation in a modal before removing a document', async () => {
    const record = {
      id: 'doc-1',
      fingerprint: 'fingerprint',
      name: 'research-notes.pdf',
      size: 1024,
      pageCount: 12,
      blob: new Blob(['pdf']),
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
      lastPage: 3,
      zoom: 1,
      rotation: 0,
      indexedPages: 12,
    }
    await db.documents.add(record)
    const user = userEvent.setup()
    render(<LibraryView />)

    expect(await screen.findByRole('button', { name: /drop another pdf here/i })).toBeTruthy()
    expect(document.querySelectorAll('[data-slot="pitch-line"]')[1]?.textContent).toMatch(/ask your agent to do that for you/i)
    expect(screen.getByText(/pdfs never leave the browser/i)).toBeTruthy()

    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
    await user.click(screen.getByRole('button', { name: 'My Library' }))
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })

    await user.click(await screen.findByRole('button', { name: /more options for research-notes\.pdf/i }))
    await user.click(screen.getByRole('menuitem', { name: /remove/i }))

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText(/pdf and its local annotations will be removed/i)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /remove document/i }))
    await waitFor(async () => expect(await db.documents.get(record.id)).toBeUndefined())
  })
})
