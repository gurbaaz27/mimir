import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, Search, X } from 'lucide-react'
import { useEditorStore } from '#/lib/editor-store.client'
import { searchDocumentText, type SearchResult } from '#/lib/search.client'

export function SearchPanel() {
  const activeDocument = useEditorStore((state) => state.activeDocument)
  const setOpen = useEditorStore((state) => state.setSearchOpen)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Array<SearchResult>>([])
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => inputRef.current?.focus(), [])
  useEffect(() => {
    if (!activeDocument || !query.trim()) {
      setResults([])
      return
    }
    setSearching(true)
    const timer = window.setTimeout(() => {
      void searchDocumentText(activeDocument.id, query).then((next) => {
        setResults(next)
        setSearching(false)
      })
    }, 160)
    return () => window.clearTimeout(timer)
  }, [activeDocument, query])

  return (
    <div className="search-panel" role="search">
      <div className="search-input-wrap">
        {searching ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />}
        <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this PDF" aria-label="Search this PDF" />
        {query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={14} /></button>}
      </div>
      <button type="button" className="search-done" onClick={() => setOpen(false)}>Done</button>
      {query && (
        <div className="search-results">
          <div>{results.length ? `${results.length} result${results.length === 1 ? '' : 's'}` : searching ? 'Searching…' : 'No matches yet'}</div>
          {results.map((result, index) => (
            <button
              type="button"
              key={`${result.pageNumber}-${result.index}-${index}`}
              onClick={() => window.dispatchEvent(new CustomEvent('mimir:navigate', { detail: { pageNumber: result.pageNumber } }))}
            >
              <span>Page {result.pageNumber}</span>
              <p>{result.snippet}</p>
            </button>
          ))}
          {activeDocument && activeDocument.indexedPages < activeDocument.pageCount && (
            <small>Indexing page {activeDocument.indexedPages + 1} of {activeDocument.pageCount}. More results may appear.</small>
          )}
        </div>
      )}
    </div>
  )
}
