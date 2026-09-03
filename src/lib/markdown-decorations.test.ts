import { describe, expect, it } from 'vitest'
import { decorateLine, type DecorationRun } from './markdown-decorations'

/** What a reader sees once the syntax is styled away. */
function visible(line: string) {
  return decorateLine(line)
    .runs.filter((run) => run.kind !== 'marker')
    .map((run) => line.slice(run.start, run.end))
    .join('')
}

function marked(line: string, mark: string) {
  return decorateLine(line)
    .runs.filter((run) => run.kind === 'text' && run.marks.includes(mark as DecorationRun['marks'][number]))
    .map((run) => line.slice(run.start, run.end))
}

describe('line decoration', () => {
  it('tiles the line exactly, whatever is in it', () => {
    for (const line of [
      '',
      'plain text',
      'Hi ~~how~~ **are you**',
      '# heading',
      '- item with *emphasis*',
      '1. numbered `code`',
      '> quoted ++under++',
      'unclosed ** marker',
      '[label](https://example.com) after',
      '***both*** and _mixed_',
      '**a `b` c**',
    ]) {
      const { runs } = decorateLine(line)
      let cursor = 0
      for (const run of runs) {
        expect(run.start).toBe(cursor)
        expect(run.end).toBeGreaterThan(run.start)
        cursor = run.end
      }
      expect(cursor).toBe(line.length)
    }
  })

  it('marks the content and leaves the delimiters as syntax', () => {
    expect(visible('Hi ~~how~~ **are you**')).toBe('Hi how are you')
    expect(marked('Hi ~~how~~ **are you**', 'strike')).toEqual(['how'])
    expect(marked('Hi ~~how~~ **are you**', 'strong')).toEqual(['are you'])
  })

  it('carries a mark into the runs nested under it', () => {
    expect(marked('**bold with *both* inside**', 'strong')).toEqual(['bold with ', 'both', ' inside'])
    expect(marked('**bold with *both* inside**', 'emphasis')).toEqual(['both'])
  })

  it('reads a triple delimiter as both marks at once', () => {
    expect(marked('***both***', 'strong')).toEqual(['both'])
    expect(marked('***both***', 'emphasis')).toEqual(['both'])
  })

  it('treats a code span as literal', () => {
    expect(marked('`**not bold**`', 'code')).toEqual(['**not bold**'])
    expect(marked('`**not bold**`', 'strong')).toEqual([])
  })

  it('hides the link target and keeps the label', () => {
    expect(visible('see [the table](https://example.com) now')).toBe('see the table now')
    expect(marked('see [the table](https://example.com) now', 'link')).toEqual(['the table'])
  })

  it('leaves an unclosed or spaced-out delimiter as plain text', () => {
    expect(visible('unclosed ** marker')).toBe('unclosed ** marker')
    expect(visible('a ** b ** c')).toBe('a ** b ** c')
    expect(marked('snake_case_name here', 'emphasis')).toEqual([])
  })

  it('names the block and keeps its prefix visible', () => {
    expect(decorateLine('## Heading')).toMatchObject({ block: 'heading', level: 2 })
    expect(decorateLine('- item')).toMatchObject({ block: 'bullet' })
    expect(decorateLine('1. item')).toMatchObject({ block: 'ordered' })
    expect(decorateLine('> quoted')).toMatchObject({ block: 'quote' })
    expect(decorateLine('plain')).toMatchObject({ block: 'paragraph' })
    // A prefix is never a marker, so it stays on screen and nothing shifts.
    expect(visible('## Heading')).toBe('## Heading')
    expect(visible('- item')).toBe('- item')
  })

  it('does not mistake bold at the head of a line for a bullet', () => {
    expect(decorateLine('**bold**').block).toBe('paragraph')
    expect(marked('**bold**', 'strong')).toEqual(['bold'])
  })
})
