// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createAnnotationBase, type Annotation } from './annotations'
import { textLayerAttribute } from './annotation-geometry'
import { db, type DocumentRecord } from './db.client'
import { editorStore } from './editor-store.client'
import { documentTools, isToolFailure } from './webmcp.client'

const documentId = 'document-1'
const style = { color: '#159b98', opacity: 0.85, strokeWidth: 2 }
const noop = { signal: new AbortController().signal }

function record(): DocumentRecord {
  return {
    id: documentId,
    fingerprint: 'fingerprint',
    name: 'paper.pdf',
    size: 1024,
    pageCount: 4,
    blob: new Blob(['%PDF']),
    createdAt: new Date().toISOString(),
    lastOpenedAt: new Date().toISOString(),
    lastPage: 1,
    zoom: 1,
    rotation: 0,
    indexedPages: 2,
  }
}

function note(author: Annotation['createdBy']): Annotation {
  return {
    ...createAnnotationBase(documentId, 1, author, style),
    kind: 'note',
    point: { x: 0.5, y: 0.5 },
    body: 'Check the methodology.',
    resolved: false,
  }
}

function ink(author: Annotation['createdBy']): Annotation {
  return {
    ...createAnnotationBase(documentId, 2, author, style),
    kind: 'ink',
    strokes: [Array.from({ length: 40 }, (_, index) => ({ x: index / 100, y: index / 200 }))],
  }
}

/**
 * A stand-in for a rendered PDF page. jsdom has no layout, so the geometry the
 * anchoring code reads is stubbed to fixed, plausible rectangles.
 */
function mountPage(pageNumber: number, chunks: Array<string>) {
  const page = document.createElement('div')
  page.setAttribute('data-page-number', String(pageNumber))
  const layer = document.createElement('div')
  // Marked the way the renderer marks it. Hard-coding the old `.textLayer`
  // class here is what let the Tailwind migration break quote anchoring in the
  // real app while this suite stayed green.
  layer.setAttribute(textLayerAttribute, '')
  for (const chunk of chunks) {
    const span = document.createElement('span')
    span.textContent = chunk
    layer.append(span)
  }
  page.append(layer)
  document.body.append(page)
  return page
}

function stubLayout() {
  Element.prototype.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 600, bottom: 800, width: 600, height: 800, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  Range.prototype.getClientRects = () =>
    [{ left: 50, top: 100, right: 150, bottom: 112, width: 100, height: 12, x: 50, y: 100, toJSON: () => ({}) }] as unknown as DOMRectList
}

function toolNamed(name: string) {
  const definition = documentTools(documentId).find((item) => item.name === name)
  if (!definition) throw new Error(`No tool named ${name}`)
  return definition
}

async function run(name: string, input: Record<string, unknown> = {}) {
  return (await toolNamed(name).execute(input, noop)) as Record<string, unknown>
}

/**
 * Failures come back as data rather than as a rejection, because WebMCP drops a
 * thrown error's message on the way to the agent. This reads the sentence back
 * out, and fails loudly if the call unexpectedly succeeded.
 */
async function failureOf(name: string, input: Record<string, unknown> = {}) {
  const result = await toolNamed(name).execute(input, noop)
  if (!isToolFailure(result)) throw new Error(`Expected ${name} to fail, got ${JSON.stringify(result)}`)
  return result.error
}

describe('document tools over the shared command path', () => {
  beforeEach(async () => {
    await db.annotations.clear()
    await db.textPages.clear()
    editorStore.setState({
      activeDocument: record(),
      annotations: [],
      outline: null,
      history: [],
      future: [],
      selectedAnnotationId: null,
      currentPage: 1,
      toast: null,
    })
  })

  it('keeps list payloads small until geometry is asked for', async () => {
    const stroke = ink('human')
    editorStore.setState({ annotations: [stroke] })

    const summarised = await run('list_annotations')
    expect(summarised.annotations).toEqual([
      expect.objectContaining({ id: stroke.id, kind: 'ink', label: 'ink', pageNumber: 2, text: null }),
    ])
    expect(JSON.stringify(summarised.annotations)).not.toContain('strokes')

    const full = await run('list_annotations', { detail: 'full' })
    expect(JSON.stringify(full.annotations)).toContain('strokes')
  })

  it('lands a batch of updates as a single undo step', async () => {
    const first = note('webmcp')
    const second = { ...note('webmcp'), body: 'Second note.' }
    await editorStore.getState().createAnnotations([first, second], 'Add notes')
    editorStore.setState({ history: [], future: [] })

    const result = await run('update_annotations', {
      updates: [
        { id: first.id, body: 'Revised.' },
        { id: second.id, resolved: true },
      ],
    })

    expect(result.updated).toHaveLength(2)
    expect(editorStore.getState().history).toHaveLength(1)
    expect(editorStore.getState().annotations.every((item) => item.lastModifiedBy === 'webmcp')).toBe(true)
  })

  it('refuses a field the annotation kind does not have instead of quietly dropping it', async () => {
    const stroke = ink('webmcp')
    const comment = note('webmcp')
    await editorStore.getState().createAnnotations([stroke, comment], 'Add marks')

    const result = await run('update_annotations', {
      updates: [
        { id: stroke.id, body: 'Ink has no body.' },
        { id: comment.id, body: 'Notes do.' },
      ],
    })

    expect(result.updated).toEqual([{ id: comment.id, changed: ['body'] }])
    expect(result.failed).toEqual([expect.objectContaining({ id: stroke.id })])
    expect((result.failed as Array<{ reason: string }>)[0]?.reason).toContain('no body')
    expect(editorStore.getState().annotations.find((item) => item.id === stroke.id)).toEqual(stroke)
  })

  it('leaves the reader’s own marks alone unless deletion is widened', async () => {
    const mine = note('webmcp')
    const theirs = note('human')
    await editorStore.getState().createAnnotations([mine, theirs], 'Add marks')

    const guarded = await run('delete_annotations', { ids: [mine.id, theirs.id] })
    expect(guarded.deleted).toEqual([mine.id])
    expect(guarded.skipped).toEqual([{ id: theirs.id, reason: 'created_by_human' }])
    expect(editorStore.getState().annotations).toHaveLength(1)

    await run('delete_annotations', { ids: [theirs.id], includeHumanAnnotations: true })
    expect(editorStore.getState().annotations).toHaveLength(0)
  })

  it('refuses a delete of only human marks rather than reporting an empty success', async () => {
    const theirs = note('human')
    await editorStore.getState().createAnnotations([theirs], 'Add mark')
    expect(await failureOf('delete_annotations', { ids: [theirs.id] })).toMatch(/made by the reader/)
  })

  it('lets an agent revert its own change', async () => {
    const mine = note('webmcp')
    await editorStore.getState().createAnnotations([mine], 'Add agent annotation')

    const result = await run('undo_last_change')
    expect(result.undone).toBe('Add agent annotation')
    expect(editorStore.getState().annotations).toHaveLength(0)

    expect(await run('undo_last_change')).toEqual({ undone: null, message: 'There is nothing to undo.' })
  })

  it('reads a page range in one call and points at what comes next', async () => {
    await db.textPages.bulkPut([
      { documentId, pageNumber: 1, text: 'alpha '.repeat(20).trim() },
      { documentId, pageNumber: 2, text: 'beta '.repeat(20).trim() },
    ])

    const result = await run('read_document_text', { pageNumber: 1, endPage: 2, maxChars: 150 })
    expect((result.pages as Array<unknown>).length).toBe(2)
    expect(result.nextPage).toBe(2)
    expect(result.nextCursor).toBe(31)
  })

  it('separates a page still being indexed from a page that is a scan', async () => {
    await db.textPages.put({ documentId, pageNumber: 1, text: '' })

    expect(await failureOf('read_document_text', { pageNumber: 1 })).toMatch(/most likely a scan/)
    expect(await failureOf('read_document_text', { pageNumber: 3 })).toMatch(/not been indexed yet/)
    expect(await failureOf('read_document_text', { pageNumber: 9 })).toMatch(/outside this PDF/)
  })

  it('reports text availability so an agent knows quote anchoring is hopeless', async () => {
    await db.textPages.bulkPut([
      { documentId, pageNumber: 1, text: '' },
      { documentId, pageNumber: 2, text: '' },
    ])

    const context = (await run('get_document_context')) as { text: { pagesWithText: number; note: string | null } }
    expect(context.text.pagesWithText).toBe(0)
    expect(context.text.note).toContain('most likely a scan')
  })

  it('reads the page text around a highlight', async () => {
    await db.textPages.put({
      documentId,
      pageNumber: 1,
      text: 'Before the claim. The methodology is sound. After the claim.',
    })
    const highlight: Annotation = {
      ...createAnnotationBase(documentId, 1, 'webmcp', style),
      kind: 'markup',
      markup: 'highlight',
      selectedText: 'The methodology is sound.',
      quads: [{ x: 0.1, y: 0.2, width: 0.4, height: 0.02 }],
    }
    editorStore.setState({ annotations: [highlight] })

    const result = (await run('get_annotation_context', { annotationId: highlight.id })) as {
      locatedBy: string
      context: { before: string; match: string; after: string }
    }
    expect(result.locatedBy).toBe('quote')
    expect(result.context.before).toBe('Before the claim. ')
    expect(result.context.match).toBe('The methodology is sound.')
    expect(result.context.after).toBe(' After the claim.')
  })

  it('explains a bad id instead of failing anonymously', async () => {
    expect(await failureOf('navigate_document', { annotationId: 'nope' })).toMatch(/list_annotations for current ids/)
  })
})

describe('the published document surface', () => {
  it('names every tool an agent needs while a PDF is open', () => {
    expect(documentTools(documentId).map((item) => item.name)).toEqual([
      'get_document_context',
      'get_document_outline',
      'read_document_text',
      'search_document',
      'navigate_document',
      'list_annotations',
      'get_annotation_context',
      'create_annotations',
      'update_annotations',
      'delete_annotations',
      'undo_last_change',
      'prepare_export',
    ])
  })

  it('marks reads as read-only so an agent can tell them apart from mutations', () => {
    const byName = new Map(documentTools(documentId).map((item) => [item.name, item.annotations?.readOnlyHint]))
    expect(byName.get('read_document_text')).toBe(true)
    expect(byName.get('list_annotations')).toBe(true)
    expect(byName.get('create_annotations')).toBe(false)
    expect(byName.get('undo_last_change')).toBe(false)
  })
})

describe('anchoring marks to what the page actually says', () => {
  beforeEach(async () => {
    await db.annotations.clear()
    await db.textPages.clear()
    document.body.innerHTML = ''
    stubLayout()
    editorStore.setState({
      activeDocument: record(),
      annotations: [],
      outline: null,
      history: [],
      future: [],
      selectedAnnotationId: null,
      currentPage: 1,
      toast: null,
    })
  })

  it('pins a note inside the page when its quote ends at the right margin', async () => {
    // The pin is derived just past the quote, so a quote in a table's last
    // column pushed x above 1 and the annotation schema rejected it — failing
    // the whole batch over geometry the caller never supplied.
    Range.prototype.getClientRects = () =>
      [{ left: 560, top: 100, right: 620, bottom: 112, width: 60, height: 12, x: 560, y: 100, toJSON: () => ({}) }] as unknown as DOMRectList
    mountPage(1, ['The methodology is sound.'])

    const result = await run('create_annotations', {
      annotations: [{ kind: 'note', pageNumber: 1, body: 'Is it?', target: { quote: 'methodology is sound' } }],
    })

    expect(result.failed).toEqual([])
    const stored = editorStore.getState().annotations[0]
    if (stored?.kind === 'note') expect(stored.point.x).toBe(1)
  })

  it('reports an unrendered text layer as unrendered, not as a scan', async () => {
    // The page is present and its text is indexed, but the layer has not
    // rendered. Saying "most likely a scan" here is a false diagnosis, and an
    // agent acts on it: it stops anchoring and tells the reader the PDF is an
    // image. Say what is actually known.
    await db.textPages.put({ documentId, pageNumber: 1, text: 'The methodology is sound.' })
    const bare = document.createElement('div')
    bare.setAttribute('data-page-number', '1')
    document.body.append(bare)

    const message = await failureOf('create_annotations', {
      annotations: [{ kind: 'note', pageNumber: 1, body: 'x', target: { quote: 'methodology' } }],
    })

    expect(message).toMatch(/text layer has not rendered/)
    expect(message).toMatch(/does have extractable text/)
    expect(message).not.toMatch(/most likely a scan/)
  })

  it('anchors a quote that pdf.js split across text-layer spans', async () => {
    // The regression this guards: a text layer is absolutely positioned spans,
    // and kerning routinely breaks a token across two of them. The separator
    // between nodes then lands mid-token, so "D-9519/T1" reads as
    // "D-9519 /T1" and never matches — while search_document, reading the
    // extracted page text rather than the DOM, insists it is right there.
    mountPage(1, ['Decided', '5', 'D-9519', '/T1', 'CS', '193', 'NEGLIGENCE IN DUTY'])

    const created = await run('create_annotations', {
      annotations: [
        { kind: 'note', pageNumber: 1, body: 'less go', target: { quote: 'D-9519/T1' } },
      ],
    })

    expect(created.failed).toEqual([])
    expect(created.created).toEqual([expect.objectContaining({ kind: 'note', pageNumber: 1 })])
  })

  it('still reports a quote that is genuinely absent from the page', async () => {
    mountPage(1, ['Case Status Decided'])
    expect(
      await failureOf('create_annotations', {
        annotations: [{ kind: 'note', pageNumber: 1, body: 'x', target: { quote: 'nowhere on this page' } }],
      }),
    ).toMatch(/was not found in page 1/)
  })

  it('highlights a quote by finding it in the rendered text layer', async () => {
    mountPage(1, ['Before the claim.', 'The methodology', 'is sound.', 'After the claim.'])

    const result = (await run('create_annotations', {
      annotations: [
        { kind: 'markup', pageNumber: 1, markup: 'highlight', target: { quote: 'methodology is sound' } },
      ],
    })) as { created: Array<{ id: string; kind: string }>; failed: Array<unknown> }

    expect(result.failed).toEqual([])
    expect(result.created).toEqual([expect.objectContaining({ kind: 'markup', pageNumber: 1 })])
    const stored = editorStore.getState().annotations[0]
    expect(stored?.kind).toBe('markup')
    expect(stored?.createdBy).toBe('webmcp')
    if (stored?.kind === 'markup') {
      expect(stored.quads).toEqual([{ x: 50 / 600, y: 100 / 800, width: 100 / 600, height: 12 / 800 }])
      expect(stored.quoteAnchor?.quote).toBe('methodology is sound')
    }
  })

  it('derives a note’s pin from the quote it is attached to', async () => {
    mountPage(1, ['The methodology is sound.'])

    await run('create_annotations', {
      annotations: [
        { kind: 'note', pageNumber: 1, body: 'Is it?', target: { quote: 'methodology is sound' } },
      ],
    })

    const stored = editorStore.getState().annotations[0]
    expect(stored?.kind).toBe('note')
    if (stored?.kind === 'note') expect(stored.point).toEqual({ x: 150 / 600, y: 100 / 800 })
  })

  it('tells the agent where the quote actually is when the page is wrong', async () => {
    mountPage(1, ['An unrelated opening paragraph.'])
    await db.textPages.put({ documentId, pageNumber: 3, text: 'The methodology is sound.' })

    expect(
      await failureOf('create_annotations', {
        annotations: [
          { kind: 'markup', pageNumber: 1, markup: 'highlight', target: { quote: 'methodology is sound' } },
        ],
      }),
    ).toMatch(/appears on page 3/)
    expect(editorStore.getState().annotations).toEqual([])
  })

  it('keeps the marks that worked when one item in the batch fails', async () => {
    mountPage(1, ['The methodology is sound.'])

    const result = (await run('create_annotations', {
      annotations: [
        { kind: 'markup', pageNumber: 1, markup: 'highlight', target: { quote: 'methodology is sound' } },
        { kind: 'note', pageNumber: 1, body: 'Floating note with nowhere to go.' },
      ],
    })) as { created: Array<unknown>; failed: Array<{ index: number; reason: string }> }

    expect(result.created).toHaveLength(1)
    expect(result.failed[0]).toMatchObject({ index: 1 })
    expect(result.failed[0]?.reason).toContain('point or a quote target')
    expect(editorStore.getState().history).toHaveLength(1)
  })

  it('navigates to a scanned page that will never render selectable text', async () => {
    mountPage(2, [])

    const result = await run('navigate_document', { pageNumber: 2 })
    expect(result).toEqual({ pageNumber: 2, annotationId: null, pageCount: 4 })
    expect(editorStore.getState().currentPage).toBe(2)
  })
})

describe('batches that name the same mark twice', () => {
  beforeEach(async () => {
    await db.annotations.clear()
    editorStore.setState({
      activeDocument: record(),
      annotations: [],
      outline: null,
      history: [],
      future: [],
      selectedAnnotationId: null,
      currentPage: 1,
      toast: null,
    })
  })

  it('layers repeated patches onto one record instead of duplicating it', async () => {
    const comment = note('webmcp')
    await editorStore.getState().createAnnotations([comment], 'Add note')
    editorStore.setState({ history: [], future: [] })

    const result = (await run('update_annotations', {
      updates: [
        { id: comment.id, body: 'First pass.' },
        { id: comment.id, resolved: true },
        { id: comment.id, style: { color: '#e76f51' } },
      ],
    })) as { updated: Array<{ id: string; changed: Array<string> }> }

    expect(result.updated).toEqual([{ id: comment.id, changed: ['body', 'resolved', 'style'] }])

    const annotations = editorStore.getState().annotations
    expect(annotations).toHaveLength(1)
    const stored = annotations[0]
    expect(stored?.kind).toBe('note')
    if (stored?.kind === 'note') {
      expect(stored.body).toBe('First pass.')
      expect(stored.resolved).toBe(true)
      expect(stored.style.color).toBe('#e76f51')
    }

    // What was persisted and what is in memory have to agree, or undo restores
    // one of them and not the other.
    expect(await db.annotations.where('documentId').equals(documentId).count()).toBe(1)
    expect(editorStore.getState().history).toHaveLength(1)

    await run('undo_last_change')
    expect(editorStore.getState().annotations).toEqual([comment])
    expect(await db.annotations.get(comment.id)).toMatchObject({
      body: 'Check the methodology.',
      resolved: false,
    })
  })

  it('keeps the valid patches when a later one fails the persisted schema', async () => {
    const first = note('webmcp')
    const second = { ...note('webmcp'), body: 'Second note.' }
    await editorStore.getState().createAnnotations([first, second], 'Add notes')
    editorStore.setState({ history: [], future: [] })

    // Style is the seam where the input contract and the persisted schema can
    // drift apart, so a patch that gets past one can still be rejected by the other.
    const result = (await run('update_annotations', {
      updates: [
        { id: first.id, body: 'Kept.' },
        { id: second.id, style: { opacity: 0.5 } },
      ],
    })) as { updated: Array<{ id: string }>; failed: Array<unknown> }

    expect(result.updated.map((entry) => entry.id)).toEqual([first.id, second.id])
    expect(result.failed).toEqual([])
    expect(editorStore.getState().history).toHaveLength(1)
  })

  it('rejects a style the annotation schema would refuse, at the contract edge', async () => {
    const comment = note('webmcp')
    await editorStore.getState().createAnnotations([comment], 'Add note')

    expect(
      await failureOf('update_annotations', { updates: [{ id: comment.id, style: { color: '' } }] }),
    ).toMatch(/style\.color/)
    expect(editorStore.getState().history).toHaveLength(1)
  })

  it('rejects a malformed batch whole, and says nothing was applied', async () => {
    const first = note('webmcp')
    const second = { ...note('webmcp'), body: 'Second note.' }
    await editorStore.getState().createAnnotations([first, second], 'Add notes')
    editorStore.setState({ history: [], future: [] })

    // Validation is all-or-nothing on purpose: an agent that has to work out
    // which half of a malformed batch landed is worse off than one that resends it.
    expect(
      await failureOf('update_annotations', {
        updates: [
          { id: first.id, body: 'Would have been fine.' },
          { id: second.id, style: { color: '' } },
        ],
      }),
    ).toMatch(/updates\[1\]\.style\.color.*Nothing was applied/s)

    expect(editorStore.getState().history).toEqual([])
    const stored = editorStore.getState().annotations.find((item) => item.id === first.id)
    expect(stored?.kind === 'note' && stored.body).toBe('Check the methodology.')
  })

  it('names the real limit when a body is too long for its kind', async () => {
    const box: Annotation = {
      ...createAnnotationBase(documentId, 1, 'webmcp', style),
      kind: 'text',
      bounds: { x: 0.1, y: 0.1, width: 0.4, height: 0.1 },
      body: 'Short.',
      alignment: 'left',
    }
    const comment = note('webmcp')
    await editorStore.getState().createAnnotations([box, comment], 'Add marks')
    editorStore.setState({ history: [], future: [] })

    // A note holds 25,000 characters and a text box 10,000, so the same body is
    // valid for one and not the other. The flat schema advertises the larger.
    const body = 'x'.repeat(12_000)
    const result = (await run('update_annotations', {
      updates: [
        { id: box.id, body },
        { id: comment.id, body },
      ],
    })) as { updated: Array<{ id: string }>; failed: Array<{ id: string; reason: string }> }

    expect(result.updated.map((entry) => entry.id)).toEqual([comment.id])
    expect(result.failed[0]?.id).toBe(box.id)
    expect(result.failed[0]?.reason).toBe(
      'A text annotation holds at most 10,000 characters, and this body has 12,000.',
    )

    const stored = editorStore.getState().annotations.find((item) => item.id === box.id)
    expect(stored?.kind === 'text' && stored.body).toBe('Short.')
    expect(editorStore.getState().history).toHaveLength(1)
  })

  it('reports a repeated delete id once', async () => {
    const mine = note('webmcp')
    await editorStore.getState().createAnnotations([mine], 'Add note')

    const result = await run('delete_annotations', { ids: [mine.id, mine.id] })
    expect(result.deleted).toEqual([mine.id])
    expect(editorStore.getState().annotations).toEqual([])
  })
})

describe('shape geometry the renderer can actually draw', () => {
  beforeEach(async () => {
    await db.annotations.clear()
    document.body.innerHTML = ''
    stubLayout()
    editorStore.setState({
      activeDocument: record(),
      annotations: [],
      outline: null,
      history: [],
      future: [],
      selectedAnnotationId: null,
      currentPage: 1,
      toast: null,
    })
  })

  it('rejects a line carrying bounds and a rectangle carrying endpoints', async () => {
    expect(
      await failureOf('create_annotations', {
        annotations: [{ kind: 'shape', pageNumber: 1, shape: 'line', bounds: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } }],
      }),
    ).toMatch(/start/)

    expect(
      await failureOf('create_annotations', {
        annotations: [
          { kind: 'shape', pageNumber: 1, shape: 'rectangle', start: { x: 0.1, y: 0.1 }, end: { x: 0.3, y: 0.3 } },
        ],
      }),
    ).toMatch(/bounds/)

    expect(editorStore.getState().annotations).toEqual([])
  })

  it('stores each subtype with only the geometry it draws from', async () => {
    await run('create_annotations', {
      annotations: [
        { kind: 'shape', pageNumber: 1, shape: 'ellipse', bounds: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } },
        { kind: 'shape', pageNumber: 1, shape: 'arrow', start: { x: 0.1, y: 0.1 }, end: { x: 0.3, y: 0.3 } },
      ],
    })

    const [ellipse, arrow] = editorStore.getState().annotations
    expect(ellipse?.kind === 'shape' && ellipse.bounds).toBeTruthy()
    expect(ellipse?.kind === 'shape' && ellipse.start).toBeUndefined()
    expect(arrow?.kind === 'shape' && arrow.start).toBeTruthy()
    expect(arrow?.kind === 'shape' && arrow.bounds).toBeUndefined()
  })
})
