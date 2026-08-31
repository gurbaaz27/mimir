import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchServerSentEvents, createChatClientOptions } from '@tanstack/ai-client'
import { useChat } from '@tanstack/ai-react'
import { ThinkingState } from '@aicss/react/thinking-state'
import { LoaderCircle } from 'lucide-react'
import { Dialog } from 'radix-ui'
import {
  ArrowUpRightIcon,
  BookTextIcon,
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  ScanTextIcon,
  SearchIcon,
  TrashIcon,
  XIcon,
  ZapIcon,
} from '#/components/icons'
import { ChatMarkdown } from './chat-markdown'
import { webmcpClientTools } from '#/ai/client-tools'
import { canExecuteOverWebmcp } from '#/ai/webmcp-bridge.client'
import { chatPersistence } from '#/lib/db.client'
import { cn } from '#/lib/utils'
import { Button, IconButton, dialogOverlayClass, dialogSurfaceClass } from './ui'
import { Kbd, KbdGroup } from './ui/kbd'

// Module scope on purpose: the transport and tool implementations close over
// nothing from React and can be shared by every document conversation.
const chatConnection = fetchServerSentEvents('/api/chat')

const stateLabel: Record<string, string> = {
  'awaiting-input': 'preparing',
  'input-streaming': 'preparing',
  'input-complete': 'running',
  'approval-requested': 'waiting for you',
  'approval-responded': 'running',
  complete: 'done',
  error: 'failed',
}

const settledStates = new Set(['complete', 'error'])

const messageTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
})
const millisecondsPerDay = 24 * 60 * 60 * 1000

function localCalendarDay(date: Date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / millisecondsPerDay
}

function formatMessageTime(createdAt: Date | undefined) {
  if (!createdAt || Number.isNaN(createdAt.getTime())) return null
  const daysAgo = localCalendarDay(new Date()) - localCalendarDay(createdAt)
  if (daysAgo > 0) return `${daysAgo} day${daysAgo === 1 ? '' : 's'} ago`
  return messageTimeFormatter.format(createdAt)
}

/** The three openings that actually suit a PDF, offered before the first turn. */
const openers = [
  { icon: ScanTextIcon, label: 'Summarize this document' },
  { icon: SearchIcon, label: 'What are the key definitions?' },
  { icon: BookTextIcon, label: 'Walk me through the main argument' },
]

type ToolCallSummary = { id: string; name: string; detail: string | null; state: string }

type Block =
  | { kind: 'text'; key: string; content: string }
  | { kind: 'tools'; key: string; calls: Array<ToolCallSummary> }

/**
 * A turn can fire half a dozen tools before it says a word, and one bordered
 * row per call turns the transcript into a wall of boxes. Consecutive calls
 * collapse into a single trail instead: open while the work is happening, one
 * summary line once it has settled.
 */
function ToolTrail({ calls }: { calls: Array<ToolCallSummary> }) {
  const running = calls.some((call) => !settledStates.has(call.state))
  const failed = calls.some((call) => call.state === 'error')
  // `null` means "follow the work" — the reader's click takes over from there.
  const [override, setOverride] = useState<boolean | null>(null)
  const open = override ?? running
  const active = calls.find((call) => !settledStates.has(call.state))

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-line bg-[linear-gradient(180deg,var(--color-paper),var(--color-surface))] shadow-lift',
        failed && 'border-danger/35',
      )}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2 py-[7px] text-left transition-colors duration-150 hover:bg-sunken/70"
        aria-expanded={open}
        onClick={() => setOverride(!open)}
      >
        <span
          className={cn(
            'grid size-[22px] shrink-0 place-items-center rounded-lg border border-[oklch(.9_.02_85)] bg-cream text-bark',
            running && 'border-clay/45',
            failed && 'border-danger/35 bg-[oklch(.975_.014_28)] text-danger',
          )}
          aria-hidden="true"
        >
          {running ? <LoaderCircle className="size-[13px] animate-spin-slow" /> : <ZapIcon size={13} />}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-ink-soft">
          {running && active ? (
            <>
              <span className="text-muted">Running </span>
              <code className="font-mono text-[10.5px] text-ink">{active.name}</code>
            </>
          ) : failed ? (
            <span className="text-danger">A tool call failed</span>
          ) : (
            <>
              <span className="font-[560] text-ink">
                {calls.length} tool {calls.length === 1 ? 'call' : 'calls'}
              </span>
              <span className="ml-1.5 text-muted">on this page</span>
            </>
          )}
        </span>
        <ChevronDownIcon
          className={cn('shrink-0 text-faint transition-transform duration-160 ease-spring', !open && '-rotate-90')}
          size={14}
        />
      </button>

      {open && (
        <ol className="m-0 list-none border-t border-line/80 py-1.5 pr-2 pl-[21px]">
          {calls.map((call) => {
            const settled = settledStates.has(call.state)
            return (
              <li
                key={call.id}
                // The rail is drawn on the item so the last step's line stops
                // at its own dot instead of running past the trail.
                className="relative flex items-center gap-2 py-[5px] pl-[15px] before:absolute before:top-0 before:bottom-0 before:left-0 before:w-px before:bg-line before:content-[''] first:before:top-1/2 last:before:bottom-1/2"
              >
                <span
                  className={cn(
                    'absolute left-px z-1 grid size-2 -translate-x-1/2 place-items-center rounded-full bg-paper ring-1 ring-line-strong',
                    settled && 'bg-clay/70 ring-clay/40',
                    call.state === 'error' && 'bg-danger ring-danger/40',
                  )}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">
                  <code className="font-mono text-[10.5px] text-ink">{call.name}</code>
                  {call.detail && <span className="ml-1.5 text-[10.5px] text-muted">{call.detail}</span>}
                </span>
                <span
                  className={cn(
                    'flex shrink-0 items-center gap-1 text-[10px] text-muted',
                    call.state === 'error' && 'text-danger',
                  )}
                >
                  {call.state === 'complete' ? (
                    <CheckIcon className="text-clay" size={12} />
                  ) : (
                    (stateLabel[call.state] ?? call.state)
                  )}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

/**
 * Text and tool calls arrive interleaved; the trail only reads as one unit if
 * neighbouring calls are folded together before anything is drawn.
 */
function toBlocks(parts: ReturnType<typeof useChat>['messages'][number]['parts']): Array<Block> {
  const blocks: Array<Block> = []
  parts.forEach((part, index) => {
    if (part.type === 'text') {
      blocks.push({ kind: 'text', key: `text-${index}`, content: part.content })
      return
    }
    if (part.type !== 'tool-call') return
    // `run_webmcp_tool` is a wrapper; the reader cares which page tool it is
    // actually driving.
    // The per-tool input typing is lost once the part is read off the generic
    // message list, so the wrapper's payload is narrowed by hand here.
    const input = part.input as { title?: string } | undefined
    const inner = part.name === 'run_webmcp_tool' ? (input?.title ?? null) : null
    const call: ToolCallSummary = {
      id: part.id,
      name: inner ?? part.name,
      detail: inner ? null : 'reading available tools',
      state: part.state,
    }
    const last = blocks.at(-1)
    if (last?.kind === 'tools') last.calls.push(call)
    else blocks.push({ kind: 'tools', key: `tools-${index}`, calls: [call] })
  })
  return blocks
}

export function ChatSidebar({ documentId, open, onClose }: { documentId: string; open: boolean; onClose: () => void }) {
  const chatOptions = useMemo(
    () => createChatClientOptions({
      connection: chatConnection,
      tools: webmcpClientTools,
      persistence: chatPersistence,
      threadId: documentId,
    }),
    [documentId],
  )
  const { messages, sendMessage, isLoading, error, stop, clear } = useChat(chatOptions)
  const [draft, setDraft] = useState('')
  const [overWebmcp, setOverWebmcp] = useState(true)
  const [clearOpen, setClearOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Read once mounted: `document.modelContext` only exists in the browser, and
  // only when the reader is running Chrome with the WebMCP flag on.
  useEffect(() => setOverWebmcp(canExecuteOverWebmcp()), [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [messages, isLoading])

  const send = (content: string) => {
    if (!content || isLoading) return
    setDraft('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    void sendMessage(content)
  }

  return (
    <aside
      className="flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-line bg-paper"
      aria-label="Chat with Mimir"
      aria-hidden={!open}
      inert={!open ? true : undefined}
    >
      <div className="flex h-full min-h-0 w-full max-w-[352px] min-w-0 flex-1 flex-col max-[820px]:max-w-none">
        <header className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-line px-3">
          <span
            className="grid size-[27px] shrink-0 place-items-center rounded-[9px] border border-[oklch(.9_.02_85)] bg-[linear-gradient(180deg,var(--color-paper),var(--color-cream))] text-bark shadow-lift"
            aria-hidden="true"
          >
            <BotIcon size={15} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <strong className="font-display text-[13px] leading-none font-[620] tracking-[-.02em]">Ask Mimir</strong>
            <span className="flex items-center gap-[5px] text-[10px] leading-none text-faint">
              <i
                className={cn(
                  'size-[5px] rounded-full bg-faint',
                  overWebmcp && 'bg-moss shadow-[0_0_0_2.5px_oklch(.52_.075_155/.16)]',
                )}
                aria-hidden="true"
              />
              {overWebmcp ? 'reading with you over WebMCP' : 'reading with you'}
            </span>
          </span>
          {messages.length > 0 && <IconButton label="Clear" icon={TrashIcon} size={15} onClick={() => setClearOpen(true)} />}
          <IconButton label="Close chat" icon={XIcon} size={16} onClick={onClose} />
        </header>

        <div className="relative min-h-0 flex-1">
          <div ref={scrollRef} className="scroll-slim h-full overflow-y-auto px-3 py-3.5">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col justify-center gap-3 px-1">
                <div className="flex flex-col gap-2 text-xs text-muted">
                  <strong className="font-display text-[17px] font-[620] tracking-[-.03em] text-ink">
                    Read this PDF together.
                  </strong>
                  <p className="m-0 leading-[1.55]">
                    Ask about the document and Mimir works through the same tools a browser agent
                    gets — searching the text, jumping to pages, and marking passages up.
                  </p>
                </div>
                <div className="mt-1 flex flex-col gap-1.5">
                  {openers.map(({ icon: Icon, label }) => (
                    <button
                      key={label}
                      type="button"
                      className="group flex items-center gap-2 rounded-xl border border-line bg-[linear-gradient(180deg,var(--color-paper),var(--color-surface))] py-[9px] pr-2 pl-2.5 text-left text-[11.5px] text-ink-soft shadow-lift transition-[transform,border-color,box-shadow] duration-160 ease-spring hover:-translate-y-px hover:border-line-strong hover:text-ink hover:shadow-[0_2px_2px_oklch(.2_.005_60/.06),0_8px_16px_oklch(.28_.02_70/.1)] active:translate-y-0"
                      onClick={() => send(label)}
                    >
                      <span className="text-clay" aria-hidden="true">
                        <Icon size={14} />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                      <span
                        className="text-faint opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                        aria-hidden="true"
                      >
                        <ArrowUpRightIcon size={13} />
                      </span>
                    </button>
                  ))}
                </div>
                {!overWebmcp && (
                  <p className="m-0 rounded-xl border border-line bg-surface p-2.5 text-xs leading-[1.5] text-ink-soft">
                    This browser has no WebMCP, so tools run directly in the page instead of through
                    <code className="mx-1 font-mono text-[10.5px]">document.modelContext</code>. Chat
                    works the same; it just isn’t exercising the agent surface.
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      'flex animate-message-in flex-col gap-1.5',
                      message.role === 'user' && 'items-end',
                    )}
                  >
                    {message.role === 'assistant' && (
                      <span className="flex items-center gap-[5px] pl-px font-display text-[10.5px] font-[560] tracking-[.02em] text-faint">
                        <BotIcon size={11} />
                        mimir
                      </span>
                    )}
                    {toBlocks(message.parts).map((block) =>
                      block.kind === 'tools' ? (
                        <ToolTrail key={block.key} calls={block.calls} />
                      ) : // Only the assistant writes markdown. What the reader typed is
                      // shown back exactly as typed — running it through a parser
                      // would eat their underscores and asterisks and change their
                      // own words.
                      message.role === 'user' ? (
                        <p
                          key={block.key}
                          className="m-0 max-w-[88%] rounded-2xl rounded-br-[7px] border border-line bg-[linear-gradient(180deg,var(--color-paper),var(--color-surface))] px-3 py-2 text-xs leading-[1.6] whitespace-pre-wrap text-ink shadow-lift"
                        >
                          {block.content}
                        </p>
                      ) : (
                        <ChatMarkdown key={block.key} content={block.content} />
                      ),
                    )}
                    {message.createdAt && (
                      <time
                        dateTime={message.createdAt.toISOString()}
                        className={cn(
                          'mt-0.5 pl-px text-[10px] leading-none text-faint',
                          message.role === 'user' && 'self-end pr-1',
                        )}
                      >
                        {formatMessageTime(message.createdAt)}
                      </time>
                    )}
                  </div>
                ))}
                {isLoading && (
                  <div className="flex animate-message-in items-center gap-2 text-[11px] text-muted">
                    <span className="relative grid size-[22px] shrink-0 place-items-center" aria-hidden="true">
                      <span className="absolute inset-0 animate-ping-soft rounded-full bg-clay/18" />
                      <span className="size-[7px] rounded-full bg-clay" />
                    </span>
                    <ThinkingState />
                  </div>
                )}
              </div>
            )}

            {error && (
              <p className="m-0 mt-3 flex items-start gap-2 rounded-xl border border-danger/35 bg-[oklch(.975_.014_28)] p-2.5 text-[11px] leading-[1.5] text-danger">
                <span className="mt-px shrink-0" aria-hidden="true">
                  <ZapIcon size={13} />
                </span>
                {error.message}
              </p>
            )}
          </div>
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-5 bg-[linear-gradient(180deg,var(--color-paper),transparent)]"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-[linear-gradient(0deg,var(--color-paper),transparent)]"
            aria-hidden="true"
          />
        </div>

        <div className="shrink-0 border-t border-line p-2.5">
          <div className="flex items-end gap-1.5 rounded-2xl border border-line bg-[linear-gradient(180deg,var(--color-surface),var(--color-paper))] p-1.5 shadow-[inset_0_1px_0_var(--color-paper)] transition-[border-color,box-shadow] duration-160 ease-out focus-within:border-line-strong focus-within:shadow-[inset_0_1px_0_var(--color-paper),0_0_0_3px_oklch(.2_.008_60/.05)]">
            <textarea
              ref={inputRef}
              className="max-h-32 min-h-[30px] flex-1 resize-none border-0 bg-transparent px-1.5 py-1 text-xs leading-[1.5] text-ink outline-none placeholder:text-faint focus-visible:outline-none"
              rows={1}
              placeholder="Ask about this document…"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value)
                event.target.style.height = 'auto'
                event.target.style.height = `${Math.min(event.target.scrollHeight, 128)}px`
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  send(draft.trim())
                }
              }}
            />
            {isLoading ? (
              <button
                type="button"
                className="grid size-[30px] shrink-0 place-items-center rounded-[10px] bg-[linear-gradient(180deg,oklch(.335_.014_62),oklch(.185_.008_60))] text-paper shadow-[inset_0_1px_0_oklch(1_0_0/.2),0_1px_2px_oklch(.2_.01_60/.25)] transition-transform duration-130 ease-spring active:scale-90"
                aria-label="Stop generating"
                onClick={() => stop()}
              >
                <span className="size-2.5 rounded-[3px] bg-paper" />
              </button>
            ) : (
              <button
                type="button"
                className="grid size-[30px] shrink-0 place-items-center rounded-[10px] bg-[linear-gradient(180deg,oklch(.335_.014_62),oklch(.185_.008_60))] text-paper shadow-[inset_0_1px_0_oklch(1_0_0/.2),0_1px_2px_oklch(.2_.01_60/.25)] transition-[transform,background,box-shadow] duration-130 ease-spring active:scale-90 disabled:bg-none disabled:bg-sunken disabled:text-faint disabled:shadow-none"
                aria-label="Send message"
                disabled={!draft.trim()}
                onClick={() => send(draft.trim())}
              >
                <ArrowUpRightIcon size={15} />
              </button>
            )}
          </div>
          <p
            className={cn(
              'm-0 h-0 overflow-hidden pl-1 text-[10px] text-faint transition-[height,opacity] duration-160 ease-out',
              draft.trim() ? 'h-[22px] pt-1.5 opacity-100' : 'opacity-0',
            )}
            aria-hidden="true"
          >
            <Kbd>Enter</Kbd> to send ·{' '}
            <KbdGroup>
              <Kbd>Shift</Kbd>
              <Kbd>Enter</Kbd>
            </KbdGroup>{' '}
            for a new line
          </p>
        </div>
      </div>

      <Dialog.Root open={clearOpen} onOpenChange={setClearOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className={dialogOverlayClass} />
          <Dialog.Content
            className={cn(dialogSurfaceClass, 'w-[min(430px,calc(100vw-32px))] p-[25px]')}
            aria-describedby="clear-chat-description"
          >
            <div className="flex items-start gap-[13px]">
              <span className="mt-px grid size-10 shrink-0 place-items-center rounded-xl border border-[oklch(.86_.05_28)] bg-[oklch(.975_.014_28)] text-danger" aria-hidden="true">
                <TrashIcon size={18} />
              </span>
              <div>
                <Dialog.Title className="m-0 font-display text-[22px] font-[620] tracking-[-.03em]">
                  Delete this chat?
                </Dialog.Title>
                <Dialog.Description className="mt-[7px] mb-0 text-[12.5px] leading-normal text-muted" id="clear-chat-description">
                  This conversation with Mimir will be permanently removed from this browser.
                </Dialog.Description>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-2 max-[600px]:[&>button]:min-w-0 max-[600px]:[&>button]:flex-1">
              <Dialog.Close asChild>
                <Button tone="paper">Keep chat</Button>
              </Dialog.Close>
              <Button
                tone="danger"
                onClick={() => {
                  clear()
                  setClearOpen(false)
                }}
              >
                <TrashIcon size={15} /> Delete chat
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </aside>
  )
}
