// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { AnnotationMarkdown, sourceCaretFromPoint } from './annotation-markdown'

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

  it('maps a rendered offset back onto the markdown source', () => {
    const { container } = render(<AnnotationMarkdown content="a **bold** tail" />)
    const body = container.firstElementChild as HTMLElement
    // jsdom resolves no caret from a point, so drive the mapping through a
    // stubbed one and check the marker characters are skipped.
    const original = Object.getOwnPropertyDescriptor(document, 'caretRangeFromPoint')
    Object.defineProperty(document, 'caretRangeFromPoint', {
      configurable: true,
      value: () => {
        const range = document.createRange()
        const bold = body.querySelector('strong')?.firstChild
        if (bold) range.setStart(bold, 2)
        return range
      },
    })

    // Two characters into the rendered word "bold", which is four characters
    // into the source once the opening `**` is counted.
    expect(sourceCaretFromPoint(body, 0, 0, 'a **bold** tail')).toBe(6)

    if (original) Object.defineProperty(document, 'caretRangeFromPoint', original)
    else Reflect.deleteProperty(document, 'caretRangeFromPoint')
  })

  it('falls back to no position when the browser resolves no caret', () => {
    const { container } = render(<AnnotationMarkdown content="a **bold** tail" />)
    expect(sourceCaretFromPoint(container.firstElementChild as HTMLElement, 0, 0, 'a **bold** tail')).toBeNull()
  })

  it('gives links no opener handle back to the tab', () => {
    const link = markup('[table](https://example.com)').querySelector('a')
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.getAttribute('rel')).toContain('noopener')
  })
})
