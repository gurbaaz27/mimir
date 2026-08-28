import '@tanstack/react-start/client-only'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import {
  annotationSchema,
  createAnnotationBase,
  pointSchema,
  quoteAnchorSchema,
  rectSchema,
  type Annotation,
  type AnnotationStyle,
} from './annotations'
import { db } from './db.client'
import { editorStore } from './editor-store.client'
import { searchDocumentText } from './search.client'

const styleInputSchema = z
  .object({
    color: z.string().optional(),
    opacity: z.number().min(0.05).max(1).optional(),
    strokeWidth: z.number().min(0.5).max(20).optional(),
    fill: z.string().optional(),
    fontSize: z.number().min(8).max(72).optional(),
  })
  .optional()

const createInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('markup'),
    pageNumber: z.number().int().positive(),
    markup: z.enum(['highlight', 'underline', 'strikeout']),
    target: quoteAnchorSchema,
    style: styleInputSchema,
  }),
  z.object({
    kind: z.literal('note'),
    pageNumber: z.number().int().positive(),
    body: z.string().max(25_000),
    point: pointSchema.optional(),
    target: quoteAnchorSchema.optional(),
    style: styleInputSchema,
  }),
  z.object({
    kind: z.literal('text'),
    pageNumber: z.number().int().positive(),
    body: z.string().max(10_000),
    bounds: rectSchema,
    style: styleInputSchema,
  }),
  z.object({
    kind: z.literal('shape'),
    pageNumber: z.number().int().positive(),
    shape: z.enum(['rectangle', 'ellipse', 'line', 'arrow']),
    bounds: rectSchema.optional(),
    start: pointSchema.optional(),
    end: pointSchema.optional(),
    style: styleInputSchema,
  }),
  z.object({
    kind: z.literal('ink'),
    pageNumber: z.number().int().positive(),
    strokes: z.array(z.array(pointSchema).min(2)).min(1),
    style: styleInputSchema,
  }),
])

function defaultStyle(style?: z.infer<typeof styleInputSchema>): AnnotationStyle {
  return {
    color: style?.color ?? '#159b98',
    opacity: style?.opacity ?? 0.85,
    strokeWidth: style?.strokeWidth ?? 2,
    fill: style?.fill,
    fontSize: style?.fontSize,
  }
}

function waitForPage(pageNumber: number) {
  editorStore.getState().setCurrentPage(pageNumber)
  window.dispatchEvent(new CustomEvent('mimir:navigate', { detail: { pageNumber } }))
  return new Promise<HTMLElement>((resolve, reject) => {
    let attempts = 0
    const findPage = () => {
      const page = document.querySelector<HTMLElement>(`[data-page-number="${pageNumber}"]`)
      if (page?.querySelector('.textLayer span')) {
        resolve(page)
        return
      }
      attempts += 1
      if (attempts > 25) {
        reject(new Error(`Page ${pageNumber} is not ready for text anchoring.`))
        return
      }
      window.setTimeout(findPage, 80)
    }
    findPage()
  })
}

async function resolveQuote(pageNumber: number, target: z.infer<typeof quoteAnchorSchema>) {
  const page = await waitForPage(pageNumber)
  const layer = page.querySelector<HTMLElement>('.textLayer')
  if (!layer) throw new Error(`Page ${pageNumber} has no selectable text.`)
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT)
  const nodes: Array<{ node: Text; start: number; end: number }> = []
  let rawText = ''
  let node = walker.nextNode()
  while (node) {
    const textNode = node as Text
    const value = textNode.data
    nodes.push({ node: textNode, start: rawText.length, end: rawText.length + value.length })
    rawText += `${value} `
    node = walker.nextNode()
  }

  let normalizedText = ''
  const normalizedToRaw: Array<number> = []
  for (let index = 0; index < rawText.length; index += 1) {
    const character = rawText[index]!
    if (/\s/.test(character)) {
      if (normalizedText && !normalizedText.endsWith(' ')) {
        normalizedText += ' '
        normalizedToRaw.push(index)
      }
    } else {
      normalizedText += character
      normalizedToRaw.push(index)
    }
  }
  const haystack = normalizedText.toLocaleLowerCase()
  const needle = target.quote.replace(/\s+/g, ' ').trim().toLocaleLowerCase()
  const matches: Array<number> = []
  let from = 0
  while (from <= haystack.length) {
    const index = haystack.indexOf(needle, from)
    if (index < 0) break
    const prefixMatches = !target.prefix || haystack.slice(Math.max(0, index - target.prefix.length), index).endsWith(target.prefix.toLocaleLowerCase())
    const suffixMatches =
      !target.suffix ||
      haystack
        .slice(index + needle.length, index + needle.length + target.suffix.length)
        .startsWith(target.suffix.toLocaleLowerCase())
    if (prefixMatches && suffixMatches) matches.push(index)
    from = index + Math.max(needle.length, 1)
  }
  if (!matches.length) throw new Error(`The quote was not found on page ${pageNumber}.`)
  const occurrence = target.occurrence ?? 1
  const match = matches[occurrence - 1]
  if (match === undefined) {
    throw new Error(`Only ${matches.length} matching quote${matches.length === 1 ? '' : 's'} were found.`)
  }

  const rawStart = normalizedToRaw[match]
  const rawEnd = (normalizedToRaw[match + needle.length - 1] ?? -1) + 1
  const startInfo = nodes.find((item) => rawStart !== undefined && item.start <= rawStart && item.end > rawStart)
  const endInfo = nodes.find((item) => item.start < rawEnd && item.end >= rawEnd)
  if (!startInfo || !endInfo) throw new Error('The quote could not be mapped to page geometry.')
  const range = document.createRange()
  range.setStart(startInfo.node, rawStart! - startInfo.start)
  range.setEnd(endInfo.node, rawEnd - endInfo.start)
  const pageRect = page.getBoundingClientRect()
  const quads = Array.from(range.getClientRects())
    .filter((rect) => rect.width > 1 && rect.height > 1)
    .map((rect) => ({
      x: (rect.left - pageRect.left) / pageRect.width,
      y: (rect.top - pageRect.top) / pageRect.height,
      width: rect.width / pageRect.width,
      height: rect.height / pageRect.height,
    }))
  if (!quads.length) throw new Error('The quote is present but has no visible geometry.')
  return quads
}

function tool(
  name: string,
  description: string,
  inputSchema: object,
  readOnlyHint: boolean,
  execute: WebMCP.ToolExecuteCallback,
): WebMCP.ModelContextTool {
  return {
    name,
    description,
    inputSchema,
    annotations: { readOnlyHint, untrustedContentHint: true },
    execute,
  }
}

export type WebMcpStatus = 'available' | 'unavailable' | 'registering'

export function useWebMcp(documentId: string | null) {
  const [status, setStatus] = useState<WebMcpStatus>('registering')

  useEffect(() => {
    const modelContext = document.modelContext
    if (!modelContext || !documentId) {
      setStatus('unavailable')
      return
    }
    const controller = new AbortController()
    const state = () => editorStore.getState()
    const currentDocument = () => {
      const record = state().activeDocument
      if (!record || record.id !== documentId) throw new Error('No active document is available.')
      return record
    }

    const tools: Array<WebMCP.ModelContextTool> = [
      tool(
        'get_document_context',
        'Get metadata and the current reading state for the active PDF.',
        { type: 'object', properties: {} },
        true,
        () => {
          const record = currentDocument()
          return {
            name: record.name,
            title: record.title,
            author: record.author,
            pages: record.pageCount,
            currentPage: state().currentPage,
            zoom: state().zoom,
            indexedPages: record.indexedPages,
            annotations: state().annotations.length,
          }
        },
      ),
      tool(
        'read_document_text',
        'Read a bounded slice of extracted text from one page of the active PDF.',
        {
          type: 'object',
          properties: {
            pageNumber: { type: 'number', description: 'One-based PDF page number.' },
            cursor: { type: 'number', description: 'Character offset; defaults to zero.' },
            maxChars: { type: 'number', description: 'Characters to return; maximum 1000.' },
          },
          required: ['pageNumber'],
        },
        true,
        async (input) => {
          const parsed = z
            .object({ pageNumber: z.number().int().positive(), cursor: z.number().int().min(0).default(0), maxChars: z.number().int().min(100).max(1000).default(900) })
            .parse(input)
          const record = await db.textPages.get([documentId, parsed.pageNumber])
          if (!record) throw new Error('That page has not been indexed or contains no readable text.')
          const text = record.text.slice(parsed.cursor, parsed.cursor + parsed.maxChars)
          return {
            pageNumber: parsed.pageNumber,
            text,
            nextCursor: parsed.cursor + text.length < record.text.length ? parsed.cursor + text.length : null,
          }
        },
      ),
      tool(
        'search_document',
        'Search readable text in the active PDF and return page-numbered snippets.',
        {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Text to find in the PDF.' },
            limit: { type: 'number', description: 'Maximum results; defaults to 8.' },
          },
          required: ['query'],
        },
        true,
        async (input) => {
          const parsed = z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(12).default(8) }).parse(input)
          return { results: await searchDocumentText(documentId, parsed.query, parsed.limit) }
        },
      ),
      tool(
        'navigate_document',
        'Move the visible reader to a PDF page or an existing annotation.',
        {
          type: 'object',
          properties: {
            pageNumber: { type: 'number' },
            annotationId: { type: 'string' },
          },
        },
        false,
        async (input) => {
          const parsed = z.object({ pageNumber: z.number().int().positive().optional(), annotationId: z.string().optional() }).refine((value) => value.pageNumber || value.annotationId, 'Provide a pageNumber or annotationId.').parse(input)
          const annotation = parsed.annotationId ? state().annotations.find((item) => item.id === parsed.annotationId) : undefined
          const pageNumber = annotation?.pageNumber ?? parsed.pageNumber!
          await waitForPage(pageNumber)
          if (annotation) state().setSelectedAnnotation(annotation.id)
          return { pageNumber, annotationId: annotation?.id ?? null }
        },
      ),
      tool(
        'list_annotations',
        'List structured annotations in the active PDF with optional page and kind filters.',
        {
          type: 'object',
          properties: {
            pageNumber: { type: 'number' },
            kind: { type: 'string', enum: ['markup', 'ink', 'shape', 'text', 'note'] },
            cursor: { type: 'number' },
            limit: { type: 'number' },
          },
        },
        true,
        (input) => {
          const parsed = z.object({ pageNumber: z.number().int().positive().optional(), kind: z.enum(['markup', 'ink', 'shape', 'text', 'note']).optional(), cursor: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(20).default(10) }).parse(input)
          const filtered = state().annotations.filter((annotation) => (!parsed.pageNumber || annotation.pageNumber === parsed.pageNumber) && (!parsed.kind || annotation.kind === parsed.kind))
          return {
            annotations: filtered.slice(parsed.cursor, parsed.cursor + parsed.limit),
            nextCursor: parsed.cursor + parsed.limit < filtered.length ? parsed.cursor + parsed.limit : null,
          }
        },
      ),
      tool(
        'create_annotations',
        'Create one or more editable annotations in the active PDF using quotes or normalized geometry.',
        {
          type: 'object',
          properties: { annotations: { type: 'array', items: { type: 'object' } } },
          required: ['annotations'],
        },
        false,
        async (input) => {
          const parsed = z.object({ annotations: z.array(createInputSchema).min(1).max(20) }).parse(input)
          const record = currentDocument()
          const created: Array<Annotation> = []
          for (const item of parsed.annotations) {
            if (item.pageNumber > record.pageCount) throw new Error(`Page ${item.pageNumber} is outside this PDF.`)
            const base = createAnnotationBase(documentId, item.pageNumber, 'webmcp', defaultStyle(item.style))
            if (item.kind === 'markup') {
              const quads = await resolveQuote(item.pageNumber, item.target)
              created.push(annotationSchema.parse({ ...base, kind: 'markup', markup: item.markup, selectedText: item.target.quote, quoteAnchor: item.target, quads }))
            } else if (item.kind === 'note') {
              const quads = item.target ? await resolveQuote(item.pageNumber, item.target) : null
              const point = item.point ?? (quads?.[0] ? { x: quads[0].x + quads[0].width, y: quads[0].y } : undefined)
              if (!point) throw new Error('A note needs a point or quote target.')
              created.push(annotationSchema.parse({ ...base, kind: 'note', point, body: item.body, resolved: false }))
            } else if (item.kind === 'text') {
              created.push(annotationSchema.parse({ ...base, kind: 'text', bounds: item.bounds, body: item.body, alignment: 'left' }))
            } else if (item.kind === 'shape') {
              if (!item.bounds && !(item.start && item.end)) throw new Error('A shape needs bounds or start and end points.')
              created.push(annotationSchema.parse({ ...base, kind: 'shape', shape: item.shape, bounds: item.bounds, start: item.start, end: item.end }))
            } else {
              created.push(annotationSchema.parse({ ...base, kind: 'ink', strokes: item.strokes }))
            }
          }
          await state().createAnnotations(created, `Add ${created.length} agent annotation${created.length === 1 ? '' : 's'}`)
          state().notify(`Agent added ${created.length} annotation${created.length === 1 ? '' : 's'} · Undo available`)
          window.dispatchEvent(new CustomEvent('mimir:navigate', { detail: { pageNumber: created[0]?.pageNumber } }))
          return { created: created.map((annotation) => ({ id: annotation.id, pageNumber: annotation.pageNumber, kind: annotation.kind })) }
        },
      ),
      tool(
        'update_annotations',
        'Update annotation text, status, or visual style by stable ID.',
        {
          type: 'object',
          properties: {
            updates: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, body: { type: 'string' }, resolved: { type: 'boolean' }, style: { type: 'object' } }, required: ['id'] } },
          },
          required: ['updates'],
        },
        false,
        async (input) => {
          const parsed = z.object({ updates: z.array(z.object({ id: z.string(), body: z.string().optional(), resolved: z.boolean().optional(), style: styleInputSchema })).min(1).max(20) }).parse(input)
          const updated: Array<string> = []
          for (const update of parsed.updates) {
            const existing = state().annotations.find((annotation) => annotation.id === update.id)
            if (!existing) throw new Error(`Annotation ${update.id} was not found.`)
            const patch: Record<string, unknown> = {}
            if (update.body !== undefined && (existing.kind === 'text' || existing.kind === 'note')) patch.body = update.body
            if (update.resolved !== undefined && existing.kind === 'note') patch.resolved = update.resolved
            if (update.style) patch.style = { ...existing.style, ...update.style }
            await state().updateAnnotation(update.id, patch as Partial<Annotation>, 'webmcp')
            updated.push(update.id)
          }
          state().notify(`Agent updated ${updated.length} annotation${updated.length === 1 ? '' : 's'} · Undo available`)
          return { updated }
        },
      ),
      tool(
        'delete_annotations',
        'Delete annotations from the active PDF by stable ID.',
        { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'] },
        false,
        async (input) => {
          const parsed = z.object({ ids: z.array(z.string()).min(1).max(50) }).parse(input)
          await state().deleteAnnotations(parsed.ids, `Delete ${parsed.ids.length} agent annotation${parsed.ids.length === 1 ? '' : 's'}`)
          state().notify(`Agent deleted ${parsed.ids.length} annotation${parsed.ids.length === 1 ? '' : 's'} · Undo available`)
          return { deleted: parsed.ids }
        },
      ),
      tool(
        'prepare_export',
        'Open a visible export review for the active PDF or annotation JSON.',
        {
          type: 'object',
          properties: { format: { type: 'string', enum: ['pdf', 'json'] } },
          required: ['format'],
        },
        false,
        (input) => {
          const parsed = z.object({ format: z.enum(['pdf', 'json']) }).parse(input)
          window.dispatchEvent(new CustomEvent('mimir:prepare-export', { detail: parsed }))
          return { prepared: parsed.format, awaitingUserSave: true }
        },
      ),
    ]

    Promise.all(tools.map((definition) => modelContext.registerTool(definition, { signal: controller.signal })))
      .then(() => setStatus('available'))
      .catch(() => setStatus('unavailable'))

    return () => controller.abort()
  }, [documentId])

  return status
}
