import {
  clearToolResults,
  composeStrategies,
  evictOldest,
  withCompaction,
} from '@tanstack/ai-compaction'

export const CHAT_COMPACTION_MAX_TOKENS = 180_000
export const CHAT_COMPACTION_KEEP_RECENT_TOOL_RESULTS = 12
export const CHAT_COMPACTION_KEEP_RECENT_TOKENS = 100_000

export const chatCompactionStrategy = composeStrategies(
  clearToolResults({
    keepRecentToolResults: CHAT_COMPACTION_KEEP_RECENT_TOOL_RESULTS,
  }),
  evictOldest({
    keepRecentTokens: CHAT_COMPACTION_KEEP_RECENT_TOKENS,
  }),
)

export const chatCompactionMiddleware = withCompaction({
  maxTokens: CHAT_COMPACTION_MAX_TOKENS,
  strategy: chatCompactionStrategy,
})
