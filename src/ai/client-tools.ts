import '@tanstack/react-start/client-only'
import { canExecuteOverWebmcp, executeWebmcpTool, listWebmcpTools } from './webmcp-bridge.client'
import { listWebmcpToolsDef, runWebmcpToolDef } from './tools'

/**
 * Browser-side implementations of the two definitions the server hands to the
 * model. The server never sees a PDF: the document, its annotations and the
 * WebMCP registry all live in this tab, so both tools resolve here.
 */

export const listWebmcpToolsClient = listWebmcpToolsDef.client(async () => {
  const tools = await listWebmcpTools()
  return {
    tools,
    total: tools.length,
    transport: canExecuteOverWebmcp() ? 'webmcp' : 'in-page',
    note: tools.length
      ? null
      : 'This page is exposing no tools yet. It is most likely still opening a document — say so rather than guessing tool names.',
  }
})

export const runWebmcpToolClient = runWebmcpToolDef.client(async (input, context) => {
  const { transport, result } = await executeWebmcpTool(input.title, input.args ?? {}, context?.abortSignal)
  return { tool: input.title, transport, result }
})

export const webmcpClientTools = [listWebmcpToolsClient, runWebmcpToolClient]
