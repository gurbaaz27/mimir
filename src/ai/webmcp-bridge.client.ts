import '@tanstack/react-start/client-only'
import { getLocalTool, isToolFailure, listLocalTools } from '#/lib/webmcp.client'

/** One entry of the catalogue handed to the model by `list_webmcp_tools`. */
export interface WebmcpToolSummary {
  name: string
  title: string
  description: string
  inputSchema: object | null
  readOnly: boolean
}

/** How a call actually reached the tool, so the UI can say which path ran. */
export type WebmcpTransport = 'webmcp' | 'in-page'

export interface WebmcpToolResult {
  transport: WebmcpTransport
  result: unknown
}

function modelContext() {
  return typeof document === 'undefined' ? undefined : document.modelContext
}

/** True when the browser can both publish and invoke tools over WebMCP. */
export function canExecuteOverWebmcp() {
  return typeof modelContext()?.executeTool === 'function'
}

function summarise(tool: WebMCP.RegisteredTool | WebMCP.ModelContextTool): WebmcpToolSummary {
  return {
    name: tool.name,
    title: tool.title ?? tool.name,
    description: tool.description,
    inputSchema: (tool.inputSchema as object | undefined) ?? null,
    readOnly: tool.annotations?.readOnlyHint === true,
  }
}

/**
 * The tools the model may call. WebMCP is asked first because it is the real
 * registry — it knows about tools this module never built, including any the
 * browser exposes from another document of the site.
 */
export async function listWebmcpTools(): Promise<WebmcpToolSummary[]> {
  const context = modelContext()
  if (context) {
    try {
      const registered = await context.getTools()
      if (registered.length) return registered.map(summarise)
    } catch {
      // A browser that rejects the query still has our own definitions below.
    }
  }
  return listLocalTools().map(summarise)
}

/**
 * Tools report failure as data, because WebMCP discards a thrown error's
 * message. Turn it back into a rejection here, on our side of that boundary,
 * where the sentence survives and the model can act on it.
 */
function unwrap(result: unknown) {
  if (isToolFailure(result)) throw new Error(result.error)
  // A tool reached over WebMCP returns its payload as a JSON string.
  if (typeof result === 'string') {
    try {
      const parsed: unknown = JSON.parse(result)
      if (isToolFailure(parsed)) throw new Error(parsed.error)
      return parsed
    } catch (error) {
      if (error instanceof Error && !(error instanceof SyntaxError)) throw error
      return result
    }
  }
  return result
}

/**
 * Run one tool by name.
 *
 * `document.modelContext.executeTool` is the path that matters: it is how a
 * real agent reaches these tools, so the sidebar exercising it keeps the two
 * honest with each other. When the browser has no WebMCP the call falls back to
 * the definition this same document registered, which is the identical closure
 * WebMCP would have invoked — the chat keeps working without the flag, it just
 * stops proving anything about the WebMCP surface.
 */
export async function executeWebmcpTool(
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<WebmcpToolResult> {
  const context = modelContext()

  if (context?.executeTool) {
    const registered = await context.getTools()
    const match = registered.find((tool) => tool.name === name)
    if (match) {
      // The spec passes arguments as a JSON string, the way an agent sends them.
      const result = await context.executeTool(match, JSON.stringify(args ?? {}), { signal })
      return { transport: 'webmcp', result: unwrap(result) }
    }
  }

  const local = getLocalTool(name)
  if (!local) {
    const available = (await listWebmcpTools()).map((tool) => tool.name)
    throw new Error(
      available.length
        ? `No tool named "${name}" is available on this page. Available tools: ${available.join(', ')}.`
        : `No tool named "${name}" is available, and this page is exposing no tools at all — the document may still be loading.`,
    )
  }

  const result = await local.execute(args ?? {}, { signal: signal ?? new AbortController().signal })
  return { transport: 'in-page', result: unwrap(result) }
}
