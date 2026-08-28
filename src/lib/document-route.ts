import type { DocumentRecord } from './db.client'

type RoutableDocument = Pick<DocumentRecord, 'id' | 'name'>

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
 * Keep the common case clean while making colliding filename slugs unique.
 * The document id is stable in IndexedDB, so the resulting route survives a
 * refresh and can still be resolved when multiple files share a name.
 */
export function getDocumentPathSegment(document: RoutableDocument, documents: readonly RoutableDocument[]) {
  const slug = getDocumentSlug(document.name)
  const collisions = documents.filter((candidate) => getDocumentSlug(candidate.name) === slug)
  return collisions.length > 1 ? `${slug}--${document.id}` : slug
}

export function getDocumentPath(document: RoutableDocument, documents: readonly RoutableDocument[] = [document]) {
  return `/${getDocumentPathSegment(document, documents)}`
}
