// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ChatMarkdown } from './chat-markdown'

afterEach(cleanup)

describe('assistant replies rendered as markdown', () => {
  it('renders the emphasis the model actually emits', () => {
    const { container } = render(
      <ChatMarkdown content={'Added the sticky note **“less go!”** near **D-9519/T1** on page 1.'} />,
    )
    expect(container.querySelectorAll('strong')).toHaveLength(2)
    expect(container.textContent).toBe('Added the sticky note “less go!” near D-9519/T1 on page 1.')
    expect(container.textContent).not.toContain('**')
  })

  it('keeps a link from the document from handing out an opener', () => {
    render(<ChatMarkdown content="See [the docs](https://example.com/spec)." />)
    const link = screen.getByRole('link', { name: 'the docs' })
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('does not render raw HTML from an untrusted PDF', () => {
    const { container } = render(
      <ChatMarkdown content={'The page says <img src=x onerror="alert(1)"> and <b>bold</b>.'} />,
    )
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
  })

  it('gives a table and a code block their own scroll container', () => {
    const { container } = render(
      <ChatMarkdown content={'| page | quote |\n| --- | --- |\n| 1 | D-9519/T1 |\n\n```json\n{"kind":"note"}\n```'} />,
    )
    expect(container.querySelector('table')?.parentElement?.className).toContain('overflow-x-auto')
    expect(container.querySelector('pre')?.className).toContain('overflow-x-auto')
  })

  it('renders a half-finished stream without dropping the text', () => {
    // Content arrives a token at a time, so unbalanced markers are normal.
    const { container } = render(<ChatMarkdown content={'Added the sticky note **“less go'} />)
    expect(container.textContent).toContain('less go')
  })

  it('renders lists the model uses for tool summaries', () => {
    const { container } = render(<ChatMarkdown content={'- searched page 1\n- created 1 note'} />)
    expect(container.querySelectorAll('li')).toHaveLength(2)
  })
})
