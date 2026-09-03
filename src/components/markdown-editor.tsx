import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type Ref,
} from 'react'
import { applyMarkdownCommand, continueList, markdownCommandForEvent } from '#/lib/markdown'
import { decorateLine, type DecoratedLine, type InlineMark } from '#/lib/markdown-decorations'
import { cn } from '#/lib/utils'

/**
 * A markdown field that styles itself as it is typed in.
 *
 * The element holds the markdown *source* — every marker is really there in the
 * DOM — and the syntax is merely styled out of sight on the lines the caret is
 * not on. That is what keeps this honest: `textContent` is the body, a caret is
 * an offset into the body, and nothing has to be serialised back out of a rich
 * document model.
 *
 * The price is that the browser may not edit the DOM itself, or React's tree and
 * the caret's arithmetic would drift apart. So every `beforeinput` is applied to
 * the string here and the caret put back afterwards, which also means this owns
 * its own undo stack — the browser's is about a DOM this never lets it touch.
 */

const markClass: Record<InlineMark, string> = {
  strong: 'font-[680]',
  emphasis: 'italic',
  underline: 'underline underline-offset-2',
  strike: 'line-through',
  code: 'rounded-[3px] bg-current/10 px-[.2em] font-mono text-[.92em]',
  link: 'underline underline-offset-2',
}

const headingClass = ['', 'text-[1.3em]', 'text-[1.15em]', 'text-[1.05em]', '', '', '']

function lineClass(line: DecoratedLine) {
  switch (line.block) {
    case 'heading':
      return cn('font-[660]', headingClass[line.level])
    case 'quote':
      return 'border-l-2 border-current/25 pl-[.45em] opacity-80'
    case 'bullet':
    case 'ordered':
      return 'pl-[1.1em] -indent-[1.1em]'
    default:
      return ''
  }
}

/* ------------------------------------------------------------------ */
/* Caret arithmetic                                                    */
/* ------------------------------------------------------------------ */

function lineElements(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-line]'))
}

/**
 * The source offset a DOM position stands for. `Range.toString()` reads the DOM
 * rather than the layout, so the markers styled out of sight still count — which
 * is exactly what makes the offset an offset into the source.
 */
function offsetOf(root: HTMLElement, node: Node, offset: number) {
  const lines = lineElements(root)
  if (node === root) {
    return lines.slice(0, offset).reduce((total, line) => total + (line.textContent ?? '').length + 1, 0)
  }
  let base = 0
  for (const line of lines) {
    if (line === node || line.contains(node)) {
      const range = document.createRange()
      range.selectNodeContents(line)
      try {
        range.setEnd(node, offset)
      } catch {
        return null
      }
      return base + range.toString().length
    }
    base += (line.textContent ?? '').length + 1
  }
  return null
}

export function selectionOffsets(root: HTMLElement) {
  const selection = document.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null
  const start = offsetOf(root, range.startContainer, range.startOffset)
  const end = offsetOf(root, range.endContainer, range.endOffset)
  if (start === null || end === null) return null
  return { start: Math.min(start, end), end: Math.max(start, end) }
}

function positionInLine(line: HTMLElement, offset: number) {
  const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
  let remaining = offset
  let last: Text | null = null
  let node = walker.nextNode()
  while (node) {
    const text = node as Text
    if (remaining <= text.data.length) return { node: text as Node, offset: remaining }
    remaining -= text.data.length
    last = text
    node = walker.nextNode()
  }
  return last ? { node: last as Node, offset: last.data.length } : { node: line as Node, offset: 0 }
}

function positionOf(root: HTMLElement, offset: number) {
  const lines = lineElements(root)
  let base = 0
  for (const line of lines) {
    const length = (line.textContent ?? '').length
    if (offset <= base + length) return positionInLine(line, offset - base)
    base += length + 1
  }
  const last = lines[lines.length - 1]
  return last ? positionInLine(last, (last.textContent ?? '').length) : null
}

function selectRange(root: HTMLElement, start: number, end: number) {
  const from = positionOf(root, start)
  const to = start === end ? from : positionOf(root, end)
  if (!from || !to) return
  const range = document.createRange()
  range.setStart(from.node, from.offset)
  range.setEnd(to.node, to.offset)
  const selection = document.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

/** Focus a markdown editor and put the caret, or a selection, into its body. */
export function focusMarkdownEditor(root: HTMLElement, start: number, end = start) {
  root.focus()
  selectRange(root, start, end)
}

function lineIndexAt(value: string, offset: number) {
  let index = 0
  for (let cursor = 0; cursor < offset && cursor < value.length; cursor += 1) {
    if (value[cursor] === '\n') index += 1
  }
  return index
}

/* ------------------------------------------------------------------ */
/* Source edits                                                        */
/* ------------------------------------------------------------------ */

function replaceRange(value: string, start: number, end: number, text: string) {
  return { value: value.slice(0, start) + text + value.slice(end), caret: start + text.length }
}

function previousBoundary(value: string, caret: number, unit: 'character' | 'word' | 'line') {
  if (caret <= 0) return 0
  if (unit === 'line') return value.lastIndexOf('\n', caret - 1) + 1
  if (unit === 'word') {
    let index = caret
    while (index > 0 && /\s/.test(value[index - 1] ?? '')) index -= 1
    while (index > 0 && !/\s/.test(value[index - 1] ?? '')) index -= 1
    return index
  }
  // Never split a surrogate pair: one press of backspace is one character.
  const previous = caret - 1
  const code = value.charCodeAt(previous)
  return code >= 0xdc00 && code <= 0xdfff && previous > 0 ? previous - 1 : previous
}

function nextBoundary(value: string, caret: number, unit: 'character' | 'word' | 'line') {
  if (caret >= value.length) return value.length
  if (unit === 'line') {
    const newline = value.indexOf('\n', caret)
    return newline === -1 ? value.length : newline
  }
  if (unit === 'word') {
    let index = caret
    while (index < value.length && /\s/.test(value[index] ?? '')) index += 1
    while (index < value.length && !/\s/.test(value[index] ?? '')) index += 1
    return index
  }
  const code = value.charCodeAt(caret)
  return code >= 0xd800 && code <= 0xdbff && caret + 1 < value.length ? caret + 2 : caret + 1
}

const deleteUnits: Record<string, 'character' | 'word' | 'line'> = {
  deleteContentBackward: 'character',
  deleteContentForward: 'character',
  deleteWordBackward: 'word',
  deleteWordForward: 'word',
  deleteSoftLineBackward: 'line',
  deleteSoftLineForward: 'line',
  deleteHardLineBackward: 'line',
  deleteHardLineForward: 'line',
}

interface Snapshot {
  value: string
  start: number
  end: number
}

export interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  onFocus?: () => void
  onBlur?: () => void
  onPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void
  placeholder?: string
  ariaLabel: string
  className?: string
  style?: CSSProperties
  ref?: Ref<HTMLDivElement>
}

export function MarkdownEditor({
  value,
  onChange,
  onFocus,
  onBlur,
  onPointerDown,
  placeholder,
  ariaLabel,
  className,
  style,
  ref,
}: MarkdownEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const pendingRef = useRef<{ start: number; end: number } | null>(null)
  const composingRef = useRef(false)
  const activeLineRef = useRef<number | null>(null)
  const [activeLine, setActiveLine] = useState<number | null>(null)
  const [, forceRender] = useReducer((count: number) => count + 1, 0)
  const historyRef = useRef<{ past: Array<Snapshot>; future: Array<Snapshot>; at: number }>({
    past: [],
    future: [],
    at: 0,
  })

  const lines = useMemo(() => value.split('\n'), [value])
  const decorated = useMemo(() => lines.map(decorateLine), [lines])

  const attachRoot = useCallback(
    (element: HTMLDivElement | null) => {
      rootRef.current = element
      if (typeof ref === 'function') ref(element)
      else if (ref) ref.current = element
    },
    [ref],
  )

  // React is the only writer of this subtree, so the caret it just rebuilt has
  // to be put back by hand — every edit below parks where it belongs here.
  useLayoutEffect(() => {
    const root = rootRef.current
    const pending = pendingRef.current
    if (!root || !pending) return
    pendingRef.current = null
    selectRange(root, pending.start, pending.end)
    activeLineRef.current = lineIndexAt(value, pending.start)
    setActiveLine(activeLineRef.current)
  }, [value])

  /** Which line shows its markers follows the caret, wherever it was put. */
  useEffect(() => {
    const track = () => {
      const root = rootRef.current
      if (!root) return
      if (document.activeElement !== root) {
        if (activeLineRef.current !== null) {
          activeLineRef.current = null
          setActiveLine(null)
        }
        return
      }
      const offsets = selectionOffsets(root)
      if (!offsets) return
      const next = lineIndexAt(value, offsets.start)
      if (next === activeLineRef.current) return
      activeLineRef.current = next
      setActiveLine(next)
    }
    document.addEventListener('selectionchange', track)
    return () => document.removeEventListener('selectionchange', track)
  }, [value])

  const commit = useCallback(
    (next: string, start: number, end = start) => {
      pendingRef.current = { start, end }
      onChange(next)
    },
    [onChange],
  )

  const remember = useCallback(
    (selection: { start: number; end: number }, coalesce: boolean) => {
      const history = historyRef.current
      const now = Date.now()
      history.future = []
      if (coalesce && history.past.length > 0 && now - history.at < 600) {
        history.at = now
        return
      }
      history.past.push({ value, start: selection.start, end: selection.end })
      if (history.past.length > 200) history.past.shift()
      history.at = now
    },
    [value],
  )

  const travel = useCallback(
    (from: 'past' | 'future', to: 'past' | 'future') => {
      const root = rootRef.current
      const history = historyRef.current
      const snapshot = history[from].pop()
      if (!root || !snapshot) return
      const selection = selectionOffsets(root) ?? { start: value.length, end: value.length }
      history[to].push({ value, start: selection.start, end: selection.end })
      history.at = 0
      commit(snapshot.value, snapshot.start, snapshot.end)
    },
    [commit, value],
  )

  // `beforeinput` carries the intent (`inputType`) that a key press alone does
  // not, so all editing is read off it. React's synthetic `onBeforeInput` is the
  // legacy `textInput` event and has no `inputType`, hence the native listener.
  const editRef = useRef<(event: InputEvent) => void>(undefined)
  editRef.current = (event: InputEvent) => {
    const root = rootRef.current
    if (!root || composingRef.current) return
    // Nothing may reach the DOM: React owns this subtree.
    event.preventDefault()

    const selection = selectionOffsets(root)
    if (!selection) return
    const { start, end } = selection
    const type = event.inputType

    if (type === 'historyUndo') return travel('past', 'future')
    if (type === 'historyRedo') return travel('future', 'past')

    const unit = deleteUnits[type]
    if (unit) {
      const backward = type.endsWith('Backward')
      const from = start !== end ? start : backward ? previousBoundary(value, start, unit) : start
      const to = start !== end ? end : backward ? end : nextBoundary(value, end, unit)
      if (from === to) return
      remember(selection, false)
      const next = replaceRange(value, from, to, '')
      return commit(next.value, next.caret)
    }

    if (type === 'deleteByCut' || type === 'deleteByDrag' || type === 'deleteContent') {
      if (start === end) return
      remember(selection, false)
      const next = replaceRange(value, start, end, '')
      return commit(next.value, next.caret)
    }

    if (type === 'insertParagraph' || type === 'insertLineBreak') {
      remember(selection, false)
      const continued = start === end ? continueList({ value, start, end }) : null
      if (continued) return commit(continued.value, continued.start)
      const next = replaceRange(value, start, end, '\n')
      return commit(next.value, next.caret)
    }

    if (type.startsWith('insert')) {
      const text = event.data ?? event.dataTransfer?.getData('text/plain') ?? ''
      if (!text) return
      remember(selection, type === 'insertText' && text.length === 1)
      // A pasted body arrives with whatever line endings it had.
      const next = replaceRange(value, start, end, text.replace(/\r\n?/g, '\n'))
      return commit(next.value, next.caret)
    }
  }

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const handler = (event: Event) => editRef.current?.(event as InputEvent)
    root.addEventListener('beforeinput', handler)
    return () => root.removeEventListener('beforeinput', handler)
  }, [])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const root = rootRef.current
    if (!root) return

    const command = markdownCommandForEvent(event)
    if (command) {
      const selection = selectionOffsets(root)
      if (!selection) return
      event.preventDefault()
      remember(selection, false)
      const next = applyMarkdownCommand({ value, ...selection }, command)
      return commit(next.value, next.start, next.end)
    }

    // The browser's own history is about a DOM this never lets it edit.
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      event.stopPropagation()
      return travel(event.shiftKey ? 'future' : 'past', event.shiftKey ? 'past' : 'future')
    }
  }

  return (
    <div
      ref={attachRoot}
      role="textbox"
      aria-multiline
      aria-label={ariaLabel}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      className={cn('whitespace-pre-wrap outline-none', className)}
      style={style}
      onKeyDown={handleKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
      onPointerDown={onPointerDown}
      onCompositionStart={() => {
        composingRef.current = true
      }}
      onCompositionEnd={() => {
        composingRef.current = false
        const root = rootRef.current
        if (!root) return
        // The IME wrote straight into the DOM. Read the body back off it, then
        // let React rebuild the subtree it no longer recognises.
        const composed = lineElements(root)
          .map((line) => line.textContent ?? '')
          .join('\n')
        const selection = selectionOffsets(root)
        pendingRef.current = selection ?? null
        if (composed === value) forceRender()
        else onChange(composed)
      }}
    >
      {decorated.map((line, index) => (
        <div
          key={index}
          data-line=""
          data-active={index === activeLine || undefined}
          data-placeholder={index === 0 && !value ? placeholder : undefined}
          className={cn(
            'relative',
            lineClass(line),
            index === 0 &&
              !value &&
              placeholder &&
              'before:pointer-events-none before:absolute before:opacity-45 before:content-[attr(data-placeholder)]',
          )}
        >
          {line.runs.map((run, runIndex) => (
            <span
              key={runIndex}
              className={cn(
                run.marks.map((mark) => markClass[mark]),
                run.kind === 'prefix' && 'opacity-40',
                run.kind === 'marker' && (index === activeLine ? 'opacity-40' : 'hidden'),
              )}
            >
              {lines[index]?.slice(run.start, run.end)}
            </span>
          ))}
          {line.runs.length === 0 && <br />}
        </div>
      ))}
    </div>
  )
}
