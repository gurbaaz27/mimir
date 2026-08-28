import '@tanstack/react-start/client-only'
import { db } from './db.client'

export interface SearchResult {
  pageNumber: number
  index: number
  snippet: string
}

export async function searchDocumentText(documentId: string, query: string, limit = 50) {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return []
  const pages = await db.textPages.where('documentId').equals(documentId).sortBy('pageNumber')
  const results: Array<SearchResult> = []
  for (const page of pages) {
    const haystack = page.text.toLocaleLowerCase()
    let from = 0
    while (results.length < limit) {
      const index = haystack.indexOf(needle, from)
      if (index < 0) break
      const start = Math.max(0, index - 54)
      const end = Math.min(page.text.length, index + needle.length + 72)
      results.push({
        pageNumber: page.pageNumber,
        index,
        snippet: `${start > 0 ? '…' : ''}${page.text.slice(start, end).trim()}${end < page.text.length ? '…' : ''}`,
      })
      from = index + Math.max(needle.length, 1)
    }
    if (results.length >= limit) break
  }
  return results
}
