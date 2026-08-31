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
import { cn } from '#/lib/utils'
import { AgentStatus } from './agent-status'
import {
  Button,
  MimirMark,
  dangerMenuItemClass,
  dialogOverlayClass,
  dialogSurfaceClass,
  documentLabel,
  formatFileSize,
  menuContentClass,
  menuItemClass,
  menuSeparatorClass,
  relativeTime,
} from './ui'

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
      <main className="relative mx-auto min-h-dvh w-[min(940px,calc(100%-48px))] pt-[22px] pb-20 before:pointer-events-none before:fixed before:inset-0 before:-z-1 before:bg-[radial-gradient(128%_58%_at_50%_-14%,oklch(.973_.021_84),transparent_68%),radial-gradient(80%_40%_at_88%_4%,oklch(.976_.014_68),transparent_60%)] max-[820px]:w-[min(calc(100%-28px),680px)]">
        <header className="flex h-auto min-h-[52px] items-center justify-between gap-2">
          <MimirMark large />
          <div className="flex items-center gap-3.5 max-[600px]:gap-1.5">
            <AgentStatus documentId={null} variant="library" />
            {documents.length > 0 && (
              <Button size="compact" className="max-[600px]:min-h-[30px] max-[600px]:gap-1.5 max-[600px]:px-[9px] max-[600px]:text-[10.5px]" onClick={scrollToLibrary}>
                <GalleryVerticalEndIcon className="inline-flex shrink-0 max-[600px]:size-3.5" size={16} />
                My Library
              </Button>
            )}
          </div>
        </header>

        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept="application/pdf,.pdf"
          onChange={(event) => {
            void ingest(event.target.files?.[0])
            event.currentTarget.value = ''
          }}
        />

        <section className="flex flex-col items-center pt-[76px] pb-2 text-center max-[820px]:pt-11">
          <img className="size-[88px] animate-mark-in rounded-[22px] shadow-[inset_0_0_0_1px_oklch(.2_.005_60/.06),0_10px_30px_oklch(.3_.03_70/.13)]" src="/mimir-logo.png" alt="" width={88} height={88} />
          <h1 className="mt-[30px] max-w-[15ch] text-balance font-display text-[clamp(42px,6.4vw,66px)] leading-[.99] font-[640] tracking-[-.048em] max-[600px]:text-4xl [&_s]:relative [&_s]:text-faint [&_s]:no-underline [&_s]:after:absolute [&_s]:after:top-[53%] [&_s]:after:right-[.01em] [&_s]:after:left-[-.02em] [&_s]:after:h-[.04em] [&_s]:after:origin-left [&_s]:after:rotate-[-2deg] [&_s]:after:animate-strike [&_s]:after:rounded-full [&_s]:after:bg-bark [&_s]:after:content-['']">
            <Tagline />
          </h1>
          <p className="mt-5 max-w-none text-[17px] leading-[1.82] text-ink-soft text-wrap-normal max-[600px]:text-[15.5px] max-[600px]:leading-[1.85] [&_.pitch-mark]:font-[540] [&_.pitch-mark]:text-ink">
            <span data-slot="pitch-line" className="block max-w-[48ch] text-pretty">
              <mark className="pitch-mark mx-[-.1em] animate-mark-swipe rounded-[2px] bg-transparent bg-[linear-gradient(180deg,transparent_8%,color-mix(in_oklab,var(--color-mark-sun)_62%,white)_8%_88%,transparent_88%)] bg-[length:0_100%] bg-no-repeat px-[.16em] py-[.06em]">Highlight</mark>,{' '}
              <span className="pitch-mark relative whitespace-nowrap after:absolute after:right-[-.06em] after:bottom-[-.26em] after:left-[-.06em] after:h-[7px] after:animate-mark-draw after:bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%2213%22%20height=%227%22%20viewBox=%220%200%2013%207%22%3E%3Cpath%20d=%22M0%204.6Q3.25%20.9%206.5%204.6T13%204.6%22%20fill=%22none%22%20stroke=%22%23159b98%22%20stroke-width=%221.7%22%20stroke-linecap=%22round%22/%3E%3C/svg%3E')] after:bg-[length:13px_7px] after:bg-repeat-x after:[clip-path:inset(0_100%_0_0)] after:content-['']">draw</span>, and pin{' '}
              <span className="pitch-mark relative mx-[-.04em] inline-block rotate-[-1.5deg] animate-note-in whitespace-nowrap bg-[color-mix(in_oklab,var(--color-mark-iris)_20%,white)] px-[.35em] py-[.1em] shadow-[0_1px_1px_oklch(.3_.05_300/.13),0_3px_7px_oklch(.3_.05_300/.13)] [clip-path:polygon(0_0,100%_0,100%_calc(100%-5px),calc(100%-5px)_100%,0_100%)] after:absolute after:right-0 after:bottom-0 after:border-[2.5px] after:border-transparent after:border-t-[color-mix(in_oklab,var(--color-mark-iris)_44%,white)] after:border-l-[color-mix(in_oklab,var(--color-mark-iris)_44%,white)] after:content-['']">sticky notes</span> as you read.
            </span>
            <span data-slot="pitch-line" className="block max-w-[48ch] text-pretty">
              Or just ask your{' '}
              <span className="pitch-mark relative whitespace-nowrap after:absolute after:right-0 after:bottom-[-.2em] after:left-0 after:h-[3px] after:animate-agent-rule-in after:bg-[radial-gradient(circle,var(--color-ink-soft)_1.05px,transparent_1.15px)] after:bg-[length:5px_3px] after:bg-repeat-x after:[clip-path:inset(0_100%_0_0)] after:content-['']">
                <Openai className="mr-[.32em] inline-block size-[.8em] animate-agent-in text-ink align-[-.03em]" fill="currentColor" />
                agent
              </span>{' '}
              to do that for you.
            </span>
          </p>
        </section>

        <button
          type="button"
          className={cn(
            'group mx-auto mt-11 flex min-h-[250px] w-full max-w-[620px] flex-col items-center justify-center rounded-3xl border border-dashed border-line-strong bg-paper text-ink transition-[border-color,background,box-shadow,transform] duration-180 ease-spring hover:border-clay hover:bg-cream',
            '[&_strong]:font-display [&_strong]:text-[22px] [&_strong]:font-[620] [&_strong]:tracking-[-.03em] [&>span:not(:first-child)]:mt-[9px] [&>span:not(:first-child)]:text-[13.5px] [&>span:not(:first-child)]:text-muted',
            dragging && 'scale-[1.006] border-solid border-clay bg-cream shadow-[0_0_0_4px_oklch(.705_.028_72/.16)]',
          )}
          onClick={() => inputRef.current?.click()}
          {...dropHandlers}
        >
          <span className={cn(
            'relative mb-[22px] grid size-[62px] place-items-center transition-transform duration-260 ease-spring group-hover:-translate-y-[3px]',
            `before:absolute before:inset-0 before:rotate-[-7deg] before:translate-x-[-4px] before:translate-y-0.5 before:rounded-[15px] before:bg-paper before:shadow-[inset_0_0_0_1px_oklch(.7_.03_72/.3),0_2px_6px_oklch(.3_.03_70/.1)] before:transition-transform before:duration-300 before:ease-spring before:content-[''] group-hover:before:rotate-[-14deg] group-hover:before:translate-x-[-10px] group-hover:before:translate-y-1`,
            `after:absolute after:inset-0 after:rotate-6 after:translate-x-1 after:translate-y-[3px] after:rounded-[15px] after:bg-paper after:shadow-[inset_0_0_0_1px_oklch(.7_.03_72/.3),0_2px_6px_oklch(.3_.03_70/.1)] after:transition-transform after:duration-300 after:ease-spring after:content-[''] group-hover:after:rotate-12 group-hover:after:translate-x-2.5 group-hover:after:translate-y-1.5`,
            '[&>.icon-glyph]:relative [&>.icon-glyph]:z-1 [&>.icon-glyph]:grid [&>.icon-glyph]:size-full [&>.icon-glyph]:place-items-center [&>.icon-glyph]:rounded-2xl [&>.icon-glyph]:bg-cream [&>.icon-glyph]:text-bark [&>.icon-glyph]:shadow-[inset_0_0_0_1px_oklch(.7_.03_72/.34)]',
            dragging && '-translate-y-[3px] before:rotate-[-14deg] before:translate-x-[-10px] before:translate-y-1 after:rotate-12 after:translate-x-2.5 after:translate-y-1.5',
          )} aria-hidden="true">
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
          <span className="!mt-[18px] rounded-full bg-[oklch(.7_.028_72/.12)] px-[11px] py-[5px] !text-[11px] font-medium tracking-[-.005em] !text-bark" aria-hidden="true">Nothing uploads. The file stays on this device.</span>
        </button>

        <div className="mt-11 flex flex-wrap items-center justify-center gap-2.5 max-[600px]:mt-[38px]">
          {claims.map(({ icon: Icon, text }) => (
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-paper py-2 pr-3.5 pl-3 text-[11.5px] font-medium text-ink-soft transition-[border-color,transform] duration-180 ease-spring hover:-translate-y-px hover:border-line-strong [&_.icon-glyph]:text-bark" key={text}>
              <Icon size={14} />
              {text}
            </span>
          ))}
        </div>

        {documents.length > 0 && (
          <section id="library-section" className="mt-16 scroll-mt-4 pb-2" aria-labelledby="library-title">
            <div className="mb-3.5 flex items-center gap-3.5">
              <h2 className="m-0 text-[11px] font-semibold tracking-[.1em] text-ink-soft uppercase" id="library-title">Your library</h2>
              <i className="h-px min-w-5 flex-1 bg-[linear-gradient(90deg,var(--color-line-strong),var(--color-line))]" aria-hidden="true" />
              <span className="shrink-0 text-[11px] text-faint tabular-nums">
                {documents.length} {documents.length === 1 ? 'document' : 'documents'} stored locally
              </span>
            </div>
            <div className="overflow-hidden rounded-[18px] border border-line bg-paper shadow-[0_1px_2px_oklch(.2_.005_60/.05),0_10px_30px_oklch(.28_.02_70/.07)]">
              {documents.map((record) => {
                const progress = Math.max(3, Math.round((record.lastPage / record.pageCount) * 100))
                return (
                  <article className="group/row relative flex min-h-[86px] items-stretch border-t border-line bg-paper transition-colors first:border-t-0 hover:bg-surface focus-within:bg-surface before:absolute before:top-3 before:bottom-3 before:left-0 before:z-1 before:w-[3px] before:origin-center before:scale-y-0 before:rounded-r-[3px] before:bg-clay before:transition-transform before:duration-200 before:ease-spring before:content-[''] hover:before:scale-y-100 focus-within:before:scale-y-100" key={record.id}>
                    <button className="grid w-full grid-cols-[42px_minmax(160px,1fr)_196px_64px_24px] items-center gap-[18px] border-0 bg-transparent py-3.5 pr-[52px] pl-5 text-left max-[820px]:grid-cols-[40px_minmax(0,1fr)_66px_26px] max-[600px]:grid-cols-[38px_minmax(0,1fr)_24px] max-[600px]:gap-3 max-[600px]:py-3 max-[600px]:pr-12 max-[600px]:pl-4" type="button" onClick={() => void openRecord(record)}>
                      <span className="relative grid h-[46px] w-9 place-items-center overflow-hidden rounded-sm bg-paper text-bark shadow-[inset_0_0_0_1px_oklch(.7_.03_72/.34),2px_2px_0_-1px_var(--color-cream),3.5px_3.5px_0_-1.5px_oklch(.7_.03_72/.3)] transition-[transform,box-shadow] duration-200 ease-spring group-hover/row:-translate-y-0.5 group-hover/row:shadow-[inset_0_0_0_1px_oklch(.7_.03_72/.4),3px_3px_0_-1px_var(--color-cream),5px_5px_0_-1.5px_oklch(.7_.03_72/.34)]" aria-hidden="true">
                        <span className="relative z-1 text-[8px] font-[640] tracking-[.06em]">PDF</span>
                        <i className="absolute inset-x-0 bottom-0 min-h-[3px] bg-[oklch(.705_.028_72/.3)]" style={{ height: `${progress}%` }} />
                      </span>
                      <span className="min-w-0">
                        <strong className="block overflow-hidden text-[15px] font-[570] tracking-[-.018em] text-ellipsis whitespace-nowrap">{documentLabel(record)}</strong>
                        <span className="mt-1.5 flex items-center gap-[7px] overflow-hidden text-[11.5px] text-muted whitespace-nowrap">
                          {record.author && <>{record.author}<b className="font-normal text-line-strong">·</b></>}
                          {record.pageCount} pages <b className="font-normal text-line-strong">·</b> {formatFileSize(record.size)}
                        </span>
                      </span>
                      <span className="max-[820px]:hidden">
                        <span className="block text-[11px] font-[520] text-ink-soft tabular-nums">
                          Page {record.lastPage} <b className="font-normal text-faint">of {record.pageCount}</b>
                        </span>
                        <i className="mt-2 block h-1 w-full overflow-hidden rounded-full bg-sunken shadow-[inset_0_0_0_1px_oklch(.7_.03_72/.12)]"><b className="block h-full rounded-[inherit] bg-[linear-gradient(90deg,var(--color-clay),oklch(.63_.035_66))] transition-[width] duration-260 ease-spring" style={{ width: `${progress}%` }} /></i>
                      </span>
                      <span className="text-right text-[11px] text-faint tabular-nums max-[600px]:hidden">{relativeTime(record.lastOpenedAt)}</span>
                      <ArrowRightIcon className="text-faint transition-[color,transform] duration-200 ease-spring group-hover/row:translate-x-[3px] group-hover/row:text-ink" size={17} />
                    </button>
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <button className="absolute top-[26px] right-3 grid size-8 place-items-center rounded-[9px] border-0 bg-transparent p-0 text-faint transition-[color,background,transform] duration-150 ease-spring hover:bg-sunken hover:text-ink active:scale-90" type="button" aria-label={`More options for ${record.name}`}>
                          <MoreIcon size={17} />
                        </button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content className={menuContentClass} align="end" sideOffset={7}>
                          <DropdownMenu.Item className={menuItemClass} onSelect={() => void openRecord(record)}>
                            <FolderOpenIcon size={15} /> Open document
                          </DropdownMenu.Item>
                          <DropdownMenu.Separator className={menuSeparatorClass} />
                          <DropdownMenu.Item
                            className={cn(menuItemClass, dangerMenuItemClass)}
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
            <Dialog.Overlay className={dialogOverlayClass} />
            <Dialog.Content className={cn(dialogSurfaceClass, 'w-[min(430px,calc(100vw-32px))] p-[25px]')} aria-describedby="remove-description">
              <div className="flex items-start gap-[13px]">
                <span className="mt-px grid size-10 shrink-0 place-items-center rounded-xl border border-[oklch(.86_.05_28)] bg-[oklch(.975_.014_28)] text-danger" aria-hidden="true"><TrashIcon size={18} /></span>
                <div>
                  <Dialog.Title className="m-0 font-display text-[22px] font-[620] tracking-[-.03em]">Remove this document?</Dialog.Title>
                  <Dialog.Description className="mt-[7px] mb-0 text-[12.5px] leading-normal text-muted" id="remove-description">
                    The PDF and its local annotations will be removed from this browser.
                  </Dialog.Description>
                </div>
              </div>
              {removeTarget && (
                <div className="mt-[22px] flex min-h-[54px] items-center gap-[11px] rounded-xl border border-line bg-surface px-[11px] py-[9px]">
                  <span className="grid h-9 w-[30px] shrink-0 place-items-center rounded bg-paper text-[8px] font-[640] tracking-[.06em] text-bark shadow-[inset_0_0_0_1px_oklch(.7_.03_72/.34)]" aria-hidden="true">PDF</span>
                  <strong className="min-w-0 overflow-hidden text-xs font-[560] tracking-[-.01em] text-ellipsis whitespace-nowrap">{removeTarget.name}</strong>
                </div>
              )}
              <div className="mt-6 flex items-center justify-end gap-2 max-[600px]:[&>button]:min-w-0 max-[600px]:[&>button]:flex-1 max-[600px]:[&>button]:px-[11px] max-[600px]:[&>button]:text-xs max-[600px]:[&>button]:whitespace-nowrap">
                <Dialog.Close asChild>
                  <Button tone="paper" disabled={removing}>Keep document</Button>
                </Dialog.Close>
                <Button
                  tone="danger"
                  className="max-[600px]:gap-1.5 max-[600px]:px-2 max-[600px]:text-[11.5px] max-[600px]:tracking-[-.015em]"
                  disabled={removing}
                  aria-busy={removing}
                  onClick={() => void removeDocument()}
                >
                  <TrashIcon size={15} />
                  {removing ? 'Removing…' : 'Remove document'}
                </Button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        {(error || storeError) && <div className="mt-4 rounded-[11px] border border-[oklch(.86_.05_28)] bg-[oklch(.975_.014_28)] px-3.5 py-3 text-xs text-danger" role="alert">{error || storeError}</div>}

        {storagePercent !== null && storagePercent >= 60 && (
          <footer className="mt-[26px] flex items-center justify-center gap-2 text-[11px] text-faint">
            This browser is {storagePercent}% full — remove a document to make room.
          </footer>
        )}
      </main>
    </Tooltip.Provider>
  )
}
