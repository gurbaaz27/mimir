import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchServerSentEvents, createChatClientOptions } from '@tanstack/ai-client'
import { useChat } from '@tanstack/ai-react'
import { LoaderCircle } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { ArrowUpRightIcon, BotIcon, TrashIcon, XIcon, ZapIcon } from '#/components/icons'
import { ChatMarkdown } from './chat-markdown'
import { webmcpClientTools } from '#/ai/client-tools'
import { canExecuteOverWebmcp } from '#/ai/webmcp-bridge.client'
import { chatPersistence } from '#/lib/db.client'
import { cn } from '#/lib/utils'
import { Button, IconButton, dialogOverlayClass, dialogSurfaceClass } from './ui'

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

/**
 * One line per tool call. The model reaches everything through two wrapper
 * tools, so showing "run_webmcp_tool" would tell the reader nothing — the name
 * that matters is the page tool inside it.
 */
function ToolCallRow({
  name,
  detail,
  state,
}: {
  name: string
  detail: string | null
  state: string
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-[7px] rounded-lg border border-line bg-surface px-2.5 py-[7px] text-[11px] text-ink-soft',
        state === 'error' && 'border-danger/40 text-danger',
      )}
    >
      {state === 'complete' || state === 'error' ? (
        <ZapIcon size={13} />
      ) : (
        <LoaderCircle className="size-[13px] shrink-0 animate-spin-slow" />
      )}
      <span className="min-w-0 flex-1 truncate">
        <code className="font-mono text-[10.5px] text-ink">{name}</code>
        {detail && <span className="ml-1.5 text-muted">{detail}</span>}
      </span>
      <span className="shrink-0 text-[10px] text-muted">{stateLabel[state] ?? state}</span>
    </div>
  )
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

  const submit = () => {
    const content = draft.trim()
    if (!content || isLoading) return
    setDraft('')
    void sendMessage(content)
  }

  return (
    <aside
      className="flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-line bg-paper"
      aria-label="Chat with Mimir"
      aria-hidden={!open}
      inert={!open ? true : undefined}
    >
      <div className="flex h-full min-h-0 w-[352px] max-w-full min-w-0 flex-1 flex-col">
        <header className="flex h-[46px] shrink-0 items-center gap-2 border-b border-line px-3">
          <BotIcon size={16} />
          <strong className="flex-1 font-display text-[13px] font-[600] tracking-[-.02em]">Ask Mimir</strong>
          {messages.length > 0 && (
            <button
              type="button"
              className="rounded-md px-2 py-1 text-[11px] text-muted transition-colors hover:bg-sunken hover:text-ink"
              onClick={() => setClearOpen(true)}
            >
              Clear
            </button>
          )}
          <IconButton label="Close chat" icon={XIcon} size={16} onClick={onClose} />
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3.5">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col justify-center gap-2 px-1 text-xs text-muted">
              <strong className="font-display text-[15px] font-[600] tracking-[-.02em] text-ink">
                Read this PDF together.
              </strong>
              <p className="m-0 leading-[1.55]">
                Ask about the document and Mimir works through the same tools a browser agent
                gets — searching the text, jumping to pages, and marking passages up.
              </p>
              {!overWebmcp && (
                <p className="m-0 rounded-lg border border-line bg-surface p-2.5 leading-[1.5] text-ink-soft">
                  This browser has no WebMCP, so tools run directly in the page instead of through
                  <code className="mx-1 font-mono text-[10.5px]">document.modelContext</code>. Chat
                  works the same; it just isn’t exercising the agent surface.
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn('flex flex-col gap-1.5', message.role === 'user' && 'items-end')}
                >
                  {message.parts.map((part, index) => {
                    if (part.type === 'text') {
                      // Only the assistant writes markdown. What the reader
                      // typed is shown back exactly as typed — running it
                      // through a parser would eat their underscores and
                      // asterisks and change their own words.
                      return message.role === 'user' ? (
                        <p
                          key={index}
                          className="m-0 max-w-full rounded-xl rounded-br-[5px] bg-sunken px-3 py-2 text-xs leading-[1.6] whitespace-pre-wrap text-ink"
                        >
                          {part.content}
                        </p>
                      ) : (
                        <ChatMarkdown key={index} content={part.content} />
                      )
                    }
                    if (part.type === 'tool-call') {
                      // `run_webmcp_tool` is a wrapper; the reader cares which
                      // page tool it is actually driving.
                      const inner =
                        part.name === 'run_webmcp_tool' ? (part.input?.title ?? null) : null
                      return (
                        <ToolCallRow
                          key={part.id}
                          name={inner ?? part.name}
                          detail={inner ? null : 'reading available tools'}
                          state={part.state}
                        />
                      )
                    }
                    return null
                  })}
                </div>
              ))}
              {isLoading && (
                <div className="flex items-center gap-2 text-[11px] text-muted">
                  <LoaderCircle className="size-3.5 animate-spin-slow" /> Thinking…
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="mt-3 m-0 rounded-lg border border-danger/40 bg-[oklch(.97_.02_28)] p-2.5 text-[11px] leading-[1.5] text-danger">
              {error.message}
            </p>
          )}
        </div>

        <div className="shrink-0 border-t border-line p-2.5">
          <div className="flex items-end gap-1.5 rounded-xl border border-line bg-surface p-1.5 focus-within:border-line-strong">
            <textarea
              ref={inputRef}
              className="max-h-32 min-h-[30px] flex-1 resize-none border-0 bg-transparent px-1.5 py-1 text-xs leading-[1.5] text-ink outline-none placeholder:text-faint"
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
                  submit()
                }
              }}
            />
            {isLoading ? (
              <button
                type="button"
                className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-ink text-paper transition-transform duration-130 ease-spring active:scale-90"
                aria-label="Stop generating"
                onClick={() => stop()}
              >
                <span className="size-2.5 rounded-[3px] bg-paper" />
              </button>
            ) : (
              <button
                type="button"
                className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-ink text-paper transition-transform duration-130 ease-spring active:scale-90 disabled:bg-line disabled:text-faint"
                aria-label="Send message"
                disabled={!draft.trim()}
                onClick={submit}
              >
                <ArrowUpRightIcon size={15} />
              </button>
            )}
          </div>
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
