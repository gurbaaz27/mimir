import type { DocumentRecord } from './db.client'

export type RoutableDocument = Pick<DocumentRecord, 'id' | 'name' | 'routeSlug'>

/**
 * Create the readable base path segment used for a local document.
 * The extension is omitted because the route represents the reader, not the
 * downloaded file itself.
 */
export function getDocumentSlug(name: string) {
  const withoutExtension = name.replace(/\.pdf$/i, '')
  const slug = withoutExtension
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')

  return slug || 'document'
}

/**
 * Read the persisted segment, falling back to the base slug for documents
 * created before route segments were stored.
 */
export function getDocumentPathSegment(document: RoutableDocument) {
  return document.routeSlug || getDocumentSlug(document.name)
}

export function getDocumentPath(document: RoutableDocument) {
  return `/${getDocumentPathSegment(document)}`
}
