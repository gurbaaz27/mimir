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

export const textAnnotationSchema = base.extend({
  kind: z.literal('text'),
  bounds: rectSchema,
  body: z.string().max(10_000),
  alignment: z.enum(['left', 'center', 'right']).default('left'),
})

export const noteAnnotationSchema = base.extend({
  kind: z.literal('note'),
  point: pointSchema,
  body: z.string().max(25_000),
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
      return { x: annotation.point.x, y: annotation.point.y, width: 0.03, height: 0.03 }
  }
}
