import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createAnnotationBase, type Annotation } from './annotations'
import { db } from './db.client'
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
    await db.annotations.clear()
    editorStore.setState({ annotations: [], history: [], future: [], selectedAnnotationId: null })
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
})
