import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createAnnotationBase, type Annotation } from './annotations'
import { db, type DocumentRecord } from './db.client'
import { editorStore } from './editor-store.client'

function note(): Annotation {
  return {
    ...createAnnotationBase('document-1', 2, 'human', {
      color: '#159b98',
      opacity: 1,
      strokeWidth: 2,
    }),
    kind: 'note',
    point: { x: 0.4, y: 0.3 },
    body: 'Check the methodology.',
    resolved: false,
  }
}

describe('shared editor command path', () => {
  beforeEach(async () => {
    await db.documents.clear()
    await db.annotations.clear()
    await db.chatHistories.clear()
    editorStore.setState({
      annotations: [],
      history: [],
      future: [],
      selectedAnnotationId: null,
      activeDocument: null,
      zoom: 1,
    })
  })

  it('persists, undoes, and redoes the same annotation command', async () => {
    const annotation = note()
    await editorStore.getState().createAnnotations([annotation], 'Add note')
    expect(editorStore.getState().annotations).toHaveLength(1)
    expect(await db.annotations.get(annotation.id)).toMatchObject({ body: 'Check the methodology.' })

    await editorStore.getState().undo()
    expect(editorStore.getState().annotations).toHaveLength(0)
    expect(await db.annotations.get(annotation.id)).toBeUndefined()

    await editorStore.getState().redo()
    expect(editorStore.getState().annotations).toHaveLength(1)
    expect(await db.annotations.get(annotation.id)).toBeDefined()
  })

  it('persists zoom changes without requiring the document to be closed', async () => {
    const record: DocumentRecord = {
      id: 'document-1',
      fingerprint: 'fingerprint',
      name: 'research-notes.pdf',
      size: 1024,
      pageCount: 12,
      blob: new Blob(['pdf']),
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
      lastPage: 1,
      zoom: 1.3,
      rotation: 0,
      indexedPages: 0,
    }
    await db.documents.add(record)
    await editorStore.getState().openDocument(record.id)

    await editorStore.getState().setZoom(1.2)

    expect(editorStore.getState().zoom).toBe(1.2)
    expect((await db.documents.get(record.id))?.zoom).toBe(1.2)
  })

  it('preserves authorship when an agent edit uses the human command model', async () => {
    const annotation = note()
    await editorStore.getState().createAnnotations([annotation])
    const updated = await editorStore.getState().updateAnnotation(
      annotation.id,
      { body: 'Agent-reviewed methodology.' } as Partial<Annotation>,
      'webmcp',
    )
    expect(updated.lastModifiedBy).toBe('webmcp')
    expect(updated.createdBy).toBe('human')
    expect(editorStore.getState().history).toHaveLength(2)
  })

  it('removes persisted chat history when its document is deleted', async () => {
    const record: DocumentRecord = {
      id: 'document-1',
      fingerprint: 'fingerprint',
      name: 'research-notes.pdf',
      size: 1024,
      pageCount: 12,
      blob: new Blob(['pdf']),
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
      lastPage: 1,
      zoom: 1,
      rotation: 0,
      indexedPages: 0,
    }
    await db.documents.add(record)
    await db.chatHistories.add({
      documentId: record.id,
      messages: [{ id: 'message-1', role: 'user', parts: [{ type: 'text', content: 'Hello' }] }],
    })

    await editorStore.getState().deleteDocument(record.id)

    expect(await db.chatHistories.get(record.id)).toBeUndefined()
  })
})
