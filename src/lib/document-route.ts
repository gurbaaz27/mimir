import type { DocumentRecord } from './db.client'

/**
 * Create the stable, human-readable path segment used for a local document.
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

export function getDocumentPath(document: Pick<DocumentRecord, 'name'>) {
  return `/${getDocumentSlug(document.name)}`
}
