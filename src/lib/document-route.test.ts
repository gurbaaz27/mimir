import { describe, expect, it } from 'vitest'
import { getDocumentPath, getDocumentPathSegment, getDocumentSlug } from './document-route'

const firstDocument = { id: 'first', name: 'Report 2024.pdf' }
const secondDocument = { id: 'second', name: 'report_2024.pdf' }

describe('document routes', () => {
  it('creates readable paths from PDF filenames', () => {
    expect(getDocumentSlug(firstDocument.name)).toBe('report-2024')
    expect(getDocumentPath(firstDocument)).toBe('/report-2024')
  })

  it('adds a stable id when filename slugs collide', () => {
    const documents = [firstDocument, secondDocument]

    expect(getDocumentPathSegment(firstDocument, documents)).toBe('report-2024--first')
    expect(getDocumentPathSegment(secondDocument, documents)).toBe('report-2024--second')
    expect(getDocumentPath(firstDocument, documents)).toBe('/report-2024--first')
  })

  it('keeps non-Latin names routable', () => {
    expect(getDocumentSlug('研究ノート.pdf')).toBe('研究ノート')
  })
})
