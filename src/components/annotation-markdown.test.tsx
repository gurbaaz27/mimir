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

  it('maps a click in a body that renders to exactly its own source', () => {
    // The caret sits after "plain ", six characters into a body with nothing
    // hidden in it.
    const caret = caretAt('plain body', (body) => ({
      node: body.querySelector('p')?.firstChild as Node,
      offset: 6,
    }))
    expect(caret).toBe(6)
  })

  it('refuses to map a click once markdown has hidden characters', () => {
    // `[a](a)a` renders as "aa": aligning the two would anchor the trailing
    // character to the link destination and open the editor inside the syntax.
    for (const source of ['[a](a)a', 'a **bold** tail', 'a &copy; b']) {
      const caret = caretAt(source, (body) => ({ node: body.querySelector('p') as Node, offset: 0 }))
      expect(caret).toBeNull()
    }
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
