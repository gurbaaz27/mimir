import { memo, useLayoutEffect, useRef, type KeyboardEvent, type RefObject } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  applyMarkdownCommand,
  continueList,
  markdownCommandForEvent,
  remarkUnderline,
} from '#/lib/markdown'
import { cn } from '#/lib/utils'

/**
 * The formatted view of a note or text-box body.
 *
 * Everything sizes and colours itself in `em` and `currentColor`: a body is
 * drawn at the annotation's own font size and colour, and the box it sits in is
 * often only a couple of centimetres wide, so nothing here may impose an
 * absolute scale of its own.
 *
 * Raw HTML stays off — `react-markdown` ignores it without `rehype-raw`, and a
 * body can be written by an agent reading an untrusted PDF.
 */
const proseClass = [
  '[&>*]:my-[.4em] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
  '[&_h1]:text-[1.3em] [&_h2]:text-[1.15em] [&_h3]:text-[1.05em]',
  '[&_h1]:font-[660] [&_h2]:font-[640] [&_h3]:font-[620]',
  '[&_h4]:font-[620] [&_h5]:font-[620] [&_h6]:font-[620]',
  '[&_strong]:font-[680]',
  '[&_em]:italic',
  '[&_u]:underline [&_u]:underline-offset-2',
  '[&_del]:line-through',
  '[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-[1.25em] [&_ol]:pl-[1.45em]',
  '[&_li]:my-[.15em]',
  '[&_li>ul]:my-0 [&_li>ol]:my-0',
  // GFM task lists carry their own bullet in the checkbox.
  '[&_li:has(>input[type=checkbox])]:list-none [&_li:has(>input[type=checkbox])]:-ml-[1.1em]',
  '[&_input[type=checkbox]]:mr-[.35em] [&_input[type=checkbox]]:align-[-.05em]',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-current/25 [&_blockquote]:pl-[.5em] [&_blockquote]:opacity-80',
  '[&_code]:rounded-[3px] [&_code]:bg-current/8 [&_code]:px-[.25em] [&_code]:font-mono [&_code]:text-[.92em]',
  '[&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-current/8 [&_pre]:p-[.4em] [&_pre_code]:bg-transparent [&_pre_code]:p-0',
  '[&_hr]:my-[.5em] [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-current/30',
  '[&_a]:underline [&_a]:underline-offset-2',
  '[&_table]:w-full [&_table]:border-collapse',
  '[&_th]:border [&_th]:border-current/20 [&_th]:px-[.35em] [&_th]:text-left [&_th]:font-[620]',
  '[&_td]:border [&_td]:border-current/20 [&_td]:px-[.35em] [&_td]:align-top',
].join(' ')

function AnnotationMarkdownBody({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn(proseClass, className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkUnderline]}
        components={{
          a: ({ children, href }) => (
            <a
              href={href}
              // The link may have been lifted out of the PDF, so it gets no
              // opener handle back to this tab.
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export const AnnotationMarkdown = memo(AnnotationMarkdownBody)

/**
 * `caretPositionFromPoint` is the standard; WebKit and older Blink only ship
 * the range form, and jsdom neither.
 */
interface CaretDocument {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  caretRangeFromPoint?: (x: number, y: number) => Range | null
}

function renderedOffsetFromPoint(container: HTMLElement, clientX: number, clientY: number) {
  const caretDocument = document as unknown as CaretDocument
  const position = caretDocument.caretPositionFromPoint?.(clientX, clientY)
  const caret = position
    ? { node: position.offsetNode, offset: position.offset }
    : (() => {
        const range = caretDocument.caretRangeFromPoint?.(clientX, clientY)
        return range ? { node: range.startContainer, offset: range.startOffset } : null
      })()
  if (!caret || !container.contains(caret.node)) return null

  const range = document.createRange()
  range.selectNodeContents(container)
  range.setEnd(caret.node, caret.offset)
  return range.toString().length
}

/** `&amp;`, `&#38;`, `&#x26;` — a run of source standing for one rendered character. */
const characterReference = /^&(?:#\d+|#[xX][\da-fA-F]+|[a-zA-Z][\da-zA-Z]*);/

/**
 * Where a click on the formatted body lands in the markdown source, so that
 * clicking into the middle of a note puts the caret there rather than at the end.
 *
 * Every visible character is in the source too, with the markers interleaved
 * around it, so walking the two together maps one offset onto the other without
 * anyone having to keep a position map. Returns null when the point cannot be
 * placed — the browser resolved no caret, or the two ran out of step — leaving
 * the caller to fall back to the end of the body.
 */
export function sourceCaretFromPoint(
  container: HTMLElement,
  clientX: number,
  clientY: number,
  source: string,
) {
  const rendered = renderedOffsetFromPoint(container, clientX, clientY)
  if (rendered === null) return null
  const text = container.textContent ?? ''
  let sourceIndex = 0
  let textIndex = 0
  while (textIndex < rendered && sourceIndex < source.length) {
    // A character reference is several source characters standing for the one
    // the reader sees, so it is stepped over as a unit — and before the plain
    // comparison, or `&amp;apple` would align its `a` against the reference's.
    const reference = source[sourceIndex] === '&' ? characterReference.exec(source.slice(sourceIndex)) : null
    if (reference) {
      sourceIndex += reference[0].length
      textIndex += 1
      continue
    }
    if (source[sourceIndex] === text[textIndex]) textIndex += 1
    sourceIndex += 1
  }
  // The walk only holds while the rendered text is a subsequence of the source.
  // Where it is not, the caller's own default beats a confidently wrong caret.
  return textIndex < rendered ? null : sourceIndex
}

/**
 * Markdown editing shortcuts for a body textarea: ⌘B/⌘I/⌘U/⌘E, ⌘⇧X, and
 * ⌘⇧8/⌘⇧7 for lists, plus Enter carrying a list marker onto the next line.
 *
 * The caret has to be restored after React has written the new value back into
 * the textarea, so the range is parked in a ref and applied in a layout effect
 * rather than set here — setting it now would be overwritten by the re-render.
 */
export function useMarkdownShortcuts(
  ref: RefObject<HTMLTextAreaElement | null>,
  body: string,
  setBody: (value: string) => void,
) {
  const pendingSelection = useRef<[number, number] | null>(null)

  useLayoutEffect(() => {
    const selection = pendingSelection.current
    if (!selection) return
    pendingSelection.current = null
    ref.current?.setSelectionRange(selection[0], selection[1])
  }, [body, ref])

  return (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const element = event.currentTarget
    const state = { value: element.value, start: element.selectionStart, end: element.selectionEnd }
    const command = markdownCommandForEvent(event)
    const next = command
      ? applyMarkdownCommand(state, command)
      : event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey
        ? continueList(state)
        : null
    if (!next) return
    event.preventDefault()
    pendingSelection.current = [next.start, next.end]
    setBody(next.value)
  }
}
