import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  FolderOpen,
  HardDrive,
  MoreHorizontal,
  Plus,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import { DropdownMenu, Tooltip } from 'radix-ui'
import { useNavigate } from '@tanstack/react-router'
import { getStorageEstimate } from '#/lib/db.client'
import { getDocumentPathSegment } from '#/lib/document-route'
import { useEditorStore } from '#/lib/editor-store.client'
import { MimirMark, formatFileSize, relativeTime } from './ui'

export function LibraryView() {
  const navigate = useNavigate()
  const documents = useEditorStore((state) => state.documents)
  const loadLibrary = useEditorStore((state) => state.loadLibrary)
  const importDocument = useEditorStore((state) => state.importDocument)
  const openDocument = useEditorStore((state) => state.openDocument)
  const deleteDocument = useEditorStore((state) => state.deleteDocument)
  const status = useEditorStore((state) => state.status)
  const storeError = useEditorStore((state) => state.error)
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [storage, setStorage] = useState<{ usage?: number; quota?: number } | null>(null)

  const openRecord = async (record: (typeof documents)[number]) => {
    await openDocument(record.id)
    await navigate({ to: '/$pdfName', params: { pdfName: getDocumentPathSegment(record) } })
  }

  useEffect(() => {
    void loadLibrary()
    void getStorageEstimate().then(setStorage)
  }, [loadLibrary])

  const ingest = async (file?: File) => {
    if (!file) return
    setError(null)
    try {
      const record = await importDocument(file)
      await navigate({ to: '/$pdfName', params: { pdfName: getDocumentPathSegment(record) } })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The PDF could not be opened.')
    }
  }

  const storagePercent = storage?.quota && storage.usage ? Math.round((storage.usage / storage.quota) * 100) : null

  return (
    <Tooltip.Provider>
      <main className="library-shell">
        <header className="library-header">
          <MimirMark />
          <div className="privacy-pill">
            <ShieldCheck size={15} aria-hidden="true" />
            Private by default
          </div>
        </header>

        <section className="library-intro" aria-labelledby="library-title">
          <div>
            <h1 id="library-title">Read closely.</h1>
            <p>Your papers, notes, and marks stay in this browser.</p>
          </div>
          {documents.length > 0 && (
            <button className="primary-button" type="button" onClick={() => inputRef.current?.click()}>
              <Plus size={17} />
              Add PDF
            </button>
          )}
        </section>

        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept="application/pdf,.pdf"
          onChange={(event) => {
            void ingest(event.target.files?.[0])
            event.currentTarget.value = ''
          }}
        />

        {documents.length === 0 ? (
          <button
            type="button"
            className={`drop-zone drop-zone-empty ${dragging ? 'is-dragging' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false)
            }}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              void ingest(event.dataTransfer.files[0])
            }}
          >
            <span className="upload-orbit" aria-hidden="true">
              <FileText size={29} />
              <span><UploadCloud size={17} /></span>
            </span>
            <strong>{status === 'loading' ? 'Opening your PDF…' : 'Drop a PDF to begin'}</strong>
            <span>or choose a file from your computer</span>
            <small>PDFs are processed locally and never uploaded.</small>
          </button>
        ) : (
          <section className="document-library" aria-labelledby="recent-title">
            <div className="section-heading">
              <h2 id="recent-title">Recent documents</h2>
              <span>{documents.length} stored locally</span>
            </div>
            <div className="document-list">
              {documents.map((record) => {
                const progress = Math.max(3, Math.round((record.lastPage / record.pageCount) * 100))
                return (
                  <article className="document-row" key={record.id}>
                    <button className="document-open" type="button" onClick={() => void openRecord(record)}>
                      <span className="pdf-thumb" aria-hidden="true">
                        <span>PDF</span>
                        <i style={{ height: `${progress}%` }} />
                      </span>
                      <span className="document-main">
                        <strong>{record.title || record.name.replace(/\.pdf$/i, '')}</strong>
                        <span>
                          {record.author && <>{record.author}<b>·</b></>}
                          {record.pageCount} pages <b>·</b> {formatFileSize(record.size)}
                        </span>
                      </span>
                      <span className="document-progress">
                        <span>Page {record.lastPage}</span>
                        <i><b style={{ width: `${progress}%` }} /></i>
                      </span>
                      <span className="document-updated">{relativeTime(record.lastOpenedAt)}</span>
                      <ArrowRight className="row-arrow" size={18} aria-hidden="true" />
                    </button>
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <button className="row-menu" type="button" aria-label={`More options for ${record.name}`}>
                          <MoreHorizontal size={18} />
                        </button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content className="menu-content" align="end" sideOffset={7}>
                          <DropdownMenu.Item className="menu-item" onSelect={() => void openRecord(record)}>
                            <FolderOpen size={15} /> Open document
                          </DropdownMenu.Item>
                          <DropdownMenu.Separator className="menu-separator" />
                          <DropdownMenu.Item
                            className="menu-item is-danger"
                            onSelect={() => {
                              if (window.confirm(`Remove “${record.name}” and its local annotations?`)) void deleteDocument(record.id)
                            }}
                          >
                            <Trash2 size={15} /> Remove locally
                          </DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  </article>
                )
              })}
            </div>
            <button
              type="button"
              className={`drop-zone drop-zone-compact ${dragging ? 'is-dragging' : ''}`}
              onClick={() => inputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault()
                setDragging(false)
                void ingest(event.dataTransfer.files[0])
              }}
            >
              <UploadCloud size={18} />
              Drop another PDF here
            </button>
          </section>
        )}

        {(error || storeError) && <div className="error-banner" role="alert">{error || storeError}</div>}

        <footer className="library-footer">
          <span><CheckCircle2 size={14} /> Autosaved on this device</span>
          {storagePercent !== null && (
            <span><HardDrive size={14} /> Browser storage {storagePercent}% used</span>
          )}
        </footer>
      </main>
    </Tooltip.Provider>
  )
}
