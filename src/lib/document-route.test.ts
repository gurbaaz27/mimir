import { describe, expect, it } from 'vitest'
import { getDocumentPath, getDocumentSlug } from './document-route'

describe('document routes', () => {
  it('creates readable paths from PDF filenames', () => {
    const document = { name: 'Attention Is All You Need.pdf' }

    expect(getDocumentSlug(document.name)).toBe('attention-is-all-you-need')
    expect(getDocumentPath(document)).toBe('/attention-is-all-you-need')
  })

  it('keeps non-Latin names routable', () => {
    expect(getDocumentSlug('研究ノート.pdf')).toBe('研究ノート')
  })
})
