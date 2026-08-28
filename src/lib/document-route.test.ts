import { describe, expect, it } from 'vitest'
import { getDocumentPath, getDocumentPathSegment, getDocumentSlug } from './document-route'

const firstDocument = { id: 'first', name: 'Report 2024.pdf' }
const secondDocument = { id: 'second', name: 'report_2024.pdf' }

describe('document routes', () => {
  it('creates readable paths from PDF filenames', () => {
    expect(getDocumentSlug(firstDocument.name)).toBe('report-2024')
    expect(getDocumentPath(firstDocument)).toBe('/report-2024')
  })

  it('uses persisted route segments for colliding filenames', () => {
    const firstRoutedDocument = { ...firstDocument, routeSlug: 'report-2024--first' }
    const secondRoutedDocument = { ...secondDocument, routeSlug: 'report-2024--second' }

    expect(getDocumentPathSegment(firstRoutedDocument)).toBe('report-2024--first')
    expect(getDocumentPathSegment(secondRoutedDocument)).toBe('report-2024--second')
    expect(getDocumentPath(firstRoutedDocument)).toBe('/report-2024--first')
  })

  it('keeps non-Latin names routable', () => {
    expect(getDocumentSlug('研究ノート.pdf')).toBe('研究ノート')
  })
})
