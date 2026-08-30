import { describe, expect, it } from 'vitest'
import type { CompactionContext } from '@tanstack/ai-compaction'
import type { ModelMessage, ToolCall } from '@tanstack/ai'
import {
  CHAT_COMPACTION_KEEP_RECENT_TOKENS,
  CHAT_COMPACTION_KEEP_RECENT_TOOL_RESULTS,
  CHAT_COMPACTION_MAX_TOKENS,
  chatCompactionMiddleware,
  chatCompactionStrategy,
} from './chat-compaction'

const CLEARED_TOOL_OUTPUT = '[tool output cleared to save context]'

const estimate: CompactionContext['estimate'] = (message) => {
  if (message.content === CLEARED_TOOL_OUTPUT) return 10
  if (typeof message.content === 'string' && message.content.startsWith('OLD_')) {
    return 20_000
  }
  if (message.role === 'tool') return 14_000
  return 100
}

const assistantCall = (id: string): ModelMessage => {
  const call: ToolCall = {
    id,
    type: 'function',
    function: { name: 'run_webmcp_tool', arguments: '{}' },
  }

  return { role: 'assistant', content: '', toolCalls: [call] }
}

const toolResult = (id: string): ModelMessage => ({
  role: 'tool',
  content: `full result ${id}`,
  toolCallId: id,
})

const toolHistory = (): Array<ModelMessage> =>
  Array.from({ length: 14 }, (_, index) => {
    const id = `tool-${index}`
    return [assistantCall(id), toolResult(id)]
  }).flat()

const compact = (messages: Array<ModelMessage>) =>
  chatCompactionStrategy(messages, {
    maxTokens: CHAT_COMPACTION_MAX_TOKENS,
    estimate,
  })

describe('chat compaction', () => {
  it('uses the configured request budget', () => {
    expect(CHAT_COMPACTION_MAX_TOKENS).toBe(180_000)
    expect(CHAT_COMPACTION_KEEP_RECENT_TOOL_RESULTS).toBe(12)
    expect(CHAT_COMPACTION_KEEP_RECENT_TOKENS).toBe(100_000)
    expect(chatCompactionMiddleware.name).toBe('compaction')
  })

  it('clears old tool output while preserving the 12 most recent results', async () => {
    const messages: Array<ModelMessage> = [
      { role: 'user', content: 'HEAD_MARKER' },
      ...toolHistory(),
    ]

    const compacted = await compact(messages)
    const results = compacted?.filter((message) => message.role === 'tool')

    expect(compacted).toHaveLength(messages.length)
    expect(compacted?.[0]?.content).toBe('HEAD_MARKER')
    expect(results).toHaveLength(14)
    expect(results?.slice(0, 2).map((message) => message.content)).toEqual([
      CLEARED_TOOL_OUTPUT,
      CLEARED_TOOL_OUTPUT,
    ])
    expect(
      results?.slice(-12).every((message) => message.content !== CLEARED_TOOL_OUTPUT),
    ).toBe(true)
  })

  it('evicts the oldest messages when clearing tool output is insufficient', async () => {
    const messages: Array<ModelMessage> = [
      { role: 'user', content: 'OLD_HEAD_MARKER' },
      { role: 'assistant', content: 'OLD_CONTEXT' },
      ...toolHistory(),
    ]

    const compacted = await compact(messages)

    expect(compacted?.[0]?.content).toContain('omitted')
    expect(
      compacted?.some((message) => message.content === 'OLD_HEAD_MARKER'),
    ).toBe(false)
    expect(compacted?.[1]?.role).not.toBe('tool')
  })
})
