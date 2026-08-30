import { useEffect, useRef, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { SearchIcon, XIcon } from '#/components/icons'
import { useEditorStore } from '#/lib/editor-store.client'
import { searchDocumentText, type SearchResult } from '#/lib/search.client'

export function SearchPanel() {
  const activeDocument = useEditorStore((state) => state.activeDocument)
  const setOpen = useEditorStore((state) => state.setSearchOpen)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Array<SearchResult>>([])
  const [searching, setSearching] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node) || panelRef.current?.contains(target)) return
      if (target instanceof Element && target.closest('[data-search-trigger]')) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [setOpen])

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
    <div ref={panelRef} className="fixed top-[62px] right-5 z-30 flex min-h-12 w-90 animate-menu-in items-center gap-2 rounded-[14px] border border-line bg-paper p-[7px] shadow-menu max-[820px]:top-[62px] max-[820px]:right-3 max-[820px]:w-[min(360px,calc(100vw-24px))]" role="search">
      <div className="flex h-[34px] flex-1 items-center gap-2 rounded-[10px] border border-line bg-surface px-2.5 [&>.icon-glyph]:shrink-0 [&>.icon-glyph]:text-muted [&>svg]:shrink-0 [&>svg]:text-muted">
        {searching ? <LoaderCircle className="animate-spin-slow" size={16} /> : <SearchIcon size={16} />}
        <input className="min-w-0 w-full border-0 bg-transparent p-0 text-xs text-ink outline-0 placeholder:text-faint" ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this PDF" aria-label="Search this PDF" />
        {query && <button className="grid size-[22px] place-items-center border-0 bg-transparent p-0 text-muted" type="button" aria-label="Clear search" onClick={() => setQuery('')}><XIcon size={14} /></button>}
      </div>
      <button type="button" className="h-8 rounded-lg border-0 bg-transparent px-2 text-[11px] font-[540] text-ink transition-colors hover:bg-sunken" onClick={() => setOpen(false)}>Done</button>
      {query && (
        <div className="absolute top-[calc(100%+6px)] right-0 left-0 max-h-[420px] overflow-auto rounded-[14px] border border-line bg-paper p-1.5 shadow-menu">
          <div className="px-[9px] py-[7px] text-[10px] text-faint">{results.length ? `${results.length} result${results.length === 1 ? '' : 's'}` : searching ? 'Searching…' : 'No matches yet'}</div>
          {results.map((result, index) => (
            <button
              className="block w-full rounded-[9px] border-0 bg-transparent p-[9px] text-left transition-colors hover:bg-surface [&_span]:text-[10px] [&_span]:font-[560] [&_span]:text-muted [&_p]:mt-1 [&_p]:mb-0 [&_p]:text-[11px] [&_p]:leading-[1.45] [&_p]:text-ink-soft"
              type="button"
              key={`${result.pageNumber}-${result.index}-${index}`}
              onClick={() => window.dispatchEvent(new CustomEvent('mimir:navigate', { detail: { pageNumber: result.pageNumber } }))}
            >
              <span>Page {result.pageNumber}</span>
              <p>{result.snippet}</p>
            </button>
          ))}
          {activeDocument && activeDocument.indexedPages < activeDocument.pageCount && (
            <small className="block p-2 text-[9px] text-faint">Indexing page {activeDocument.indexedPages + 1} of {activeDocument.pageCount}. More results may appear.</small>
          )}
        </div>
      )}
    </div>
  )
}
