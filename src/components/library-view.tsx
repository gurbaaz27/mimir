import { useEffect, useRef, useState } from 'react'
import { Dialog, DropdownMenu, Tooltip } from 'radix-ui'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowRightIcon,
  BotIcon,
  FileTextIcon,
  FolderOpenIcon,
  LockIcon,
  MoreIcon,
  TrashIcon,
  ZapIcon,
  type AnimatedIconHandle,
} from '#/components/icons'
import { GalleryVerticalEndIcon } from '#/components/ui/gallery-vertical-end'
import { Openai } from '#/components/ui/svgs/openai'
import { getStorageEstimate } from '#/lib/db.client'
import { getDocumentPathSegment } from '#/lib/document-route'
import { useEditorStore } from '#/lib/editor-store.client'
import { AgentStatus } from './agent-status'
import { MimirMark, documentLabel, formatFileSize, relativeTime } from './ui'

const claims = [
  { icon: LockIcon, text: 'Your pdfs never leave the browser' },
  { icon: ZapIcon, text: 'Opens instantly, works offline' },
  { icon: BotIcon, text: 'Agent Ready over WebMCP' },
]

function Tagline() {
  return (
    <>
      where <s>gods</s> humans and ai study together
    </>
  )
}

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
  const zoneIconRef = useRef<AnimatedIconHandle>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removeTarget, setRemoveTarget] = useState<(typeof documents)[number] | null>(null)
  const [removing, setRemoving] = useState(false)
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

  const removeDocument = async () => {
    if (!removeTarget) return
    setRemoving(true)
    try {
      await deleteDocument(removeTarget.id)
      setRemoveTarget(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The document could not be removed.')
    } finally {
      setRemoving(false)
    }
  }

  const storagePercent = storage?.quota && storage.usage ? Math.round((storage.usage / storage.quota) * 100) : null
  const scrollToLibrary = () => {
    const library = document.getElementById('library-section')
    if (!library) return
    library.scrollIntoView?.({
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth',
      block: 'start',
    })
  }
  const dropHandlers = {
    onPointerEnter: () => zoneIconRef.current?.startAnimation(),
    onPointerLeave: () => zoneIconRef.current?.stopAnimation(),
    onDragEnter: (event: React.DragEvent) => {
      event.preventDefault()
      setDragging(true)
      zoneIconRef.current?.startAnimation()
    },
    onDragOver: (event: React.DragEvent) => event.preventDefault(),
    onDragLeave: (event: React.DragEvent) => {
      if (event.currentTarget.contains(event.relatedTarget as Node)) return
      setDragging(false)
      zoneIconRef.current?.stopAnimation()
    },
    onDrop: (event: React.DragEvent) => {
      event.preventDefault()
      setDragging(false)
      zoneIconRef.current?.stopAnimation()
      void ingest(event.dataTransfer.files[0])
    },
  }

  return (
    <Tooltip.Provider>
      <main className="library-shell">
        <header className="library-header">
          <MimirMark />
          <div className="library-header-actions">
            <AgentStatus documentId={null} variant="library" />
            {documents.length > 0 && (
              <button className="primary-button library-nav-button" type="button" onClick={scrollToLibrary}>
                <GalleryVerticalEndIcon className="library-nav-icon" size={16} />
                My Library
              </button>
            )}
          </div>
        </header>

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

        <section className="hero">
          <img className="hero-mark" src="/mimir-logo.png" alt="" width={88} height={88} />
          <h1>
            <Tagline />
          </h1>
          <p className="hero-pitch">
            <span className="pitch-line">
              <mark className="mark-highlight">Highlight</mark>,{' '}
              <span className="mark-draw">draw</span>, and pin{' '}
              <span className="mark-note">sticky notes</span> as you read.
            </span>
            <span className="pitch-line">
              Or ask your{' '}
              <span className="mark-agent">
                <Openai className="mark-agent-glyph" fill="currentColor" />
                agent
              </span>{' '}
              to do that for you.
            </span>
          </p>
        </section>

        <button
          type="button"
          className={`drop-zone drop-zone-featured ${dragging ? 'is-dragging' : ''}`}
          onClick={() => inputRef.current?.click()}
          {...dropHandlers}
        >
          <span className="upload-orbit" aria-hidden="true">
            <FileTextIcon ref={zoneIconRef} size={26} />
          </span>
          <strong>
            {status === 'loading'
              ? 'opening your pdf…'
              : documents.length === 0
                ? 'drop a pdf to begin'
                : 'drop another pdf here'}
          </strong>
          <span>or choose one from your computer</span>
          <span className="drop-hint" aria-hidden="true">Nothing uploads. The file stays on this device.</span>
        </button>

        <div className="hero-claims">
          {claims.map(({ icon: Icon, text }) => (
            <span className="claim" key={text}>
              <Icon size={14} />
              {text}
            </span>
          ))}
        </div>

        {documents.length > 0 && (
          <section id="library-section" className="document-library" aria-labelledby="library-title">
            <div className="section-heading">
              <h2 id="library-title">Your library</h2>
              <i aria-hidden="true" />
              <span>
                {documents.length} {documents.length === 1 ? 'document' : 'documents'} stored locally
              </span>
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
                        <strong>{documentLabel(record)}</strong>
                        <span>
                          {record.author && <>{record.author}<b>·</b></>}
                          {record.pageCount} pages <b>·</b> {formatFileSize(record.size)}
                        </span>
                      </span>
                      <span className="document-progress">
                        <span>
                          Page {record.lastPage} <b>of {record.pageCount}</b>
                        </span>
                        <i><b style={{ width: `${progress}%` }} /></i>
                      </span>
                      <span className="document-updated">{relativeTime(record.lastOpenedAt)}</span>
                      <ArrowRightIcon className="row-arrow" size={17} />
                    </button>
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <button className="row-menu" type="button" aria-label={`More options for ${record.name}`}>
                          <MoreIcon size={17} />
                        </button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content className="menu-content" align="end" sideOffset={7}>
                          <DropdownMenu.Item className="menu-item" onSelect={() => void openRecord(record)}>
                            <FolderOpenIcon size={15} /> Open document
                          </DropdownMenu.Item>
                          <DropdownMenu.Separator className="menu-separator" />
                          <DropdownMenu.Item
                            className="menu-item is-danger"
                            onSelect={() => setRemoveTarget(record)}
                          >
                            <TrashIcon size={15} /> Remove
                          </DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  </article>
                )
              })}
            </div>
          </section>
        )}

        <Dialog.Root
          open={removeTarget !== null}
          onOpenChange={(open) => {
            if (!open && !removing) setRemoveTarget(null)
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content className="remove-dialog" aria-describedby="remove-description">
              <div className="remove-dialog-heading">
                <span className="remove-dialog-icon" aria-hidden="true"><TrashIcon size={18} /></span>
                <div>
                  <Dialog.Title>Remove this document?</Dialog.Title>
                  <Dialog.Description id="remove-description">
                    The PDF and its local annotations will be removed from this browser.
                  </Dialog.Description>
                </div>
              </div>
              {removeTarget && (
                <div className="remove-dialog-document">
                  <span className="remove-dialog-thumb" aria-hidden="true">PDF</span>
                  <strong>{removeTarget.name}</strong>
                </div>
              )}
              <div className="dialog-actions remove-dialog-actions">
                <Dialog.Close asChild>
                  <button type="button" className="secondary-button" disabled={removing}>Keep document</button>
                </Dialog.Close>
                <button
                  type="button"
                  className="remove-button"
                  disabled={removing}
                  aria-busy={removing}
                  onClick={() => void removeDocument()}
                >
                  <TrashIcon size={15} />
                  {removing ? 'Removing…' : 'Remove document'}
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        {(error || storeError) && <div className="error-banner" role="alert">{error || storeError}</div>}

        {storagePercent !== null && storagePercent >= 60 && (
          <footer className="library-footer">
            This browser is {storagePercent}% full — remove a document to make room.
          </footer>
        )}
      </main>
    </Tooltip.Provider>
  )
}
