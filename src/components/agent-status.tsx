import { useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useWebMcp, type WebMcpStatus } from '#/lib/webmcp.client'

type AgentStatusProps = {
  documentId: string | null
  variant?: 'library' | 'reader'
}

const statusLabel: Record<WebMcpStatus, string> = {
  available: 'Agent Ready',
  registering: 'Connecting',
  unavailable: 'No Agent',
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

  return (
    <span className={`agent-status ${variant} ${status}`} title={statusTitle[status]}>
      <i aria-hidden="true" />
      {statusLabel[status]}
    </span>
  )
}
