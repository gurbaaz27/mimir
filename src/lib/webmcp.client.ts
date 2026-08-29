import '@tanstack/react-start/client-only'
import { useEffect, useRef, useState } from 'react'
import type { z } from 'zod'
import {
  annotationBounds,
  annotationLabel,
  annotationSchema,
  createAnnotationBase,
  type Annotation,
  type QuoteAnchor,
} from './annotations'
import { db } from './db.client'
import { getDocumentPathSegment } from './document-route'
import { editorStore } from './editor-store.client'
import { searchDocumentText } from './search.client'
import {
  annotationContextInput,
  annotationSummary,
  applicableFields,
  bodyLimitFor,
  createAnnotationsInput,
  defaultStyle,
  deleteAnnotationsInput,
  emptyInputSchema,
  exportInput,
  formatToolError,
  listAnnotationsInput,
  listDocumentsInput,
  navigateInput,
  openDocumentInput,
  partitionDeletable,
  readTextInput,
  searchInput,
  toJsonSchema,
  ToolError,
  updateAnnotationsInput,
} from './webmcp-contract'

/** Navigates the app to a document's reader route. Supplied by the mounting component. */
export type OpenDocumentNavigator = (pathSegment: string) => void | Promise<void>

interface ToolDefinition<Schema extends z.ZodType> {
  name: string
  title: string
  description: string
  schema: Schema
  readOnly: boolean
  execute: (input: z.output<Schema>, options: WebMCP.ToolExecuteCallbackOptions) => unknown
}

/**
 * Build a tool whose published JSON Schema is generated from the same Zod schema
 * that validates its input, and whose failures always reach the agent as one
 * readable sentence rather than a serialized error object.
 */
function tool<Schema extends z.ZodType>(definition: ToolDefinition<Schema>): WebMCP.ModelContextTool {
  return {
    name: definition.name,
    title: definition.title,
    description: definition.description,
    inputSchema: toJsonSchema(definition.schema),
    annotations: { readOnlyHint: definition.readOnly, untrustedContentHint: true },
    execute: async (input, options) => {
      let parsed: z.output<Schema>
      try {
        parsed = definition.schema.parse(input ?? {}) as z.output<Schema>
      } catch (error) {
        // A request that fails validation is rejected whole, before anything is
        // applied. Say so: an agent that assumed a partial write would otherwise
        // have to go and find out what landed.
        const scope = definition.readOnly ? '' : ' Nothing was applied — fix the request and send it again.'
        throw new Error(`${formatToolError(error)}.${scope}`)
      }
      try {
        return await definition.execute(parsed, options)
      } catch (error) {
        throw new Error(formatToolError(error))
      }
    },
  }
}

const state = () => editorStore.getState()

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

const POLL_INTERVAL = 80
const POLL_ATTEMPTS = 30

function pollFor<T>(find: () => T | null | undefined, onTimeout: () => Error, attempts = POLL_ATTEMPTS) {
  return new Promise<T>((resolve, reject) => {
    let remaining = attempts
    const tick = () => {
      const found = find()
      if (found) {
        resolve(found)
        return
      }
      remaining -= 1
      if (remaining <= 0) {
        reject(onTimeout())
        return
      }
      window.setTimeout(tick, POLL_INTERVAL)
    }
    tick()
  })
}

function requestPage(pageNumber: number) {
  state().setCurrentPage(pageNumber)
  window.dispatchEvent(new CustomEvent('mimir:navigate', { detail: { pageNumber } }))
}

/**
 * Move the reader to a page and wait for it to mount. Deliberately does not wait
 * for text: a scanned page never renders one, and navigation still succeeded.
 */
async function scrollToPage(pageNumber: number) {
  const pageCount = state().activeDocument?.pageCount ?? 0
  if (pageNumber > pageCount) {
    throw new ToolError(`Page ${pageNumber} is outside this PDF, which has ${pageCount} pages.`)
  }
  requestPage(pageNumber)
  return pollFor(
    () => document.querySelector<HTMLElement>(`[data-page-number="${pageNumber}"]`),
    () => new ToolError(`Page ${pageNumber} did not render in time.`, 'Retry the call; a large page can take a moment.'),
  )
}

/** Text anchoring needs the rendered text layer, so this waits for it too. */
async function waitForTextLayer(pageNumber: number) {
  const page = await scrollToPage(pageNumber)
  return pollFor(
    () => (page.querySelector('.textLayer span') ? page : null),
    () =>
      new ToolError(
        `Page ${pageNumber} has no selectable text.`,
        'It is most likely a scan. Place a note with a point instead of anchoring to a quote.',
      ),
  )
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Map a quote to normalized page geometry by walking the rendered text layer.
 * A miss reports where the quote actually occurs so the agent can retry.
 */
async function resolveQuote(documentId: string, pageNumber: number, target: QuoteAnchor) {
  const page = await waitForTextLayer(pageNumber)
  const layer = page.querySelector<HTMLElement>('.textLayer')
  if (!layer) throw new ToolError(`Page ${pageNumber} has no selectable text.`)
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
  const needle = collapseWhitespace(target.quote).toLocaleLowerCase()
  const matches: Array<number> = []
  let from = 0
  while (from <= haystack.length) {
    const index = haystack.indexOf(needle, from)
    if (index < 0) break
    const prefixMatches =
      !target.prefix ||
      haystack.slice(Math.max(0, index - target.prefix.length), index).endsWith(target.prefix.toLocaleLowerCase())
    const suffixMatches =
      !target.suffix ||
      haystack
        .slice(index + needle.length, index + needle.length + target.suffix.length)
        .startsWith(target.suffix.toLocaleLowerCase())
    if (prefixMatches && suffixMatches) matches.push(index)
    from = index + Math.max(needle.length, 1)
  }

  if (!matches.length) {
    const elsewhere = await searchDocumentText(documentId, target.quote, 3)
    const pages = [...new Set(elsewhere.map((result) => result.pageNumber))]
    throw new ToolError(
      `The quote was not found on page ${pageNumber}.`,
      pages.length
        ? `It appears on page ${pages.join(', ')} — retry with that pageNumber.`
        : 'Use search_document to find the exact wording; the PDF may hyphenate or space it differently.',
    )
  }

  const occurrence = target.occurrence ?? 1
  const match = matches[occurrence - 1]
  if (match === undefined) {
    throw new ToolError(
      `Only ${plural(matches.length, 'matching quote')} ${matches.length === 1 ? 'was' : 'were'} found on page ${pageNumber}.`,
      'Lower occurrence, or add prefix and suffix to pick the right one.',
    )
  }

  const rawStart = normalizedToRaw[match]
  const rawLastCharacter = normalizedToRaw[match + needle.length - 1]
  if (rawStart === undefined || rawLastCharacter === undefined) {
    throw new ToolError('The quote could not be mapped to page geometry.')
  }
  const rawEnd = rawLastCharacter + 1
  const startInfo = nodes.find((item) => item.start <= rawStart && item.end > rawStart)
  const endInfo = nodes.find((item) => item.start < rawEnd && item.end >= rawEnd)
  if (!startInfo || !endInfo) throw new ToolError('The quote could not be mapped to page geometry.')

  const range = document.createRange()
  range.setStart(startInfo.node, rawStart - startInfo.start)
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
  if (!quads.length) throw new ToolError('The quote is present but has no visible geometry.')
  return quads
}

/* ------------------------------------------------------------------ *
 * Library scope — registered whenever Mimir is open, document or not.
 * ------------------------------------------------------------------ */

export function libraryTools(navigator: { current?: OpenDocumentNavigator }): Array<WebMCP.ModelContextTool> {
  const documents = async () => {
    if (!state().documents.length) await state().loadLibrary()
    return state().documents
  }

  return [
    tool({
      name: 'list_documents',
      title: 'List local documents',
      description:
        'List the PDFs stored in this browser. Start here: nothing else in the reader works until a document is open. Files are local to this device and are never uploaded.',
      schema: listDocumentsInput,
      readOnly: true,
      execute: async (input) => {
        const all = await documents()
        const query = input.query?.toLocaleLowerCase()
        const matched = query
          ? all.filter((record) =>
              [record.name, record.title, record.author].some((field) => field?.toLocaleLowerCase().includes(query)),
            )
          : all
        const activeId = state().activeDocument?.id
        const listed = await Promise.all(
          matched.slice(0, input.limit).map(async (record) => ({
            documentId: record.id,
            name: record.name,
            title: record.title ?? null,
            author: record.author ?? null,
            pageCount: record.pageCount,
            lastPage: record.lastPage,
            indexedPages: record.indexedPages,
            annotations: await db.annotations.where('documentId').equals(record.id).count(),
            lastOpenedAt: record.lastOpenedAt,
            isOpen: record.id === activeId,
          })),
        )
        return { documents: listed, total: matched.length }
      },
    }),
    tool({
      name: 'open_document',
      title: 'Open a document',
      description:
        'Open a local PDF in the reader and navigate the page to it. This registers the document tools — reading, search, annotation, and export all become available once a document is open.',
      schema: openDocumentInput,
      readOnly: false,
      execute: async (input) => {
        const all = await documents()
        if (!all.length) throw new ToolError('This browser has no documents yet.', 'The reader must add a PDF first.')

        let record = input.documentId ? all.find((item) => item.id === input.documentId) : undefined
        if (input.documentId && !record) {
          throw new ToolError(`No document has the id ${input.documentId}.`, 'Call list_documents for current ids.')
        }
        if (!record) {
          const name = input.name!.toLocaleLowerCase()
          const candidates = all.filter((item) =>
            [item.name, item.title].some((field) => field?.toLocaleLowerCase().includes(name)),
          )
          if (!candidates.length) {
            throw new ToolError(
              `No document matches “${input.name}”.`,
              `Available: ${all.map((item) => item.name).join(', ')}.`,
            )
          }
          if (candidates.length > 1) {
            throw new ToolError(
              `“${input.name}” matches ${candidates.length} documents.`,
              `Pass documentId for one of: ${candidates.map((item) => item.name).join(', ')}.`,
            )
          }
          record = candidates[0]!
        }

        await state().openDocument(record.id)
        await navigator.current?.(getDocumentPathSegment(record))
        return {
          documentId: record.id,
          name: record.name,
          title: record.title ?? null,
          pageCount: record.pageCount,
          currentPage: state().currentPage,
          indexedPages: record.indexedPages,
        }
      },
    }),
  ]
}

/* ------------------------------------------------------------------ *
 * Document scope — registered only while a PDF is open.
 * ------------------------------------------------------------------ */

export function documentTools(documentId: string): Array<WebMCP.ModelContextTool> {
  const currentDocument = () => {
    const record = state().activeDocument
    if (!record || record.id !== documentId) throw new ToolError('No active document is available.')
    return record
  }

  const pageText = async (pageNumber: number) => (await db.textPages.get([documentId, pageNumber]))?.text ?? null

  return [
    tool({
      name: 'get_document_context',
      title: 'Document context',
      description:
        'Metadata and reading state for the open PDF, including how much of its text has been extracted. Call this first: it tells you whether the document has usable text at all, which decides whether quote-anchored tools will work.',
      schema: emptyInputSchema,
      readOnly: true,
      execute: async () => {
        const record = currentDocument()
        const pagesWithText = await db.textPages
          .where('documentId')
          .equals(documentId)
          .filter((page) => page.text.trim().length > 0)
          .count()
        const annotations = state().annotations
        const outline = state().outline
        return {
          documentId,
          name: record.name,
          title: record.title ?? null,
          author: record.author ?? null,
          pageCount: record.pageCount,
          currentPage: state().currentPage,
          zoom: state().zoom,
          text: {
            indexedPages: record.indexedPages,
            pagesWithText,
            indexingComplete: record.indexedPages >= record.pageCount,
            note:
              record.indexedPages > 0 && pagesWithText === 0
                ? 'No indexed page contains text; this PDF is most likely a scan. Quote anchoring will not work.'
                : null,
          },
          outlineEntries: outline?.length ?? null,
          annotations: {
            total: annotations.length,
            human: annotations.filter((item) => item.createdBy === 'human').length,
            agent: annotations.filter((item) => item.createdBy === 'webmcp').length,
          },
          lastChange: state().history.at(-1)?.label ?? null,
        }
      },
    }),
    tool({
      name: 'get_document_outline',
      title: 'Document outline',
      description:
        'The PDF’s bookmark tree with resolved page numbers, flattened and depth-tagged. Use it to jump to a section by name instead of paging through the document. Returns an empty list when the PDF has no bookmarks.',
      schema: emptyInputSchema,
      readOnly: true,
      execute: async () => {
        const cached = state().outline ?? (await pollFor(() => state().outline, () => new Error('pending'), 12).catch(() => null))
        if (cached) return { outline: cached, entries: cached.length }
        const record = currentDocument()
        const { loadPdf, readOutline } = await import('./pdf.client')
        const pdf = await loadPdf(record.blob)
        try {
          const outline = await readOutline(pdf)
          return { outline, entries: outline.length }
        } finally {
          await pdf.cleanup()
        }
      },
    }),
    tool({
      name: 'read_document_text',
      title: 'Read page text',
      description:
        'Read extracted text from one page or a range of pages, concatenated up to maxChars. Pages that are not yet indexed or that carry no text are reported in "skipped" rather than failing the call; follow nextPage and nextCursor to continue.',
      schema: readTextInput,
      readOnly: true,
      execute: async (input) => {
        const record = currentDocument()
        if (input.pageNumber > record.pageCount) {
          throw new ToolError(`Page ${input.pageNumber} is outside this PDF, which has ${record.pageCount} pages.`)
        }
        const endPage = Math.min(input.endPage ?? input.pageNumber, record.pageCount)
        const pages: Array<{ pageNumber: number; text: string }> = []
        const skipped: Array<{ pageNumber: number; reason: 'not_indexed' | 'no_text_on_page' }> = []
        let remaining = input.maxChars
        let cursor = input.cursor
        let nextPage: number | null = null
        let nextCursor: number | null = null

        for (let pageNumber = input.pageNumber; pageNumber <= endPage; pageNumber += 1) {
          if (remaining <= 0) {
            nextPage = pageNumber
            nextCursor = 0
            break
          }
          const text = await pageText(pageNumber)
          if (text === null) {
            skipped.push({ pageNumber, reason: 'not_indexed' })
            cursor = 0
            continue
          }
          if (!text.length) {
            skipped.push({ pageNumber, reason: 'no_text_on_page' })
            cursor = 0
            continue
          }
          const slice = text.slice(cursor, cursor + remaining)
          pages.push({ pageNumber, text: slice })
          remaining -= slice.length
          if (cursor + slice.length < text.length) {
            nextPage = pageNumber
            nextCursor = cursor + slice.length
            break
          }
          cursor = 0
        }

        if (!pages.length) {
          const notIndexed = skipped.some((page) => page.reason === 'not_indexed')
          throw new ToolError(
            notIndexed
              ? `Page ${input.pageNumber} has not been indexed yet (${record.indexedPages} of ${record.pageCount} pages done).`
              : `No text was found on page ${input.pageNumber}.`,
            notIndexed
              ? 'Indexing runs while the document is open — retry shortly.'
              : 'That page is most likely a scan. Try a different page, or check get_document_context.',
          )
        }

        return {
          pages,
          characters: pages.reduce((total, page) => total + page.text.length, 0),
          skipped,
          nextPage,
          nextCursor,
          indexedPages: record.indexedPages,
          pageCount: record.pageCount,
        }
      },
    }),
    tool({
      name: 'search_document',
      title: 'Search the document',
      description:
        'Find text anywhere in the indexed pages and get page-numbered snippets. Each result’s "index" is a character offset you can pass straight to read_document_text as "cursor" for that page, and its snippet wording is what create_annotations expects as a quote.',
      schema: searchInput,
      readOnly: true,
      execute: async (input) => {
        const results = await searchDocumentText(documentId, input.query, input.limit)
        const record = currentDocument()
        return {
          results,
          total: results.length,
          indexedPages: record.indexedPages,
          pageCount: record.pageCount,
        }
      },
    }),
    tool({
      name: 'navigate_document',
      title: 'Go to a page',
      description:
        'Scroll the reader to a page, or to the page holding an annotation and select it. This moves what the reader sees, so use it to show your work.',
      schema: navigateInput,
      readOnly: false,
      execute: async (input) => {
        const annotation = input.annotationId
          ? state().annotations.find((item) => item.id === input.annotationId)
          : undefined
        if (input.annotationId && !annotation) {
          throw new ToolError(`Annotation ${input.annotationId} was not found.`, 'Call list_annotations for current ids.')
        }
        const pageNumber = annotation?.pageNumber ?? input.pageNumber!
        await scrollToPage(pageNumber)
        if (annotation) state().setSelectedAnnotation(annotation.id)
        return { pageNumber, annotationId: annotation?.id ?? null, pageCount: currentDocument().pageCount }
      },
    }),
    tool({
      name: 'list_annotations',
      title: 'List annotations',
      description:
        'List the marks in this PDF, newest schema first, with optional page, kind, and author filters. Summaries omit geometry and stay small; ask for detail "full" only when you need quads, ink strokes, or bounds.',
      schema: listAnnotationsInput,
      readOnly: true,
      execute: (input) => {
        const filtered = state().annotations.filter(
          (annotation) =>
            (!input.pageNumber || annotation.pageNumber === input.pageNumber) &&
            (!input.kind || annotation.kind === input.kind) &&
            (!input.createdBy || annotation.createdBy === input.createdBy),
        )
        const page = filtered.slice(input.cursor, input.cursor + input.limit)
        return {
          annotations: input.detail === 'full' ? page : page.map((annotation) => annotationSummary(annotation)),
          total: filtered.length,
          nextCursor: input.cursor + input.limit < filtered.length ? input.cursor + input.limit : null,
        }
      },
    }),
    tool({
      name: 'get_annotation_context',
      title: 'Annotation context',
      description:
        'Read the page text surrounding one annotation, so you can explain, summarise, or reply to a mark without re-reading the page.',
      schema: annotationContextInput,
      readOnly: true,
      execute: async (input) => {
        const annotation = state().annotations.find((item) => item.id === input.annotationId)
        if (!annotation) {
          throw new ToolError(`Annotation ${input.annotationId} was not found.`, 'Call list_annotations for current ids.')
        }
        const summary = annotationSummary(annotation)
        const raw = await pageText(annotation.pageNumber)
        if (!raw) {
          return { annotation: summary, context: null, reason: raw === null ? 'not_indexed' : 'no_text_on_page' }
        }

        const text = collapseWhitespace(raw)
        const quote = annotation.kind === 'markup' ? collapseWhitespace(annotation.selectedText) : null
        const quoteIndex = quote ? text.toLocaleLowerCase().indexOf(quote.toLocaleLowerCase()) : -1
        const window = input.contextChars

        if (quote && quoteIndex >= 0) {
          return {
            annotation: summary,
            locatedBy: 'quote' as const,
            context: {
              before: text.slice(Math.max(0, quoteIndex - window), quoteIndex),
              match: text.slice(quoteIndex, quoteIndex + quote.length),
              after: text.slice(quoteIndex + quote.length, quoteIndex + quote.length + window),
            },
          }
        }

        const bounds = annotationBounds(annotation)
        const estimate = Math.floor((bounds ? bounds.y + bounds.height / 2 : 0) * text.length)
        return {
          annotation: summary,
          locatedBy: 'position' as const,
          context: {
            before: text.slice(Math.max(0, estimate - window), estimate),
            match: null,
            after: text.slice(estimate, estimate + window),
          },
        }
      },
    }),
    tool({
      name: 'create_annotations',
      title: 'Create annotations',
      description:
        'Add up to 20 marks in one reversible step. Prefer quote anchoring for markup and notes — it survives zoom and reflow — and fall back to normalized 0–1 coordinates for shapes, ink, and free-floating notes. A request that fails validation is rejected whole and applies nothing; an item that validates but cannot be placed — a quote that is not on the page, say — is reported in "failed" while the rest still land.',
      schema: createAnnotationsInput,
      readOnly: false,
      execute: async (input) => {
        const record = currentDocument()
        const created: Array<Annotation> = []
        const failed: Array<{ index: number; reason: string }> = []

        for (const [index, item] of input.annotations.entries()) {
          try {
            if (item.pageNumber > record.pageCount) {
              throw new ToolError(`Page ${item.pageNumber} is outside this PDF, which has ${record.pageCount} pages.`)
            }
            const base = createAnnotationBase(documentId, item.pageNumber, 'webmcp', defaultStyle(item.style))
            if (item.kind === 'markup') {
              const quads = await resolveQuote(documentId, item.pageNumber, item.target)
              created.push(
                annotationSchema.parse({
                  ...base,
                  kind: 'markup',
                  markup: item.markup,
                  selectedText: item.target.quote,
                  quoteAnchor: item.target,
                  quads,
                }),
              )
            } else if (item.kind === 'note') {
              const quads = item.target ? await resolveQuote(documentId, item.pageNumber, item.target) : null
              const point = item.point ?? (quads?.[0] ? { x: quads[0].x + quads[0].width, y: quads[0].y } : undefined)
              if (!point) throw new ToolError('A note needs a point or a quote target.')
              created.push(annotationSchema.parse({ ...base, kind: 'note', point, body: item.body, resolved: false }))
            } else if (item.kind === 'text') {
              created.push(
                annotationSchema.parse({ ...base, kind: 'text', bounds: item.bounds, body: item.body, alignment: 'left' }),
              )
            } else if (item.kind === 'shape') {
              // Store only the geometry this subtype draws from: the renderer and
              // the exporter both branch on which one is present.
              const shape = { ...base, kind: 'shape' as const, shape: item.shape }
              if (item.shape === 'rectangle' || item.shape === 'ellipse') {
                created.push(annotationSchema.parse({ ...shape, bounds: item.bounds }))
              }
              if (item.shape === 'line' || item.shape === 'arrow') {
                created.push(annotationSchema.parse({ ...shape, start: item.start, end: item.end }))
              }
            } else {
              created.push(annotationSchema.parse({ ...base, kind: 'ink', strokes: item.strokes }))
            }
          } catch (error) {
            failed.push({ index, reason: formatToolError(error) })
          }
        }

        if (!created.length) {
          throw new ToolError(
            'No annotations were created.',
            failed.map((failure) => `[${failure.index}] ${failure.reason}`).join(' '),
          )
        }

        await state().createAnnotations(created, `Add ${plural(created.length, 'agent annotation')}`)
        state().notify(`Agent added ${plural(created.length, 'annotation')} · Undo available`)
        window.dispatchEvent(new CustomEvent('mimir:navigate', { detail: { pageNumber: created[0]?.pageNumber } }))
        return {
          created: created.map((annotation) => ({
            id: annotation.id,
            kind: annotation.kind,
            pageNumber: annotation.pageNumber,
          })),
          failed,
        }
      },
    }),
    tool({
      name: 'update_annotations',
      title: 'Update annotations',
      description:
        'Change the text, resolved state, or style of existing marks. All of them land as one undo step, and naming the same id twice layers the patches rather than conflicting. body applies to text and note annotations, resolved only to notes. A request that fails validation is rejected whole and applies nothing; an update naming a field its annotation does not have is reported in "failed" rather than silently ignored, and the rest still land.',
      schema: updateAnnotationsInput,
      readOnly: false,
      execute: async (input) => {
        currentDocument()
        // A batch may name the same annotation twice. Each patch is layered onto
        // the running result rather than onto the original, so one id contributes
        // exactly one before and one after record — duplicates in either list
        // would leave IndexedDB and the in-memory list disagreeing.
        const originals = new Map<string, Annotation>()
        const working = new Map<string, Annotation>()
        const changedFields = new Map<string, Set<string>>()
        const failed: Array<{ id: string; reason: string }> = []
        const now = new Date().toISOString()

        for (const update of input.updates) {
          const current = working.get(update.id) ?? state().annotations.find((item) => item.id === update.id)
          if (!current) {
            failed.push({ id: update.id, reason: 'No annotation has this id.' })
            continue
          }
          const allowed = applicableFields(current)
          const rejected: Array<string> = []
          const patch: Record<string, unknown> = {}
          const limit = bodyLimitFor(current)
          if (update.body !== undefined) {
            if (!allowed.body) rejected.push('body')
            else if (limit !== null && update.body.length > limit) {
              // The schema advertises the more permissive of the two body
              // limits, because one flat field cannot carry a per-kind bound.
              failed.push({
                id: update.id,
                reason: `A ${annotationLabel(current)} annotation holds at most ${limit.toLocaleString('en-US')} characters, and this body has ${update.body.length.toLocaleString('en-US')}.`,
              })
              continue
            } else patch.body = update.body
          }
          if (update.resolved !== undefined) {
            if (allowed.resolved) patch.resolved = update.resolved
            else rejected.push('resolved')
          }
          if (update.style) patch.style = { ...current.style, ...update.style }

          if (rejected.length) {
            failed.push({
              id: update.id,
              reason: `A ${annotationLabel(current)} annotation has no ${rejected.join(' or ')} field, so nothing was changed.`,
            })
            continue
          }
          if (!Object.keys(patch).length) {
            failed.push({ id: update.id, reason: 'No supported fields were provided.' })
            continue
          }

          // A patch that survives the input contract can still fail the persisted
          // schema. Fail that item alone rather than discarding the whole batch.
          let next: Annotation
          try {
            next = annotationSchema.parse({ ...current, ...patch, lastModifiedBy: 'webmcp', updatedAt: now })
          } catch (error) {
            failed.push({ id: update.id, reason: formatToolError(error) })
            continue
          }

          if (!originals.has(update.id)) originals.set(update.id, current)
          working.set(update.id, next)
          const changed = changedFields.get(update.id) ?? new Set<string>()
          for (const field of Object.keys(patch)) changed.add(field)
          changedFields.set(update.id, changed)
        }

        if (!working.size) {
          throw new ToolError(
            'No annotations were updated.',
            failed.map((failure) => `${failure.id}: ${failure.reason}`).join(' '),
          )
        }

        const before = [...originals.values()]
        const after = [...working.values()]
        await state().commit(before, after, `Update ${plural(after.length, 'agent annotation')}`)
        state().notify(`Agent updated ${plural(after.length, 'annotation')} · Undo available`)
        return {
          updated: [...changedFields].map(([id, changed]) => ({ id, changed: [...changed] })),
          failed,
        }
      },
    }),
    tool({
      name: 'delete_annotations',
      title: 'Delete annotations',
      description:
        'Remove marks you created, as one undo step. The reader’s own annotations are skipped unless includeHumanAnnotations is true — do not set it without being asked to.',
      schema: deleteAnnotationsInput,
      readOnly: false,
      execute: async (input) => {
        currentDocument()
        const { deletable, skipped } = partitionDeletable(
          state().annotations,
          input.ids,
          input.includeHumanAnnotations,
        )
        if (!deletable.length) {
          const humanOnly = skipped.every((entry) => entry.reason === 'created_by_human')
          throw new ToolError(
            'No annotations were deleted.',
            humanOnly
              ? 'All of them were made by the reader. Ask before passing includeHumanAnnotations.'
              : 'None of those ids exist — call list_annotations for current ids.',
          )
        }
        const ids = deletable.map((annotation) => annotation.id)
        await state().deleteAnnotations(ids, `Delete ${plural(ids.length, 'agent annotation')}`)
        state().notify(`Agent deleted ${plural(ids.length, 'annotation')} · Undo available`)
        return { deleted: ids, skipped }
      },
    }),
    tool({
      name: 'undo_last_change',
      title: 'Undo the last change',
      description:
        'Revert the most recent annotation change in this session — the same action as the reader’s undo, so it may undo their edit rather than yours. Check lastChange from get_document_context first if you are unsure.',
      schema: emptyInputSchema,
      readOnly: false,
      execute: async () => {
        currentDocument()
        const entry = state().history.at(-1)
        if (!entry) return { undone: null, message: 'There is nothing to undo.' }
        await state().undo()
        return { undone: entry.label, remainingHistory: state().history.length }
      },
    }),
    tool({
      name: 'prepare_export',
      title: 'Prepare an export',
      description:
        'Open the export panel for the reader to confirm. This never writes a file on its own: the reader must click save, so report that the export is waiting on them.',
      schema: exportInput,
      readOnly: false,
      execute: (input) => {
        currentDocument()
        const annotations = state().annotations
        window.dispatchEvent(new CustomEvent('mimir:prepare-export', { detail: input }))
        return {
          format: input.format,
          annotations: annotations.length,
          notes: annotations.filter((annotation) => annotation.kind === 'note').length,
          awaitingUserSave: true,
        }
      },
    }),
  ]
}

export type WebMcpStatus = 'available' | 'unavailable' | 'registering'

export interface WebMcpToolSummary {
  name: string
  title: string
  description: string
  inputSchema: unknown
  readOnly: boolean
}

export function getWebMcpTools(documentId: string | null): Array<WebMcpToolSummary> {
  return [...libraryTools({}), ...(documentId ? documentTools(documentId) : [])].map((definition) => ({
    name: definition.name,
    title: definition.title ?? definition.name,
    description: definition.description,
    inputSchema: definition.inputSchema,
    readOnly: definition.annotations?.readOnlyHint === true,
  }))
}

/**
 * Register Mimir's tools in two scopes: library tools exist wherever the app is
 * open, so an agent arriving at the home page has somewhere to start, and
 * document tools come and go with the open PDF.
 */
export function useWebMcp(documentId: string | null, openDocumentPath?: OpenDocumentNavigator) {
  const [status, setStatus] = useState<WebMcpStatus>('registering')
  const navigatorRef = useRef<OpenDocumentNavigator | undefined>(openDocumentPath)
  navigatorRef.current = openDocumentPath

  useEffect(() => {
    const modelContext = document.modelContext
    if (!modelContext) {
      setStatus('unavailable')
      return
    }
    const controller = new AbortController()
    Promise.all(
      libraryTools(navigatorRef).map((definition) =>
        modelContext.registerTool(definition, { signal: controller.signal }),
      ),
    )
      .then(() => setStatus('available'))
      .catch(() => setStatus('unavailable'))
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const modelContext = document.modelContext
    if (!modelContext || !documentId) return
    const controller = new AbortController()
    Promise.all(
      documentTools(documentId).map((definition) =>
        modelContext.registerTool(definition, { signal: controller.signal }),
      ),
    ).catch(() => setStatus('unavailable'))
    return () => controller.abort()
  }, [documentId])

  return status
}
