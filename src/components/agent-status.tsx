import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRightIcon, BookTextIcon, ChevronDownIcon } from '#/components/icons'
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
      className={`agent-status-menu ${variant}`}
      onMouseEnter={() => hasTools && setToolsOpen(true)}
      onMouseLeave={() => setToolsOpen(false)}
    >
      <button
        className={`agent-status ${variant} ${status}`}
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
        <div className="agent-tools-menu" role="dialog" aria-label={`Available site tools (${tools.length})`}>
          <button
            className="agent-tools-summary"
            type="button"
            aria-expanded={toolListOpen}
            onClick={() => setToolListOpen((open) => !open)}
          >
            <span>
              <strong>Available site tools ({tools.length})</strong>
              <small>{readCount} read, {writeCount} write tools</small>
            </span>
            <ChevronDownIcon className={toolListOpen ? '' : 'is-collapsed'} size={19} />
          </button>
          {toolListOpen && (
            <div className="agent-tools-list">
              {tools.map((tool) => {
                const expanded = expandedTool === tool.name
                const schemaExpanded = schemaOpen === tool.name
                return (
                  <section className={`agent-tool ${expanded ? 'is-expanded' : ''}`} key={tool.name}>
                    <div className="agent-tool-trigger">
                      <strong>{tool.title}</strong>
                      <button
                        className="agent-tool-toggle"
                        type="button"
                        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${tool.title}`}
                        aria-expanded={expanded}
                        onClick={() => {
                          setExpandedTool(expanded ? null : tool.name)
                          setSchemaOpen(null)
                        }}
                      >
                        <ChevronDownIcon className={expanded ? '' : 'is-collapsed'} size={18} />
                      </button>
                    </div>
                    {expanded && (
                      <div className="agent-tool-details">
                        <div className="agent-tool-name"><BookTextIcon size={18} /><span>{tool.name}</span></div>
                        <div className="agent-tool-section">
                          <span className="agent-tool-section-label">Description <ChevronDownIcon size={14} /></span>
                          <p>{tool.description}</p>
                        </div>
                        <div className="agent-tool-section">
                          <button
                            className="agent-tool-section-label is-button"
                            type="button"
                            aria-expanded={schemaExpanded}
                            onClick={() => setSchemaOpen(schemaExpanded ? null : tool.name)}
                          >
                            Input schema <ArrowRightIcon className={schemaExpanded ? 'is-expanded' : ''} size={14} />
                          </button>
                          {schemaExpanded && <pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre>}
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
