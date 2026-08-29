import { z } from 'zod'
import {
  annotationSummary,
  pointSchema,
  quoteAnchorSchema,
  rectSchema,
  type Annotation,
  type AnnotationStyle,
} from './annotations'

/**
 * The tool surface Mimir exposes to browser agents, kept apart from the
 * registration code so it can be read and tested without a DOM.
 *
 * Every tool's JSON Schema is generated from the Zod schema that also validates
 * its input, so the contract an agent reads is the contract it is held to.
 */

/** An error carrying a recovery hint, so a failed call tells the agent what to try next. */
export class ToolError extends Error {
  readonly hint?: string

  constructor(message: string, hint?: string) {
    super(message)
    this.name = 'ToolError'
    this.hint = hint
  }
}

function issuePath(path: ReadonlyArray<PropertyKey>) {
  return path.reduce<string>((accumulator, segment) => {
    if (typeof segment === 'number') return `${accumulator}[${segment}]`
    return accumulator ? `${accumulator}.${String(segment)}` : String(segment)
  }, '')
}

/**
 * Turn anything thrown inside a tool into one sentence an agent can act on.
 * Zod's issue list becomes readable field paths rather than a serialized object.
 */
export function formatToolError(error: unknown): string {
  if (error instanceof z.ZodError) {
    const issues = error.issues
      .map((issue) => `${issuePath(issue.path) || 'input'}: ${issue.message}`)
      .join('; ')
    return `Invalid input — ${issues}`
  }
  if (error instanceof ToolError) {
    return error.hint ? `${error.message} ${error.hint}` : error.message
  }
  return error instanceof Error ? error.message : String(error)
}

export function toJsonSchema(schema: z.ZodType) {
  return z.toJSONSchema(schema, { io: 'input' }) as object
}

export const emptyInputSchema = z.object({})

export const styleInputSchema = z
  .object({
    color: z.string().optional().describe('CSS hex colour, for example "#159b98".'),
    opacity: z.number().min(0.05).max(1).optional(),
    strokeWidth: z.number().min(0.5).max(20).optional(),
    fill: z.string().optional(),
    fontSize: z.number().min(8).max(72).optional().describe('Only meaningful for text annotations.'),
  })
  .optional()

export function defaultStyle(style?: z.infer<typeof styleInputSchema>): AnnotationStyle {
  return {
    color: style?.color ?? '#159b98',
    opacity: style?.opacity ?? 0.85,
    strokeWidth: style?.strokeWidth ?? 2,
    fill: style?.fill,
    fontSize: style?.fontSize,
  }
}

const pageNumberSchema = z.number().int().positive().describe('One-based PDF page number.')

export const annotationKindSchema = z.enum(['markup', 'ink', 'shape', 'text', 'note'])

/**
 * A shape's geometry is fixed by its subtype rather than left optional: the
 * renderer and the PDF exporter both branch on which geometry is present, so a
 * rectangle carrying endpoints — or a line carrying bounds — would draw as the
 * wrong shape, or not at all.
 */
const boxShapeInput = z
  .object({
    kind: z.literal('shape'),
    pageNumber: pageNumberSchema,
    shape: z.enum(['rectangle', 'ellipse']),
    bounds: rectSchema.describe('Normalized box the shape is drawn into.'),
    style: styleInputSchema,
  })
  .describe('Draw a rectangle or ellipse, sized by bounds.')

const lineShapeInput = z
  .object({
    kind: z.literal('shape'),
    pageNumber: pageNumberSchema,
    shape: z.enum(['line', 'arrow']),
    start: pointSchema.describe('Where the line begins, in normalized page coordinates.'),
    end: pointSchema.describe('Where the line ends. An arrow points at this end.'),
    style: styleInputSchema,
  })
  .describe('Draw a line or arrow between two points.')

const shapeAnnotationInput = z.discriminatedUnion('shape', [boxShapeInput, lineShapeInput])

/**
 * Geometry is expressed in normalized page coordinates: x and y run 0–1 from the
 * top-left of the page, so a mark survives zoom, rotation, and page size.
 */
export const createAnnotationSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('markup'),
      pageNumber: pageNumberSchema,
      markup: z.enum(['highlight', 'underline', 'strikeout']),
      target: quoteAnchorSchema.describe(
        'The text to mark, anchored by quote. Use the exact wording from read_document_text or search_document; prefix, suffix, and occurrence disambiguate repeats.',
      ),
      style: styleInputSchema,
    })
    .describe('Highlight, underline, or strike through existing page text.'),
  z
    .object({
      kind: z.literal('note'),
      pageNumber: pageNumberSchema,
      body: z.string().max(25_000).describe('The comment text.'),
      point: pointSchema.optional().describe('Where to pin the note, in normalized page coordinates.'),
      target: quoteAnchorSchema.optional().describe('Anchor the note to a quote instead of a point.'),
      style: styleInputSchema,
    })
    .describe('Pin a sticky note. Provide either point or target.'),
  z
    .object({
      kind: z.literal('text'),
      pageNumber: pageNumberSchema,
      body: z.string().max(10_000),
      bounds: rectSchema.describe('Normalized box the text is drawn into.'),
      style: styleInputSchema,
    })
    .describe('Draw a text box onto the page.'),
  shapeAnnotationInput,
  z
    .object({
      kind: z.literal('ink'),
      pageNumber: pageNumberSchema,
      strokes: z.array(z.array(pointSchema).min(2)).min(1).describe('Freehand strokes as normalized points.'),
      style: styleInputSchema,
    })
    .describe('Draw freehand ink.'),
])

export const listDocumentsInput = z.object({
  query: z.string().min(1).optional().describe('Filter by name, title, or author.'),
  limit: z.number().int().min(1).max(50).default(20),
})

export const openDocumentInput = z
  .object({
    documentId: z.string().min(1).optional().describe('Exact id from list_documents.'),
    name: z.string().min(1).optional().describe('Case-insensitive match against the file name or title.'),
  })
  .refine((value) => value.documentId || value.name, 'Provide documentId or name.')

export const readTextInput = z.object({
  pageNumber: pageNumberSchema,
  endPage: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Read through this page as well. Pages are concatenated until maxChars is reached.'),
  cursor: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe('Character offset into the first page. search_document returns an index usable here.'),
  maxChars: z.number().int().min(100).max(8000).default(4000),
})

export const searchInput = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(25).default(8),
})

export const navigateInput = z
  .object({
    pageNumber: pageNumberSchema.optional(),
    annotationId: z.string().min(1).optional().describe('Scroll to the page holding this annotation and select it.'),
  })
  .refine((value) => value.pageNumber || value.annotationId, 'Provide pageNumber or annotationId.')

export const listAnnotationsInput = z.object({
  pageNumber: pageNumberSchema.optional(),
  kind: annotationKindSchema.optional(),
  createdBy: z.enum(['human', 'webmcp']).optional().describe('Filter by who made the mark.'),
  detail: z
    .enum(['summary', 'full'])
    .default('summary')
    .describe('"full" adds geometry — quads, ink strokes, bounds — and is much larger.'),
  cursor: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(50).default(20),
})

export const createAnnotationsInput = z.object({
  annotations: z.array(createAnnotationSchema).min(1).max(20),
})

export const updateAnnotationsInput = z.object({
  updates: z
    .array(
      z.object({
        id: z.string().min(1),
        body: z.string().max(25_000).optional().describe('Text and note annotations only.'),
        resolved: z.boolean().optional().describe('Note annotations only.'),
        style: styleInputSchema,
      }),
    )
    .min(1)
    .max(20),
})

export const deleteAnnotationsInput = z.object({
  ids: z.array(z.string().min(1)).min(1).max(50),
  includeHumanAnnotations: z
    .boolean()
    .default(false)
    .describe('By default only annotations you created are deleted; the reader’s own marks are skipped.'),
})

export const annotationContextInput = z.object({
  annotationId: z.string().min(1),
  contextChars: z.number().int().min(100).max(2000).default(600),
})

export const exportInput = z.object({
  format: z.enum(['pdf', 'json']),
})

export interface DeletePartition {
  deletable: Array<Annotation>
  skipped: Array<{ id: string; reason: 'created_by_human' | 'not_found' }>
}

/**
 * Split requested ids into what an agent may remove and what it may not.
 * A reader's own marks are protected unless deletion is explicitly widened, and
 * a repeated id is only reported once.
 */
export function partitionDeletable(
  annotations: Array<Annotation>,
  ids: Array<string>,
  includeHumanAnnotations: boolean,
): DeletePartition {
  const partition: DeletePartition = { deletable: [], skipped: [] }
  for (const id of new Set(ids)) {
    const annotation = annotations.find((item) => item.id === id)
    if (!annotation) {
      partition.skipped.push({ id, reason: 'not_found' })
    } else if (!includeHumanAnnotations && annotation.createdBy !== 'webmcp') {
      partition.skipped.push({ id, reason: 'created_by_human' })
    } else {
      partition.deletable.push(annotation)
    }
  }
  return partition
}

/** Which fields of a patch this annotation kind can actually accept. */
export function applicableFields(annotation: Annotation) {
  return {
    body: annotation.kind === 'text' || annotation.kind === 'note',
    resolved: annotation.kind === 'note',
    style: true,
  }
}

export { annotationSummary }
