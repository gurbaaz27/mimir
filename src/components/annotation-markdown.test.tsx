// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { AnnotationMarkdown } from './annotation-markdown'

function markup(content: string) {
  const { container } = render(<AnnotationMarkdown content={content} />)
  return container
}

describe('annotation markdown', () => {
  afterEach(cleanup)

  it('renders the marks a body can carry', () => {
    const container = markup('**bold** *italic* ~~gone~~ ++under++ `code`')
    expect(container.querySelector('strong')?.textContent).toBe('bold')
    expect(container.querySelector('em')?.textContent).toBe('italic')
    expect(container.querySelector('del')?.textContent).toBe('gone')
    expect(container.querySelector('u')?.textContent).toBe('under')
    expect(container.querySelector('code')?.textContent).toBe('code')
  })

  it('renders both kinds of list', () => {
    const container = markup('- one\n- two\n\n1. first\n2. second')
    expect(container.querySelectorAll('ul > li')).toHaveLength(2)
    expect(container.querySelectorAll('ol > li')).toHaveLength(2)
  })

  it('keeps marks nested inside an underline', () => {
    const container = markup('++**both**++')
    expect(container.querySelector('u > strong')?.textContent).toBe('both')
  })

  it('leaves an unpaired marker as text', () => {
    const container = markup('two ++ three')
    expect(container.querySelector('u')).toBeNull()
    expect(container.textContent).toContain('two ++ three')
  })

  it('ignores raw html rather than rendering it', () => {
    const container = markup('<img src="x" onerror="alert(1)">done')
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('done')
  })

  it('gives links no opener handle back to the tab', () => {
    const link = markup('[table](https://example.com)').querySelector('a')
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.getAttribute('rel')).toContain('noopener')
  })
})
