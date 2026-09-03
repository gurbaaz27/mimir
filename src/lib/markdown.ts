/**
 * The markdown flavour that note and text-box bodies are written in.
 *
 * A body stays a plain markdown string everywhere it is stored, exported or
 * handed to an agent — there is no rich-document model behind it. So every
 * shortcut here is an edit to that source: exactly the characters a user could
 * have typed by hand, with the caret arithmetic worked out for them. Keeping
 * the transforms pure lets them be tested without a DOM.
 */

export interface TextState {
  value: string
  start: number
  end: number
}

export type MarkdownCommand =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'code'
  | 'bulletList'
  | 'orderedList'

type InlineCommand = Extract<MarkdownCommand, 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code'>

/**
 * Underline has no markdown of its own. `++text++` is the convention shared by
 * markdown-it's `ins` plugin and Discourse: it stays symmetric with the other
 * markers, and unlike `<u>` it never invites raw HTML into a body.
 */
export const inlineMarkers: Record<InlineCommand, string> = {
  bold: '**',
  italic: '*',
  underline: '++',
  strikethrough: '~~',
  code: '`',
}

const wordCharacter = /[\p{L}\p{N}_]/u
const bulletPattern = /^(\s*)[-*+]\s+/
const orderedPattern = /^(\s*)(\d+)\.\s+/
const listItemPattern = /^(\s*)(?:([-*+])\s+(\[[ xX]\]\s+)?|(\d+)\.\s+)/

function ordered(state: TextState) {
  return state.start <= state.end ? state : { value: state.value, start: state.end, end: state.start }
}

/** Marks never cover the whitespace at the edge of a selection. */
function trimSelection(value: string, start: number, end: number) {
  let from = start
  let to = end
  while (from < to && /\s/.test(value[from] ?? '')) from += 1
  while (to > from && /\s/.test(value[to - 1] ?? '')) to -= 1
  return { start: from, end: to }
}

function expandToWord(value: string, caret: number) {
  let start = caret
  let end = caret
  while (start > 0 && wordCharacter.test(value[start - 1] ?? '')) start -= 1
  while (end < value.length && wordCharacter.test(value[end] ?? '')) end += 1
  return start === end ? null : { start, end }
}

/**
 * A one-character marker only counts when it is not part of a longer run, so
 * italic does not mistake the inner asterisk of `**bold**` for its own.
 */
function isolated(value: string, before: number, after: number, marker: string) {
  if (marker.length > 1) return true
  return value[before] !== marker && value[after] !== marker
}

/** `marker` sits immediately outside the selection. */
function wrapsSelection(value: string, start: number, end: number, marker: string) {
  const length = marker.length
  if (start < length || end + length > value.length) return false
  if (value.slice(start - length, start) !== marker || value.slice(end, end + length) !== marker) return false
  return isolated(value, start - length - 1, end + length, marker)
}

/** `marker` sits at both ends of the selection itself. */
function wrapsInside(selected: string, marker: string) {
  const length = marker.length
  if (selected.length <= length * 2) return false
  if (!selected.startsWith(marker) || !selected.endsWith(marker)) return false
  return isolated(selected, length, selected.length - length - 1, marker)
}

function toggleInline(state: TextState, command: InlineCommand): TextState {
  const marker = inlineMarkers[command]
  const length = marker.length
  const { value, ...selection } = ordered(state)
  let { start, end } = selection

  if (start !== end) ({ start, end } = trimSelection(value, start, end))
  if (start === end) {
    const word = expandToWord(value, start)
    if (word) ({ start, end } = word)
  }

  // Nothing to mark: open the pair and leave the caret between the markers so
  // the next keystroke lands inside them.
  if (start === end) {
    return {
      value: value.slice(0, start) + marker + marker + value.slice(start),
      start: start + length,
      end: start + length,
    }
  }

  const selected = value.slice(start, end)
  if (wrapsInside(selected, marker)) {
    const inner = selected.slice(length, selected.length - length)
    return { value: value.slice(0, start) + inner + value.slice(end), start, end: start + inner.length }
  }
  if (wrapsSelection(value, start, end, marker)) {
    return {
      value: value.slice(0, start - length) + selected + value.slice(end + length),
      start: start - length,
      end: end - length,
    }
  }
  return {
    value: value.slice(0, start) + marker + selected + marker + value.slice(end),
    start: start + length,
    end: end + length,
  }
}

/** The full lines the selection touches, since list markers are per line. */
function lineRange(value: string, start: number, end: number) {
  const from = value.lastIndexOf('\n', start - 1) + 1
  const newline = value.indexOf('\n', end)
  return { from, to: newline === -1 ? value.length : newline }
}

function stripListPrefix(line: string) {
  const bullet = bulletPattern.exec(line)
  if (bullet) return { indent: bullet[1] ?? '', text: line.slice(bullet[0].length) }
  const numbered = orderedPattern.exec(line)
  if (numbered) return { indent: numbered[1] ?? '', text: line.slice(numbered[0].length) }
  const indent = /^\s*/.exec(line)?.[0] ?? ''
  return { indent, text: line.slice(indent.length) }
}

function toggleList(state: TextState, numbered: boolean): TextState {
  const { value, start, end } = ordered(state)
  const { from, to } = lineRange(value, start, end)
  const lines = value.slice(from, to).split('\n')
  const pattern = numbered ? orderedPattern : bulletPattern
  const written = lines.filter((line) => line.trim().length > 0)
  // Toggling off only when the whole block already carries this marker, so a
  // mixed selection becomes a list rather than half a list.
  const remove = written.length > 0 && written.every((line) => pattern.test(line))

  let counter = 0
  const next = lines.map((line) => {
    if (!line.trim()) return line
    const { indent, text } = stripListPrefix(line)
    if (remove) return indent + text
    counter += 1
    return `${indent}${numbered ? `${counter}. ` : '- '}${text}`
  })

  const block = next.join('\n')
  return { value: value.slice(0, from) + block + value.slice(to), start: from, end: from + block.length }
}

/**
 * What Enter should do inside a list: carry the marker down to the next line,
 * or — on an item that was left empty — end the list instead of extending it.
 * Returns null when the caret is not in a list and Enter should behave normally.
 */
export function continueList(state: TextState): TextState | null {
  const { value, start, end } = state
  if (start !== end) return null
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  const line = value.slice(lineStart, start)
  const match = listItemPattern.exec(line)
  if (!match) return null

  const [prefix, indent = '', bullet, checkbox, number] = match
  if (!line.slice(prefix.length).trim()) {
    return { value: value.slice(0, lineStart) + value.slice(start), start: lineStart, end: lineStart }
  }

  const marker = bullet
    ? `${indent}${bullet} ${checkbox ? '[ ] ' : ''}`
    : `${indent}${Number(number) + 1}. `
  const insert = `\n${marker}`
  return {
    value: value.slice(0, start) + insert + value.slice(end),
    start: start + insert.length,
    end: start + insert.length,
  }
}

export function applyMarkdownCommand(state: TextState, command: MarkdownCommand): TextState {
  if (command === 'bulletList') return toggleList(state, false)
  if (command === 'orderedList') return toggleList(state, true)
  return toggleInline(state, command)
}

/**
 * The editing shortcut a key press asks for, if any. Shift+digit reports a
 * different `key` on every layout, so the list shortcuts also accept the
 * physical key.
 */
export function markdownCommandForEvent(event: {
  key: string
  code?: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}): MarkdownCommand | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null
  const key = event.key.toLowerCase()
  if (event.shiftKey) {
    if (key === 'x') return 'strikethrough'
    if (key === '8' || key === '*' || event.code === 'Digit8') return 'bulletList'
    if (key === '7' || key === '&' || event.code === 'Digit7') return 'orderedList'
    return null
  }
  if (key === 'b') return 'bold'
  if (key === 'i') return 'italic'
  if (key === 'u') return 'underline'
  if (key === 'e') return 'code'
  return null
}

/**
 * A body with its markers taken off, for the places that can only show one run
 * of unstyled text: the PDF export, a pin's tooltip, a screen-reader label.
 * Structure a reader would otherwise lose — list bullets, numbering — is kept
 * as literal characters, so this stays readable rather than merely stripped.
 */
export function markdownToPlainText(markdown: string) {
  const lines = markdown.split('\n').map((line) => {
    if (/^\s*(?:```|~~~)/.test(line)) return ''
    return line
      .replace(/^(\s*)#{1,6}\s+/, '$1')
      .replace(/^(\s*)>\s?/, '$1')
      .replace(bulletPattern, '$1- ')
  })
  return stripInlineMarkers(lines.join('\n')).trim()
}

function stripInlineMarkers(text: string) {
  let result = text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')

  // One pass only reaches the outermost pair it meets, and a replacement is
  // never rescanned — so the nesting the renderer understands, `++**bold**++`,
  // needs the pass repeated until there is nothing left to take off.
  for (let pass = 0; pass < 6; pass += 1) {
    const next = result
      .replace(/(\*\*|__|~~|\+\+)([^\n]+?)\1/g, '$2')
      // A lone `*` or `_` only emphasises away from word characters, so
      // `snake_case_name` keeps its underscores.
      .replace(/(^|[^\w*_])([*_])([^*_\n]+)\2(?!\w)/g, '$1$3')
    if (next === result) break
    result = next
  }
  return result
}

/* ------------------------------------------------------------------ */
/* Rendering                                                          */
/* ------------------------------------------------------------------ */

/** The slice of mdast this plugin touches, spelled out so it owns no types. */
interface MarkdownNode {
  type: string
  value?: string
  children?: Array<MarkdownNode>
  data?: Record<string, unknown>
}

const underlineDelimiter = '++'

type Segment = { kind: 'delimiter' } | { kind: 'node'; node: MarkdownNode }

/**
 * Turns `++text++` into an `<u>` element.
 *
 * The pairing runs over a parent's children rather than over each text node so
 * that already-parsed marks survive inside it: by the time this sees
 * `++**bold**++` the emphasis is its own node and only the delimiters are left
 * as text on either side.
 */
export function remarkUnderline() {
  return (tree: MarkdownNode) => {
    if (tree.children) tree.children = transformChildren(tree.children)
  }
}

function transformChildren(children: Array<MarkdownNode>): Array<MarkdownNode> {
  const segments: Array<Segment> = []
  for (const child of children) {
    if (child.type === 'text' && child.value?.includes(underlineDelimiter)) {
      child.value.split(underlineDelimiter).forEach((part, index) => {
        if (index > 0) segments.push({ kind: 'delimiter' })
        if (part) segments.push({ kind: 'node', node: { type: 'text', value: part } })
      })
      continue
    }
    if (child.children) child.children = transformChildren(child.children)
    segments.push({ kind: 'node', node: child })
  }
  return mergeText(pairDelimiters(segments))
}

function pairDelimiters(segments: Array<Segment>): Array<MarkdownNode> {
  const output: Array<MarkdownNode> = []
  let index = 0
  while (index < segments.length) {
    const segment = segments[index]
    if (!segment) break
    if (segment.kind === 'node') {
      output.push(segment.node)
      index += 1
      continue
    }
    const close = findClosing(segments, index)
    if (close === -1) {
      output.push({ type: 'text', value: underlineDelimiter })
      index += 1
      continue
    }
    const inner = segments.slice(index + 1, close).flatMap((item) => (item.kind === 'node' ? [item.node] : []))
    output.push({ type: 'underline', data: { hName: 'u' }, children: mergeText(inner) })
    index = close + 1
  }
  return output
}

/** Like emphasis, a run may not open on trailing space or close on leading space. */
function findClosing(segments: Array<Segment>, open: number) {
  const after = segments[open + 1]
  if (!after || after.kind === 'delimiter') return -1
  if (after.node.type === 'text' && /^\s/.test(after.node.value ?? '')) return -1
  for (let index = open + 2; index < segments.length; index += 1) {
    if (segments[index]?.kind !== 'delimiter') continue
    const before = segments[index - 1]
    if (!before || before.kind === 'delimiter') continue
    if (before.node.type === 'text' && /\s$/.test(before.node.value ?? '')) continue
    return index
  }
  return -1
}

function mergeText(nodes: Array<MarkdownNode>) {
  const merged: Array<MarkdownNode> = []
  for (const node of nodes) {
    const previous = merged[merged.length - 1]
    if (node.type === 'text' && previous?.type === 'text') {
      previous.value = (previous.value ?? '') + (node.value ?? '')
      continue
    }
    merged.push(node)
  }
  return merged
}
