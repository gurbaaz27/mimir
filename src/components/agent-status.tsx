import { useWebMcp, type WebMcpStatus } from '#/lib/webmcp.client'

type AgentStatusProps = {
  documentId: string | null
  variant?: 'library' | 'reader'
}

function statusTitle(status: WebMcpStatus) {
  if (status === 'available') return 'WebMCP tools are available to browser agents'
  if (status === 'registering') return 'Connecting to WebMCP'
  return 'WebMCP is unavailable in this browser'
}

export function AgentStatus({ documentId, variant = 'reader' }: AgentStatusProps) {
  const status = useWebMcp(documentId)

  return (
    <span className={`agent-status ${variant} ${status}`} title={statusTitle(status)}>
      <i aria-hidden="true" />
      Agent Ready
    </span>
  )
}
