/**
 * Offset-preserving decoration of one line of markdown.
 *
 * The live editor holds the markdown source itself — markers and all — and only
 * styles the syntax away, so every run it draws has to point back at the exact
 * characters it came from. That is why this is a scanner of its own rather than
 * a second reader of remark's tree: remark decodes text and keeps positions
 * only per node, neither of which survives a caret landing mid-word.
 *
 * It is a decorator, not a parser. Where it and remark disagree on some corner
 * of the grammar the formatted view — which is what remark renders — remains
 * the authority; the cost of being wrong here is a marker styled oddly while
 * someone types, not a body that saves incorrectly.
 */

export type InlineMark = 'strong' | 'emphasis' | 'underline' | 'strike' | 'code' | 'link'
export type BlockKind = 'paragraph' | 'heading' | 'quote' | 'bullet' | 'ordered'

/**
 * `marker` is inline syntax, hidden while the caret is on another line.
 * `prefix` is the block marker at the head of a line: always shown, because
 * hiding it would shift the text sideways every time the caret arrived, and an
 * ordered list's number cannot be put back by CSS at all.
 */
export type RunKind = 'text' | 'marker' | 'prefix'

export interface DecorationRun {
  start: number
  end: number
  marks: ReadonlyArray<InlineMark>
  kind: RunKind
}

export interface DecoratedLine {
  block: BlockKind
  /** Heading level 1-6; 0 for every other block. */
  level: number
  /** Tiles the line exactly: no gaps, no overlaps, in order. */
  runs: Array<DecorationRun>
}

interface Delimiter {
  marker: string
  marks: ReadonlyArray<InlineMark>
}

/** Longest first, so `***` is not read as `**` and `**` not as `*`. */
const delimiters: ReadonlyArray<Delimiter> = [
  { marker: '`', marks: ['code'] },
  { marker: '***', marks: ['strong', 'emphasis'] },
  { marker: '___', marks: ['strong', 'emphasis'] },
  { marker: '**', marks: ['strong'] },
  { marker: '__', marks: ['strong'] },
  { marker: '~~', marks: ['strike'] },
  { marker: '++', marks: ['underline'] },
  { marker: '*', marks: ['emphasis'] },
  { marker: '_', marks: ['emphasis'] },
]

const wordCharacter = /[\p{L}\p{N}]/u
const headingPrefix = /^ {0,3}#{1,6} /
const quotePrefix = /^ {0,3}> ?/
const bulletPrefix = /^\s*[-*+] /
const orderedPrefix = /^\s*\d+\. /
const linkPattern = /^\[([^\]\n]*)\]\([^)\n]*\)/

function blockPrefix(line: string) {
  const heading = headingPrefix.exec(line)
  if (heading) return { block: 'heading' as const, level: heading[0].trim().length, length: heading[0].length }
  const quote = quotePrefix.exec(line)
  if (quote) return { block: 'quote' as const, level: 0, length: quote[0].length }
  const bullet = bulletPrefix.exec(line)
  if (bullet) return { block: 'bullet' as const, level: 0, length: bullet[0].length }
  const ordered = orderedPrefix.exec(line)
  if (ordered) return { block: 'ordered' as const, level: 0, length: ordered[0].length }
  return { block: 'paragraph' as const, level: 0, length: 0 }
}

/** The character at `index` is one of a longer run of the same delimiter. */
function isRunOf(text: string, index: number, marker: string) {
  return text[index - 1] === marker || text[index + 1] === marker
}

/** A delimiter may open here: it is followed by content rather than a space. */
function openerAt(text: string, index: number, to: number) {
  for (const delimiter of delimiters) {
    if (!text.startsWith(delimiter.marker, index)) continue
    const after = index + delimiter.marker.length
    if (after >= to) continue
    if (delimiter.marker !== '`' && /\s/.test(text[after] ?? '')) continue
    // One `*` out of a longer run is not its own delimiter: `a ** b ** c`,
    // where the pair cannot open, stays literal rather than emphasising on halves.
    if (delimiter.marker.length === 1 && isRunOf(text, index, delimiter.marker)) continue
    // `_` does not emphasise inside a word, so `snake_case_name` is left alone.
    if (delimiter.marker.startsWith('_') && wordCharacter.test(text[index - 1] ?? '')) continue
    return delimiter
  }
  return null
}

function closerAt(text: string, from: number, to: number, marker: string) {
  if (marker === '`') {
    const index = text.indexOf('`', from)
    return index > from && index < to ? index : -1
  }
  for (let index = from; index + marker.length <= to; index += 1) {
    if (!text.startsWith(marker, index)) continue
    if (index === from) continue
    if (/\s/.test(text[index - 1] ?? '')) continue
    if (marker.length === 1 && isRunOf(text, index, marker)) continue
    if (marker.startsWith('_') && wordCharacter.test(text[index + marker.length] ?? '')) continue
    return index
  }
  return -1
}

function scanInline(
  text: string,
  from: number,
  to: number,
  marks: ReadonlyArray<InlineMark>,
  runs: Array<DecorationRun>,
) {
  let plainFrom = from
  let index = from
  const flush = (until: number) => {
    if (until > plainFrom) runs.push({ start: plainFrom, end: until, marks, kind: 'text' })
  }

  while (index < to) {
    const link = text[index] === '[' ? linkPattern.exec(text.slice(index, to)) : null
    if (link) {
      const label = link[1] ?? ''
      const labelFrom = index + 1
      flush(index)
      runs.push({ start: index, end: labelFrom, marks, kind: 'marker' })
      scanInline(text, labelFrom, labelFrom + label.length, [...marks, 'link'], runs)
      runs.push({ start: labelFrom + label.length, end: index + link[0].length, marks, kind: 'marker' })
      index += link[0].length
      plainFrom = index
      continue
    }

    const opener = openerAt(text, index, to)
    if (!opener) {
      index += 1
      continue
    }
    const innerFrom = index + opener.marker.length
    const close = closerAt(text, innerFrom, to, opener.marker)
    if (close === -1) {
      index += opener.marker.length
      continue
    }

    flush(index)
    runs.push({ start: index, end: innerFrom, marks, kind: 'marker' })
    const inner = [...marks, ...opener.marks]
    // Code spans are literal: nothing inside them is syntax.
    if (opener.marks[0] === 'code') runs.push({ start: innerFrom, end: close, marks: inner, kind: 'text' })
    else scanInline(text, innerFrom, close, inner, runs)
    runs.push({ start: close, end: close + opener.marker.length, marks, kind: 'marker' })

    index = close + opener.marker.length
    plainFrom = index
  }

  flush(to)
}

export function decorateLine(line: string): DecoratedLine {
  const prefix = blockPrefix(line)
  const runs: Array<DecorationRun> = []
  if (prefix.length > 0) runs.push({ start: 0, end: prefix.length, marks: [], kind: 'prefix' })
  scanInline(line, prefix.length, line.length, [], runs)
  return { block: prefix.block, level: prefix.level, runs }
}
