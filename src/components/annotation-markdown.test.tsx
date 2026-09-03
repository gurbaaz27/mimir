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

  /**
   * jsdom resolves no caret from a point, so the mapping is driven through a
   * stubbed one that lands where `pick` says.
   */
  function caretAt(source: string, pick: (body: HTMLElement) => { node: Node; offset: number }) {
    const { container } = render(<AnnotationMarkdown content={source} />)
    const body = container.firstElementChild as HTMLElement
    const original = Object.getOwnPropertyDescriptor(document, 'caretRangeFromPoint')
    Object.defineProperty(document, 'caretRangeFromPoint', {
      configurable: true,
      value: () => {
        const { node, offset } = pick(body)
        const range = document.createRange()
        range.setStart(node, offset)
        return range
      },
    })
    try {
      return sourceCaretFromPoint(body, 0, 0, source)
    } finally {
      if (original) Object.defineProperty(document, 'caretRangeFromPoint', original)
      else Reflect.deleteProperty(document, 'caretRangeFromPoint')
    }
  }

  it('maps a rendered offset back onto the markdown source', () => {
    // Two characters into the rendered word "bold", which is six characters
    // into the source once `a ` and the opening `**` are counted.
    const caret = caretAt('a **bold** tail', (body) => ({
      node: body.querySelector('strong')?.firstChild as Node,
      offset: 2,
    }))
    expect(caret).toBe(6)
  })

  it('steps over a character reference as one rendered character', () => {
    // The caret sits after the rendered `©`, which is `&copy;` in the source.
    const caret = caretAt('a &copy; b', (body) => ({
      node: body.querySelector('p')?.firstChild as Node,
      offset: 4,
    }))
    expect(caret).toBe(9)
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
