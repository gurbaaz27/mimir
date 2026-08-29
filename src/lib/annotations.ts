import { z } from 'zod'

export const pointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
})

export const rectSchema = pointSchema.extend({
  width: z.number().positive().max(1),
  height: z.number().positive().max(1),
})

export const annotationStyleSchema = z.object({
  color: z.string().min(1),
  opacity: z.number().min(0.05).max(1).default(1),
  strokeWidth: z.number().min(0.5).max(20).optional(),
  fill: z.string().optional(),
  fontSize: z.number().min(8).max(72).optional(),
})

export const quoteAnchorSchema = z.object({
  quote: z.string().min(1),
  prefix: z.string().max(120).optional(),
  suffix: z.string().max(120).optional(),
  occurrence: z.number().int().min(1).optional(),
})

const base = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  documentId: z.string().min(1),
  pageNumber: z.number().int().positive(),
  style: annotationStyleSchema,
  createdBy: z.enum(['human', 'webmcp']),
  lastModifiedBy: z.enum(['human', 'webmcp']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const markupAnnotationSchema = base.extend({
  kind: z.literal('markup'),
  markup: z.enum(['highlight', 'underline', 'strikeout']),
  selectedText: z.string().min(1),
  quoteAnchor: quoteAnchorSchema.optional(),
  quads: z.array(rectSchema).min(1),
})

export const inkAnnotationSchema = base.extend({
  kind: z.literal('ink'),
  strokes: z.array(z.array(pointSchema).min(2)).min(1),
})

export const shapeAnnotationSchema = base.extend({
  kind: z.literal('shape'),
  shape: z.enum(['rectangle', 'ellipse', 'line', 'arrow']),
  bounds: rectSchema.optional(),
  start: pointSchema.optional(),
  end: pointSchema.optional(),
})

/**
 * How much text each kind of body can hold. A text box is drawn directly onto
 * the page and grows with its content, but is still bounded well below a note,
 * which is read in a panel. Anything validating a body has to read the limit
 * from here rather than restate it, or the two drift apart.
 */
export const annotationBodyLimits = { text: 10_000, note: 25_000 } as const

export const textAnnotationSchema = base.extend({
  kind: z.literal('text'),
  bounds: rectSchema,
  body: z.string().max(annotationBodyLimits.text),
  alignment: z.enum(['left', 'center', 'right']).default('left'),
})

export const noteAnnotationSchema = base.extend({
  kind: z.literal('note'),
  point: pointSchema,
  /** Optional custom size; older notes fall back to the standard sticky size. */
  bounds: rectSchema.optional(),
  body: z.string().max(annotationBodyLimits.note),
  resolved: z.boolean().default(false),
})

export const annotationSchema = z.discriminatedUnion('kind', [
  markupAnnotationSchema,
  inkAnnotationSchema,
  shapeAnnotationSchema,
  textAnnotationSchema,
  noteAnnotationSchema,
])

export type Point = z.infer<typeof pointSchema>
export type NormalizedRect = z.infer<typeof rectSchema>
export type AnnotationStyle = z.infer<typeof annotationStyleSchema>
export type AnnotationPatch = Omit<Partial<Annotation>, 'style'> & { style?: Partial<AnnotationStyle> } & Record<string, unknown>
export type QuoteAnchor = z.infer<typeof quoteAnchorSchema>
export type Annotation = z.infer<typeof annotationSchema>
export type AnnotationKind = Annotation['kind']
export type AnnotationAuthor = Annotation['createdBy']
export type MarkupType = z.infer<typeof markupAnnotationSchema>['markup']
export type ShapeType = z.infer<typeof shapeAnnotationSchema>['shape']

export interface AnnotationSidecar {
  schemaVersion: 1
  app: 'mimir'
  appVersion: string
  document: {
    fingerprint: string
    name: string
    pageCount: number
  }
  exportedAt: string
  annotations: Array<Annotation>
}

export const annotationSidecarSchema = z.object({
  schemaVersion: z.literal(1),
  app: z.literal('mimir'),
  appVersion: z.string(),
  document: z.object({
    fingerprint: z.string(),
    name: z.string(),
    pageCount: z.number().int().positive(),
  }),
  exportedAt: z.string().datetime(),
  annotations: z.array(annotationSchema),
})

export const annotationColors = [
  { name: 'Sun', value: '#f5c84b' },
  { name: 'Tide', value: '#159b98' },
  { name: 'Coral', value: '#e76f51' },
  { name: 'Iris', value: '#7c6fcd' },
  { name: 'Ink', value: '#243b3a' },
] as const

export function createAnnotationBase(
  documentId: string,
  pageNumber: number,
  author: AnnotationAuthor,
  style: AnnotationStyle,
) {
  const now = new Date().toISOString()
  return {
    schemaVersion: 1 as const,
    id: crypto.randomUUID(),
    documentId,
    pageNumber,
    style,
    createdBy: author,
    lastModifiedBy: author,
    createdAt: now,
    updatedAt: now,
  }
}

export function annotationBounds(annotation: Annotation): NormalizedRect | null {
  switch (annotation.kind) {
    case 'markup': {
      const xs = annotation.quads.flatMap((quad) => [quad.x, quad.x + quad.width])
      const ys = annotation.quads.flatMap((quad) => [quad.y, quad.y + quad.height])
      const x = Math.min(...xs)
      const y = Math.min(...ys)
      return {
        x,
        y,
        width: Math.max(...xs) - x,
        height: Math.max(...ys) - y,
      }
    }
    case 'ink': {
      const points = annotation.strokes.flat()
      const xs = points.map((point) => point.x)
      const ys = points.map((point) => point.y)
      const x = Math.min(...xs)
      const y = Math.min(...ys)
      return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
    }
    case 'shape':
      return annotation.bounds ??
        (annotation.start && annotation.end
          ? {
              x: Math.min(annotation.start.x, annotation.end.x),
              y: Math.min(annotation.start.y, annotation.end.y),
              width: Math.abs(annotation.end.x - annotation.start.x),
              height: Math.abs(annotation.end.y - annotation.start.y),
            }
          : null)
    case 'text':
      return annotation.bounds
    case 'note':
      return annotation.bounds ?? { x: annotation.point.x, y: annotation.point.y, width: 0.03, height: 0.03 }
  }
}

/** Translate an annotation in normalized page coordinates for a group move. */
export function translateAnnotation(annotation: Annotation, dx: number, dy: number): Annotation {
  const movePoint = (point: Point): Point => ({
    x: Math.max(0, Math.min(1, point.x + dx)),
    y: Math.max(0, Math.min(1, point.y + dy)),
  })
  const moveRect = (rect: NormalizedRect): NormalizedRect => ({
    ...rect,
    x: Math.max(0, Math.min(1 - rect.width, rect.x + dx)),
    y: Math.max(0, Math.min(1 - rect.height, rect.y + dy)),
  })

  switch (annotation.kind) {
    case 'markup':
      return { ...annotation, quads: annotation.quads.map((quad) => moveRect(quad)) }
    case 'ink':
      return { ...annotation, strokes: annotation.strokes.map((stroke) => stroke.map(movePoint)) }
    case 'shape':
      return {
        ...annotation,
        ...(annotation.bounds ? { bounds: moveRect(annotation.bounds) } : {}),
        ...(annotation.start ? { start: movePoint(annotation.start) } : {}),
        ...(annotation.end ? { end: movePoint(annotation.end) } : {}),
      }
    case 'text':
      return { ...annotation, bounds: moveRect(annotation.bounds) }
    case 'note':
      return {
        ...annotation,
        point: movePoint(annotation.point),
        ...(annotation.bounds
          ? { bounds: moveRect(annotation.bounds) }
          : {}),
      }
  }
}

/**
 * The kind of mark this is, in the words a reader would use for it. Shapes and
 * markup carry their own subtype, so those win over the structural kind.
 */
export function annotationLabel(annotation: Annotation) {
  if (annotation.kind === 'markup') return annotation.markup
  if (annotation.kind === 'shape') return annotation.shape
  return annotation.kind
}

/** The readable body of a mark, if it has one. */
export function annotationText(annotation: Annotation) {
  if (annotation.kind === 'markup') return annotation.selectedText
  if (annotation.kind === 'text' || annotation.kind === 'note') return annotation.body
  return null
}

export interface AnnotationSummary {
  id: string
  kind: AnnotationKind
  label: string
  pageNumber: number
  text: string | null
  truncated: boolean
  color: string
  createdBy: AnnotationAuthor
  updatedAt: string
  resolved?: boolean
}

/**
 * A compact view of a mark for agents and lists. Geometry — quads, ink strokes,
 * bounds — is deliberately omitted: it is large, and nothing outside the
 * renderer can act on it. Ask for the full record when you need it.
 */
export function annotationSummary(annotation: Annotation, maxTextLength = 280): AnnotationSummary {
  const text = annotationText(annotation)
  const truncated = text !== null && text.length > maxTextLength
  return {
    id: annotation.id,
    kind: annotation.kind,
    label: annotationLabel(annotation),
    pageNumber: annotation.pageNumber,
    text: truncated ? `${text.slice(0, maxTextLength)}…` : text,
    truncated,
    color: annotation.style.color,
    createdBy: annotation.createdBy,
    updatedAt: annotation.updatedAt,
    ...(annotation.kind === 'note' ? { resolved: annotation.resolved } : {}),
  }
}

/** The body limit that applies to this annotation, or null if it has no body. */
export function annotationBodyLimit(annotation: Annotation) {
  if (annotation.kind === 'text') return annotationBodyLimits.text
  if (annotation.kind === 'note') return annotationBodyLimits.note
  return null
}
