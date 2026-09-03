import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { remarkUnderline } from '#/lib/markdown'
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

/**
 * Where a click on the formatted body lands in the markdown source, so that
 * clicking into a note opens the editor there rather than at the end.
 *
 * Only a body that renders to exactly its own source can be mapped. The moment
 * markdown hides characters — a marker, a link destination, a character
 * reference — the rendered text stops lining up with the source, and there is
 * no sound way to realign them from out here: matching them character by
 * character just as readily anchors a rendered letter to a hidden one, opening
 * the editor inside the syntax. So this maps what it can prove and returns null
 * otherwise, leaving the caller its own end-of-body default.
 */
export function sourceCaretFromPoint(
  container: HTMLElement,
  clientX: number,
  clientY: number,
  source: string,
) {
  if (container.textContent !== source) return null
  return renderedOffsetFromPoint(container, clientX, clientY)
}
