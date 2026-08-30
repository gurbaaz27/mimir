import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRightIcon, BookTextIcon, ChevronDownIcon } from '#/components/icons'
import { cn } from '#/lib/utils'
import { getWebMcpTools, useWebMcp, type WebMcpStatus } from '#/lib/webmcp.client'

type AgentStatusProps = {
  documentId: string | null
  variant?: 'library' | 'reader'
}

const statusLabel: Record<WebMcpStatus, string> = {
  available: 'Agent Ready',
  registering: 'Connecting',
  unavailable: 'WebMCP Unavailable',
}

const statusTitle: Record<WebMcpStatus, string> = {
  available: 'WebMCP tools are available to browser agents',
  registering: 'Connecting to WebMCP',
  unavailable: 'WebMCP is unavailable in this browser',
}

export function AgentStatus({ documentId, variant = 'reader' }: AgentStatusProps) {
  const navigate = useNavigate()
  // Agents open documents through the same route the reader uses, so the URL
  // stays truthful about what is on screen.
  const openDocumentPath = useCallback(
    (pathSegment: string) => navigate({ to: '/$pdfName', params: { pdfName: pathSegment } }),
    [navigate],
  )
  const status = useWebMcp(documentId, openDocumentPath)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [toolListOpen, setToolListOpen] = useState(false)
  const [expandedTool, setExpandedTool] = useState<string | null>(null)
  const [schemaOpen, setSchemaOpen] = useState<string | null>(null)
  const tools = useMemo(() => getWebMcpTools(documentId), [documentId])
  const hasTools = status === 'available'
  const readCount = tools.filter((tool) => tool.readOnly).length
  const writeCount = tools.length - readCount

  useEffect(() => {
    if (!hasTools) {
      setToolsOpen(false)
      return
    }
    setToolListOpen(false)
    setExpandedTool(null)
    setSchemaOpen(null)
  }, [documentId, hasTools])

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => hasTools && setToolsOpen(true)}
      onMouseLeave={() => setToolsOpen(false)}
    >
      <button
        className={cn(
          `relative inline-flex h-[30px] items-center gap-[7px] rounded-full border border-line-strong bg-[linear-gradient(180deg,var(--color-paper),var(--color-surface))] pr-[13px] pl-[11px] text-[11px] font-[520] text-ink-soft shadow-[inset_0_1px_0_var(--color-paper),inset_0_0_0_1px_oklch(.2_.005_60/.04),0_1px_1px_oklch(.2_.005_60/.1),0_4px_9px_oklch(.28_.03_70/.08)] transition-[background,border-color,box-shadow,transform] duration-160 ease-spring after:pointer-events-none after:absolute after:inset-x-px after:top-px after:h-[45%] after:rounded-[999px_999px_40%_40%/999px_999px_100%_100%] after:bg-[linear-gradient(180deg,oklch(1_0_0/.7),transparent)] after:content-[''] hover:-translate-y-px hover:bg-[linear-gradient(180deg,var(--color-paper),var(--color-sunken))] hover:shadow-[inset_0_1px_0_var(--color-paper),inset_0_0_0_1px_oklch(.2_.005_60/.04),0_2px_2px_oklch(.2_.005_60/.1),0_7px_14px_oklch(.28_.03_70/.1)] [&_i]:size-[5px] [&_i]:rounded-full [&_i]:bg-faint`,
          variant === 'reader' && 'mr-2 max-[1100px]:mr-2 max-[1100px]:w-[30px] max-[1100px]:justify-center max-[1100px]:gap-0 max-[1100px]:p-0 max-[1100px]:text-[0px]',
          variant === 'library' && 'max-[600px]:h-7 max-[600px]:gap-[5px] max-[600px]:px-2 max-[600px]:text-[10px]',
          status === 'available' && '[&_i]:bg-moss [&_i]:shadow-[0_0_0_3px_oklch(.52_.075_155/.16)]',
        )}
        type="button"
        title={statusTitle[status]}
        aria-haspopup={hasTools ? 'true' : undefined}
        aria-expanded={hasTools ? toolsOpen : undefined}
        onClick={() => hasTools && setToolsOpen(true)}
        onFocus={() => hasTools && setToolsOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setToolsOpen(false)
            event.currentTarget.blur()
          }
        }}
        onBlur={(event) => {
          if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null)) setToolsOpen(false)
        }}
      >
        <i aria-hidden="true" />
        {statusLabel[status]}
      </button>
      {hasTools && toolsOpen && (
        <div className={cn(
          'absolute top-full right-0 z-30 max-h-[min(620px,calc(100dvh-68px))] w-[min(370px,calc(100vw-24px))] overflow-auto rounded-[15px] border border-[oklch(1_0_0/.08)] bg-[oklch(.28_.006_60/.97)] px-2.5 pt-3 pb-2.5 text-[11px] text-[oklch(.97_0_0)] shadow-[0_18px_42px_oklch(.12_.01_60/.3),0_2px_7px_oklch(.12_.01_60/.2)] backdrop-blur-[14px]',
          'max-[600px]:fixed max-[600px]:right-3 max-[600px]:left-3 max-[600px]:w-auto',
          variant === 'library' ? 'max-[600px]:top-[62px] max-[600px]:max-h-[calc(100dvh-74px)]' : 'max-[600px]:top-[42px] max-[600px]:max-h-[calc(100dvh-54px)]',
        )} role="dialog" aria-label={`Available site tools (${tools.length})`}>
          <button
            className="flex w-full items-start justify-between gap-3.5 border-0 bg-transparent px-2.5 pt-1 pb-3.5 text-left text-inherit hover:bg-[oklch(1_0_0/.06)] [&>span]:grid [&>span]:gap-[3px] [&_strong]:text-sm [&_strong]:leading-[1.2] [&_strong]:font-[450] [&_strong]:tracking-[-.01em] [&_small]:text-[11px] [&_small]:leading-tight [&_small]:text-[oklch(.72_0_0)] [&>svg]:shrink-0 [&>svg]:text-[oklch(.7_0_0)] [&>svg]:transition-transform [&>svg]:duration-160"
            type="button"
            aria-expanded={toolListOpen}
            onClick={() => setToolListOpen((open) => !open)}
          >
            <span>
              <strong>Available site tools ({tools.length})</strong>
              <small>{readCount} read, {writeCount} write tools</small>
            </span>
            <ChevronDownIcon className={cn(!toolListOpen && '-rotate-90')} size={19} />
          </button>
          {toolListOpen && (
            <div className="grid gap-[3px]">
              {tools.map((tool) => {
                const expanded = expandedTool === tool.name
                const schemaExpanded = schemaOpen === tool.name
                return (
                  <section className="rounded-[10px]" key={tool.name}>
                    <button
                      className="flex min-h-[42px] w-full items-center justify-between gap-3.5 rounded-[9px] border-0 bg-transparent px-2.5 py-[7px] text-left text-inherit hover:bg-[oklch(1_0_0/.06)] [&_strong]:text-sm [&_strong]:leading-tight [&_strong]:font-[450] [&_strong]:tracking-[-.01em] [&>svg]:shrink-0 [&>svg]:text-[oklch(.7_0_0)] [&>svg]:transition-transform [&>svg]:duration-160 max-[600px]:[&_strong]:text-[13px]"
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => {
                        setExpandedTool(expanded ? null : tool.name)
                        setSchemaOpen(null)
                      }}
                    >
                      <strong>{tool.title}</strong>
                      <ChevronDownIcon className={cn(!expanded && '-rotate-90')} size={18} />
                    </button>
                    {expanded && (
                      <div className="px-2.5 pb-2.5 text-[oklch(.7_0_0)]">
                        <div className="mt-[3px] mb-[13px] flex items-center gap-[7px] text-xs [&_svg]:text-[oklch(.67_0_0)]"><BookTextIcon size={18} /><span>{tool.name}</span></div>
                        <div className="mt-3">
                          <span className="inline-flex items-center gap-1.5 text-xs text-[oklch(.72_0_0)] [&_svg]:text-[oklch(.68_0_0)]">Description <ChevronDownIcon size={14} /></span>
                          <p className="mt-2 mb-0 rounded-[10px] bg-[oklch(1_0_0/.08)] p-3 text-xs leading-[1.45] text-[oklch(.72_0_0)]">{tool.description}</p>
                        </div>
                        <div className="mt-3">
                          <button
                            className="inline-flex w-full items-center justify-start gap-1.5 border-0 bg-transparent p-0 text-left text-xs text-[oklch(.72_0_0)] [&_svg]:text-[oklch(.68_0_0)] [&_svg]:transition-transform [&_svg]:duration-160"
                            type="button"
                            aria-expanded={schemaExpanded}
                            onClick={() => setSchemaOpen(schemaExpanded ? null : tool.name)}
                          >
                            Input schema <ArrowRightIcon className={cn(schemaExpanded && 'rotate-90')} size={14} />
                          </button>
                          {schemaExpanded && <pre className="mt-2.5 mb-0 max-w-full overflow-auto whitespace-pre-wrap rounded-[10px] bg-[oklch(0_0_0/.18)] p-3 font-mono text-[11px] leading-[1.45] text-[oklch(.78_0_0)]">{JSON.stringify(tool.inputSchema, null, 2)}</pre>}
                        </div>
                      </div>
                    )}
                  </section>
                )
              })}
            </div>
          )}
        </div>
      )}
    </span>
  )
}
