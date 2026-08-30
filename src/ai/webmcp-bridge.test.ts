// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { executeWebmcpTool, listWebmcpTools } from './webmcp-bridge.client'

const registered = {
  name: 'search_document',
  title: 'Search the document',
  description: 'Find text',
  inputSchema: { type: 'object' },
  annotations: { readOnlyHint: true },
} as unknown as WebMCP.RegisteredTool

function installModelContext(overrides: Partial<WebMCP.ModelContext>) {
  Object.defineProperty(document, 'modelContext', {
    configurable: true,
    value: { getTools: async () => [registered], ...overrides },
  })
}

describe('webmcp bridge', () => {
  beforeEach(() => {
    Reflect.deleteProperty(document, 'modelContext')
  })

  it('lists tools from WebMCP when the browser exposes it', async () => {
    installModelContext({})
    await expect(listWebmcpTools()).resolves.toEqual([
      {
        name: 'search_document',
        title: 'Search the document',
        description: 'Find text',
        inputSchema: { type: 'object' },
        readOnly: true,
      },
    ])
  })

  it('settles rather than hanging when the page exposes nothing at all', async () => {
    await expect(listWebmcpTools()).resolves.toEqual([])
  })

  it('passes args to executeTool as a JSON string, per the spec', async () => {
    const executeTool = vi.fn(async (_tool: WebMCP.RegisteredTool, _input: string) => ({ results: [] }))
    installModelContext({ executeTool: executeTool as never })

    const result = await executeWebmcpTool('search_document', { query: 'hello' })

    expect(executeTool).toHaveBeenCalledTimes(1)
    expect(executeTool.mock.calls[0][1]).toBe('{"query":"hello"}')
    expect(result).toEqual({ transport: 'webmcp', result: { results: [] } })
  })

  it('rejects with the available names when the tool is unknown', async () => {
    installModelContext({ executeTool: (async () => null) as never })
    await expect(executeWebmcpTool('nope', {})).rejects.toThrow(/Available tools: search_document/)
  })
})
