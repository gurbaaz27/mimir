import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Assistant replies are markdown, and the sidebar is 352px wide — so the job
 * here is as much containment as typography. Anything that cannot wrap (a code
 * block, a table, a long URL) has to scroll inside its own box rather than
 * widen the column and push the composer off screen.
 *
 * Raw HTML is deliberately not enabled. `react-markdown` ignores it unless
 * `rehype-raw` is added, and this content comes from a model reading an
 * untrusted PDF, so it stays off.
 */

// Block spacing lives on the container rather than on each element, so the
// first and last child never add a gap the bubble has to absorb.
const proseClass = [
  'text-xs leading-[1.6] text-ink-soft',
  '[&>*]:my-2 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
  // Headings borrow the display face, a step down from dialog titles.
  '[&_h1]:font-display [&_h1]:text-[15px] [&_h1]:font-[620] [&_h1]:tracking-[-.02em] [&_h1]:text-ink',
  '[&_h2]:font-display [&_h2]:text-[14px] [&_h2]:font-[620] [&_h2]:tracking-[-.02em] [&_h2]:text-ink',
  '[&_h3]:font-display [&_h3]:text-[13px] [&_h3]:font-[600] [&_h3]:text-ink',
  '[&_strong]:font-[600] [&_strong]:text-ink',
  '[&_em]:italic',
  '[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-[18px] [&_ol]:pl-[18px]',
  '[&_li]:my-1 [&_li]:pl-0.5 [&_li::marker]:text-faint',
  // Tight nesting: a nested list should not inherit the block gap above.
  '[&_li>ul]:my-1 [&_li>ol]:my-1',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-2.5 [&_blockquote]:text-muted',
  '[&_hr]:border-0 [&_hr]:border-t [&_hr]:border-line',
  // Inline code only — the `pre` override below strips this back for blocks.
  '[&_code]:rounded-[5px] [&_code]:bg-sunken [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-[11px] [&_code]:text-ink',
  '[&_th]:whitespace-nowrap [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-[600] [&_th]:text-ink',
  '[&_td]:px-2 [&_td]:py-1 [&_td]:align-top',
  '[&_thead]:border-b [&_thead]:border-line',
  '[&_tbody_tr]:border-b [&_tbody_tr]:border-line/60',
].join(' ')

function MarkdownBody({ content }: { content: string }) {
  return (
    <div className={proseClass}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) => (
            <a
              href={href}
              // The reply may cite a link lifted from the PDF, so treat it as
              // untrusted: no opener handle back to this tab.
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
            >
              {children}
            </a>
          ),
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-lg bg-sunken p-2.5 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-[11px] [&_code]:leading-[1.5]">
              {children}
            </pre>
          ),
          // A table cannot wrap, so it scrolls inside its own box.
          table: ({ children }) => (
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full border-collapse text-[11px]">{children}</table>
            </div>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

// Content is re-rendered on every streamed delta, so skip the parse when the
// text has not moved.
export const ChatMarkdown = memo(MarkdownBody)
