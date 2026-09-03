// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { focusMarkdownEditor, MarkdownEditor } from './markdown-editor'

/** The editor is controlled, so a test needs something to hold the body. */
function Harness({ initial, onValue }: { initial: string; onValue?: (value: string) => void }) {
  const [value, setValue] = useState(initial)
  return (
    <MarkdownEditor
      value={value}
      ariaLabel="Body"
      placeholder="Write…"
      onChange={(next) => {
        setValue(next)
        onValue?.(next)
      }}
    />
  )
}

function editor() {
  return screen.getByRole('textbox')
}

/**
 * The body as the editor defines it: one line per line element. `textContent`
 * alone would run the lines together, since it puts nothing between blocks.
 */
function source() {
  return Array.from(editor().querySelectorAll('[data-line]'))
    .map((line) => line.textContent)
    .join('\n')
}

function input(inputType: string, init: { data?: string } = {}) {
  fireEvent(
    editor(),
    new InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true, ...init }),
  )
}

describe('markdown editor', () => {
  afterEach(cleanup)

  it('holds the markdown source and styles the marks in place', () => {
    render(<Harness initial="Hi ~~how~~ **are you**" />)

    const element = editor()
    expect(source()).toBe('Hi ~~how~~ **are you**')
    const styled = Array.from(element.querySelectorAll('span'))
    expect(styled.find((span) => span.className.includes('line-through'))?.textContent).toBe('how')
    expect(styled.find((span) => span.className.includes('font-[680]'))?.textContent).toBe('are you')
  })

  it('hides the markers on the lines the caret is not on', () => {
    render(<Harness initial={'**one**\nplain'} />)

    const markers = Array.from(editor().querySelectorAll('span')).filter((span) =>
      span.textContent === '**',
    )
    expect(markers).toHaveLength(2)
    expect(markers.every((span) => span.className.includes('hidden'))).toBe(true)
  })

  it('shows the markers again once the caret lands on that line', async () => {
    render(<Harness initial="**one**" />)

    focusMarkdownEditor(editor(), 3)
    fireEvent(document, new Event('selectionchange'))

    await vi.waitFor(() => {
      const markers = Array.from(editor().querySelectorAll('span')).filter((span) => span.textContent === '**')
      expect(markers.every((span) => !span.className.includes('hidden'))).toBe(true)
    })
  })

  it('applies typed text to the source rather than letting the browser edit', () => {
    const onValue = vi.fn()
    render(<Harness initial="ab" onValue={onValue} />)

    focusMarkdownEditor(editor(), 1)
    input('insertText', { data: 'X' })

    expect(onValue).toHaveBeenCalledWith('aXb')
    expect(source()).toBe('aXb')
  })

  it('deletes one character back, and a whole word on demand', () => {
    render(<Harness initial="one two" />)

    focusMarkdownEditor(editor(), 7)
    input('deleteContentBackward')
    expect(source()).toBe('one tw')

    input('deleteWordBackward')
    expect(source()).toBe('one ')
  })

  it('never splits a surrogate pair on backspace', () => {
    render(<Harness initial="a😀" />)

    focusMarkdownEditor(editor(), 3)
    input('deleteContentBackward')

    expect(source()).toBe('a')
  })

  it('carries a list marker onto the next line', () => {
    render(<Harness initial="- first" />)

    focusMarkdownEditor(editor(), 7)
    input('insertParagraph')

    expect(source()).toBe('- first\n- ')
  })

  it('splits a plain line on Enter', () => {
    render(<Harness initial="onetwo" />)

    focusMarkdownEditor(editor(), 3)
    input('insertParagraph')

    expect(source()).toBe('one\ntwo')
  })

  it('wraps the selection when a mark is applied from the keyboard', () => {
    render(<Harness initial="note text" />)

    focusMarkdownEditor(editor(), 0, 4)
    fireEvent.keyDown(editor(), { key: 'b', metaKey: true })

    expect(source()).toBe('**note** text')
  })

  it('undoes and redoes its own edits', () => {
    render(<Harness initial="start" />)

    focusMarkdownEditor(editor(), 5)
    input('insertText', { data: '!' })
    expect(source()).toBe('start!')

    fireEvent.keyDown(editor(), { key: 'z', metaKey: true })
    expect(source()).toBe('start')

    fireEvent.keyDown(editor(), { key: 'z', metaKey: true, shiftKey: true })
    expect(source()).toBe('start!')
  })

  it('offers the placeholder only while the body is empty', () => {
    render(<Harness initial="" />)
    expect(editor().querySelector('[data-placeholder]')?.getAttribute('data-placeholder')).toBe('Write…')

    focusMarkdownEditor(editor(), 0)
    input('insertText', { data: 'x' })

    expect(source()).toBe('x')
    expect(editor().querySelector('[data-placeholder]')).toBeNull()
  })
})
