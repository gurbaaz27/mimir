import { describe, expect, it } from 'vitest'
import {
  applyMarkdownCommand,
  continueList,
  markdownCommandForEvent,
  markdownToPlainText,
  type TextState,
} from './markdown'

function state(value: string, start: number, end = start): TextState {
  return { value, start, end }
}

const press = (key: string, modifiers: Partial<{ shiftKey: boolean; altKey: boolean }> = {}) => ({
  key,
  metaKey: true,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...modifiers,
})

describe('inline markers', () => {
  it('wraps the selection and keeps it selected', () => {
    expect(applyMarkdownCommand(state('note text', 0, 4), 'bold')).toEqual({
      value: '**note** text',
      start: 2,
      end: 6,
    })
  })

  it('unwraps a selection that already sits inside the marker', () => {
    expect(applyMarkdownCommand(state('**note** text', 2, 6), 'bold')).toEqual({
      value: 'note text',
      start: 0,
      end: 4,
    })
  })

  it('unwraps when the markers are part of the selection', () => {
    expect(applyMarkdownCommand(state('**note** text', 0, 8), 'bold')).toEqual({
      value: 'note text',
      start: 0,
      end: 4,
    })
  })

  it('does not mistake the inner asterisk of bold for italic', () => {
    expect(applyMarkdownCommand(state('**note**', 2, 6), 'italic').value).toBe('***note***')
  })

  it('marks the word under the caret when nothing is selected', () => {
    expect(applyMarkdownCommand(state('one two', 5), 'italic')).toEqual({
      value: 'one *two*',
      start: 5,
      end: 8,
    })
  })

  it('opens an empty pair with the caret inside it', () => {
    expect(applyMarkdownCommand(state('one ', 4), 'underline')).toEqual({
      value: 'one ++++',
      start: 6,
      end: 6,
    })
  })

  it('leaves the whitespace at the edge of a selection outside the marker', () => {
    expect(applyMarkdownCommand(state('one two ', 3, 8), 'strikethrough').value).toBe('one ~~two~~ ')
  })
})

describe('list markers', () => {
  it('turns every touched line into a bullet', () => {
    const result = applyMarkdownCommand(state('one\ntwo', 1, 5), 'bulletList')
    expect(result.value).toBe('- one\n- two')
    expect([result.start, result.end]).toEqual([0, 11])
  })

  it('numbers an ordered list from one', () => {
    expect(applyMarkdownCommand(state('one\ntwo\nthree', 0, 13), 'orderedList').value)
      .toBe('1. one\n2. two\n3. three')
  })

  it('replaces one list marker with the other', () => {
    expect(applyMarkdownCommand(state('- one\n- two', 0, 11), 'orderedList').value).toBe('1. one\n2. two')
  })

  it('removes the marker when the whole block already carries it', () => {
    expect(applyMarkdownCommand(state('- one\n- two', 0, 11), 'bulletList').value).toBe('one\ntwo')
  })

  it('lists a mixed block rather than half-unlisting it', () => {
    expect(applyMarkdownCommand(state('- one\ntwo', 0, 9), 'bulletList').value).toBe('- one\n- two')
  })
})

describe('list continuation', () => {
  it('carries a bullet onto the next line', () => {
    expect(continueList(state('- first', 7))?.value).toBe('- first\n- ')
  })

  it('increments an ordered marker', () => {
    expect(continueList(state('1. first', 8))?.value).toBe('1. first\n2. ')
  })

  it('carries an unticked box onto the next task', () => {
    expect(continueList(state('- [x] first', 11))?.value).toBe('- [x] first\n- [ ] ')
  })

  it('keeps the indent of a nested item', () => {
    expect(continueList(state('  - first', 9))?.value).toBe('  - first\n  - ')
  })

  it('ends the list on an item that was left empty', () => {
    expect(continueList(state('- one\n- ', 8))).toEqual({ value: '- one\n', start: 6, end: 6 })
  })

  it('leaves plain text to the browser', () => {
    expect(continueList(state('plain', 5))).toBeNull()
  })

  it('leaves a selection to the browser', () => {
    expect(continueList(state('- one', 2, 5))).toBeNull()
  })
})

describe('shortcuts', () => {
  it('maps the inline marks', () => {
    expect(markdownCommandForEvent(press('b'))).toBe('bold')
    expect(markdownCommandForEvent(press('i'))).toBe('italic')
    expect(markdownCommandForEvent(press('u'))).toBe('underline')
    expect(markdownCommandForEvent(press('e'))).toBe('code')
    expect(markdownCommandForEvent(press('x', { shiftKey: true }))).toBe('strikethrough')
  })

  it('maps the list shortcuts through whatever the layout reports', () => {
    expect(markdownCommandForEvent(press('8', { shiftKey: true }))).toBe('bulletList')
    expect(markdownCommandForEvent(press('*', { shiftKey: true }))).toBe('bulletList')
    expect(markdownCommandForEvent({ ...press('Dead', { shiftKey: true }), code: 'Digit7' })).toBe('orderedList')
  })

  it('ignores presses without the modifier and keys the editor already owns', () => {
    expect(markdownCommandForEvent({ ...press('b'), metaKey: false })).toBeNull()
    expect(markdownCommandForEvent(press('b', { altKey: true }))).toBeNull()
    expect(markdownCommandForEvent(press('z'))).toBeNull()
  })
})

describe('plain text', () => {
  it('takes the markers off inline marks', () => {
    expect(markdownToPlainText('**bold**, *italic*, ~~gone~~ and ++under++'))
      .toBe('bold, italic, gone and under')
  })

  it('keeps the structure a reader needs', () => {
    expect(markdownToPlainText('# Heading\n\n* one\n* two\n\n> quoted'))
      .toBe('Heading\n\n- one\n- two\n\nquoted')
  })

  it('keeps link text and drops the target', () => {
    expect(markdownToPlainText('see [the table](https://example.com/x)')).toBe('see the table')
  })

  it('leaves underscores inside a word alone', () => {
    expect(markdownToPlainText('call snake_case_name twice')).toBe('call snake_case_name twice')
  })
})
