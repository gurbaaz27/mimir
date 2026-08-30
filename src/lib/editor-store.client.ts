import '@tanstack/react-start/client-only'
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { db, type DocumentRecord } from './db.client'
import type { OutlineEntry } from './pdf.client'
import { getDocumentSlug } from './document-route'
import {
  annotationSchema,
  annotationBounds,
  translateAnnotation,
  type Annotation,
  type AnnotationAuthor,
  type AnnotationPatch,
  type MarkupType,
  type ShapeType,
} from './annotations'

export type EditorTool =
  | 'select'
  | 'pan'
  | MarkupType
  | 'ink'
  | 'text'
  | 'note'
  | ShapeType

interface HistoryEntry {
  label: string
  before: Array<Annotation>
  after: Array<Annotation>
}

interface AnnotationDrag {
  ids: Array<string>
  dx: number
  dy: number
}

interface EditorState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  documents: Array<DocumentRecord>
  activeDocument: DocumentRecord | null
  annotations: Array<Annotation>
  outline: Array<OutlineEntry> | null
  selectedAnnotationId: string | null
  selectedAnnotationIds: Array<string>
  annotationDrag: AnnotationDrag | null
  tool: EditorTool
  color: string
  currentPage: number
  zoom: number
  rotation: number
  sidebarOpen: boolean
  searchOpen: boolean
  toast: string | null
  history: Array<HistoryEntry>
  future: Array<HistoryEntry>
  loadLibrary: () => Promise<void>
  importDocument: (file: File) => Promise<DocumentRecord>
  openDocument: (id: string) => Promise<void>
  cancelDocumentOpen: () => void
  closeDocument: () => Promise<void>
  deleteDocument: (id: string) => Promise<void>
  setTool: (tool: EditorTool) => void
  setColor: (color: string) => void
  setCurrentPage: (page: number) => void
  setZoom: (zoom: number) => Promise<void>
  setRotation: (rotation: number) => void
  setSelectedAnnotation: (id: string | null) => void
  setSelectedAnnotations: (ids: Array<string>) => void
  beginAnnotationDrag: (ids: Array<string>) => void
  updateAnnotationDrag: (dx: number, dy: number) => void
  finishAnnotationDrag: () => Promise<void>
  setSidebarOpen: (open: boolean) => void
  setSearchOpen: (open: boolean) => void
  notify: (message: string) => void
  commit: (
    before: Array<Annotation>,
    after: Array<Annotation>,
    label: string,
  ) => Promise<void>
  createAnnotations: (
    annotations: Array<Annotation>,
    label?: string,
  ) => Promise<void>
  updateAnnotations: (
    ids: Array<string>,
    patch: AnnotationPatch,
    author?: AnnotationAuthor,
    label?: string,
  ) => Promise<void>
  updateAnnotation: (
    id: string,
    patch: AnnotationPatch,
    author?: AnnotationAuthor,
  ) => Promise<Annotation>
  moveAnnotations: (ids: Array<string>, dx: number, dy: number) => Promise<void>
  deleteAnnotations: (ids: Array<string>, label?: string) => Promise<void>
  undo: () => Promise<void>
  redo: () => Promise<void>
  indexDocument: (loadedPdf?: PDFDocumentProxy) => Promise<void>
  loadOutline: (pdf: PDFDocumentProxy) => Promise<void>
}

async function loadDocumentsWithStableRoutes() {
  const documents = await db.documents.orderBy('lastOpenedAt').reverse().toArray()
  const persistedRoutes = new Set(documents.flatMap((document) => document.routeSlug ? [document.routeSlug] : []))
  const usedRoutes = new Set<string>()
  const normalizedDocuments: Array<DocumentRecord> = []
  const updates: Array<Promise<unknown>> = []

  for (const document of documents) {
    const baseSlug = getDocumentSlug(document.name)
    let routeSlug = document.routeSlug || baseSlug
    let suffix = 0
    while (!document.routeSlug && (persistedRoutes.has(routeSlug) || usedRoutes.has(routeSlug))) {
      suffix += 1
      routeSlug = `${baseSlug}--${document.id}${suffix > 1 ? `-${suffix}` : ''}`
    }
    usedRoutes.add(routeSlug)
    normalizedDocuments.push({ ...document, routeSlug })
    if (document.routeSlug !== routeSlug) updates.push(db.documents.update(document.id, { routeSlug }))
  }

  await Promise.all(updates)
  return normalizedDocuments
}

async function persistChange(before: Array<Annotation>, after: Array<Annotation>) {
  const afterIds = new Set(after.map((annotation) => annotation.id))
  const removed = before.filter((annotation) => !afterIds.has(annotation.id))
  await db.transaction('rw', db.annotations, async () => {
    if (removed.length) await db.annotations.bulkDelete(removed.map((annotation) => annotation.id))
    if (after.length) await db.annotations.bulkPut(after)
  })
}

let documentOpenRequest = 0

function shouldOpenSidebarByDefault() {
  if (typeof window === 'undefined') return true
  return !window.matchMedia?.('(max-width: 820px)').matches
}

function applyChangeToList(
  current: Array<Annotation>,
  before: Array<Annotation>,
  after: Array<Annotation>,
) {
  const changedIds = new Set([...before, ...after].map((annotation) => annotation.id))
  return [...current.filter((annotation) => !changedIds.has(annotation.id)), ...after].sort(
    (a, b) => a.pageNumber - b.pageNumber || a.createdAt.localeCompare(b.createdAt),
  )
}

export const editorStore = createStore<EditorState>((set, get) => ({
  status: 'idle',
  error: null,
  documents: [],
  activeDocument: null,
  annotations: [],
  outline: null,
  selectedAnnotationId: null,
  selectedAnnotationIds: [],
  annotationDrag: null,
  tool: 'select',
  color: '#f5c84b',
  currentPage: 1,
  zoom: 1,
  rotation: 0,
  sidebarOpen: shouldOpenSidebarByDefault(),
  searchOpen: false,
  toast: null,
  history: [],
  future: [],

  loadLibrary: async () => {
    const documents = await loadDocumentsWithStableRoutes()
    set({ documents })
  },

  importDocument: async (file) => {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      throw new Error('Choose a PDF file.')
    }
    set({ status: 'loading', error: null })
    try {
      const { fingerprintBlob, loadPdf, readPdfMetadata } = await import('./pdf.client')
      const fingerprint = await fingerprintBlob(file)
      const existing = await db.documents.where('fingerprint').equals(fingerprint).first()
      if (existing) {
        await get().openDocument(existing.id)
        await get().loadLibrary()
        return get().documents.find((document) => document.id === existing.id) ?? existing
      }

      const pdf = await loadPdf(file)
      const metadata = await readPdfMetadata(pdf)
      await pdf.cleanup()
      const now = new Date().toISOString()
      const record: DocumentRecord = {
        id: crypto.randomUUID(),
        fingerprint,
        name: file.name,
        size: file.size,
        pageCount: metadata.pageCount,
        blob: file,
        title: metadata.title,
        author: metadata.author,
        createdAt: now,
        lastOpenedAt: now,
        lastPage: 1,
        zoom: 1,
        rotation: 0,
        indexedPages: 0,
      }
      await db.documents.add(record)
      await get().loadLibrary()
      await get().openDocument(record.id)
      return get().documents.find((document) => document.id === record.id) ?? record
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The PDF could not be opened.'
      set({ status: 'error', error: message })
      throw error
    }
  },

  openDocument: async (id) => {
    const request = ++documentOpenRequest
    set({ status: 'loading', error: null })
    const document = await db.documents.get(id)
    if (!document) throw new Error('This local document is no longer available.')
    if (request !== documentOpenRequest) return
    const annotations = await db.annotations.where('documentId').equals(id).toArray()
    if (request !== documentOpenRequest) return

    const lastOpenedAt = new Date().toISOString()
    const activeDocument = { ...document, lastOpenedAt }
    set({
      status: 'ready',
      activeDocument,
      annotations,
      outline: null,
      currentPage: document.lastPage,
      zoom: document.zoom,
      rotation: document.rotation,
      selectedAnnotationId: null,
      selectedAnnotationIds: [],
      annotationDrag: null,
      history: [],
      future: [],
    })
    await db.documents.update(id, { lastOpenedAt })
    void get().loadLibrary()
  },

  cancelDocumentOpen: () => {
    documentOpenRequest += 1
  },

  closeDocument: async () => {
    documentOpenRequest += 1
    const { activeDocument, currentPage, zoom, rotation } = get()
    if (activeDocument) {
      await db.documents.update(activeDocument.id, {
        lastPage: currentPage,
        zoom,
        rotation,
      })
    }
    set({
      status: 'idle',
      activeDocument: null,
      annotations: [],
      outline: null,
      selectedAnnotationId: null,
      selectedAnnotationIds: [],
      annotationDrag: null,
      history: [],
      future: [],
    })
  },

  deleteDocument: async (id) => {
    await db.transaction('rw', db.documents, db.annotations, db.textPages, async () => {
      await db.documents.delete(id)
      await db.annotations.where('documentId').equals(id).delete()
      await db.textPages.where('documentId').equals(id).delete()
    })
    if (get().activeDocument?.id === id) await get().closeDocument()
    await get().loadLibrary()
  },

  setTool: (tool) => set({ tool, annotationDrag: null }),
  setColor: (color) => set({ color }),
  setCurrentPage: (currentPage) => {
    const pageCount = get().activeDocument?.pageCount ?? 1
    set({ currentPage: Math.max(1, Math.min(currentPage, pageCount)) })
  },
  setZoom: (zoom) => {
    const nextZoom = Math.max(0.5, Math.min(3, zoom))
    const documentId = get().activeDocument?.id
    set((state) => ({
      zoom: nextZoom,
      activeDocument: state.activeDocument ? { ...state.activeDocument, zoom: nextZoom } : null,
    }))
    return documentId ? db.documents.update(documentId, { zoom: nextZoom }).then(() => undefined) : Promise.resolve()
  },
  setRotation: (rotation) => set({ rotation: ((rotation % 360) + 360) % 360 }),
  setSelectedAnnotation: (selectedAnnotationId) =>
    set({
      selectedAnnotationId,
      selectedAnnotationIds: selectedAnnotationId ? [selectedAnnotationId] : [],
      annotationDrag: null,
    }),
  setSelectedAnnotations: (ids) => {
    const uniqueIds = [...new Set(ids)]
    set({
      selectedAnnotationIds: uniqueIds,
      selectedAnnotationId: uniqueIds[0] ?? null,
      annotationDrag: null,
    })
  },
  beginAnnotationDrag: (ids) => {
    const uniqueIds = [...new Set(ids)]
    if (uniqueIds.length) set({ annotationDrag: { ids: uniqueIds, dx: 0, dy: 0 } })
  },
  updateAnnotationDrag: (dx, dy) =>
    set((state) => state.annotationDrag ? { annotationDrag: { ...state.annotationDrag, dx, dy } } : state),
  finishAnnotationDrag: async () => {
    const drag = get().annotationDrag
    if (!drag) return
    try {
      if (Math.abs(drag.dx) > 0.0001 || Math.abs(drag.dy) > 0.0001) {
        await get().moveAnnotations(drag.ids, drag.dx, drag.dy)
      }
    } finally {
      set({ annotationDrag: null })
    }
  },
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  notify: (toast) => {
    set({ toast })
    window.setTimeout(() => {
      if (get().toast === toast) set({ toast: null })
    }, 3600)
  },

  commit: async (before, after, label) => {
    before.forEach((annotation) => annotationSchema.parse(annotation))
    after.forEach((annotation) => annotationSchema.parse(annotation))
    await persistChange(before, after)
    set((state) => ({
      annotations: applyChangeToList(state.annotations, before, after),
      history: [...state.history.slice(-49), { before, after, label }],
      future: [],
    }))
  },

  createAnnotations: async (annotations, label = 'Add annotation') => {
    await get().commit([], annotations, label)
    if (annotations.length === 1) {
      const id = annotations[0]?.id ?? null
      set({ selectedAnnotationId: id, selectedAnnotationIds: id ? [id] : [] })
    }
  },

  updateAnnotations: async (ids, patch, author = 'human', label = 'Edit annotations') => {
    const idSet = new Set(ids)
    const before = get().annotations.filter((annotation) => idSet.has(annotation.id))
    if (!before.length) throw new Error('No matching annotations were found.')
    const after = before.map((annotation) => {
      const style = patch.style ? { ...annotation.style, ...patch.style } : annotation.style
      return annotationSchema.parse({
        ...annotation,
        ...patch,
        style,
        id: annotation.id,
        documentId: annotation.documentId,
        lastModifiedBy: author,
        updatedAt: new Date().toISOString(),
      })
    })
    await get().commit(before, after, label)
  },

  updateAnnotation: async (id, patch, author = 'human') => {
    await get().updateAnnotations([id], patch, author, 'Edit annotation')
    const updated = get().annotations.find((annotation) => annotation.id === id)
    if (!updated) throw new Error(`Annotation ${id} was not found.`)
    return updated
  },

  moveAnnotations: async (ids, dx, dy) => {
    const idSet = new Set(ids)
    const before = get().annotations.filter((annotation) => idSet.has(annotation.id))
    if (!before.length) throw new Error('No matching annotations were found.')
    const bounds = before.map(annotationBounds).filter((value): value is NonNullable<typeof value> => value !== null)
    const minX = bounds.length ? Math.min(...bounds.map((bound) => bound.x)) : 0
    const minY = bounds.length ? Math.min(...bounds.map((bound) => bound.y)) : 0
    const maxX = bounds.length ? Math.max(...bounds.map((bound) => bound.x + bound.width)) : 1
    const maxY = bounds.length ? Math.max(...bounds.map((bound) => bound.y + bound.height)) : 1
    const actualDx = Math.max(-minX, Math.min(1 - maxX, dx))
    const actualDy = Math.max(-minY, Math.min(1 - maxY, dy))
    if (!actualDx && !actualDy) return
    const after = before.map((annotation) =>
      annotationSchema.parse({
        ...translateAnnotation(annotation, actualDx, actualDy),
        lastModifiedBy: 'human',
        updatedAt: new Date().toISOString(),
      }),
    )
    await get().commit(before, after, 'Move annotations')
  },

  deleteAnnotations: async (ids, label = 'Delete annotation') => {
    const idSet = new Set(ids)
    const before = get().annotations.filter((annotation) => idSet.has(annotation.id))
    if (!before.length) throw new Error('No matching annotations were found.')
    await get().commit(before, [], label)
    const remainingSelectedIds = get().selectedAnnotationIds.filter((id) => !idSet.has(id))
    if (remainingSelectedIds.length !== get().selectedAnnotationIds.length) {
      set({
        selectedAnnotationIds: remainingSelectedIds,
        selectedAnnotationId: remainingSelectedIds[0] ?? null,
        annotationDrag: null,
      })
    }
  },

  undo: async () => {
    const entry = get().history.at(-1)
    if (!entry) return
    await persistChange(entry.after, entry.before)
    set((state) => ({
      annotations: applyChangeToList(state.annotations, entry.after, entry.before),
      history: state.history.slice(0, -1),
      future: [...state.future, entry],
      toast: `Undo ${entry.label.toLowerCase()}`,
    }))
  },

  redo: async () => {
    const entry = get().future.at(-1)
    if (!entry) return
    await persistChange(entry.before, entry.after)
    set((state) => ({
      annotations: applyChangeToList(state.annotations, entry.before, entry.after),
      history: [...state.history, entry],
      future: state.future.slice(0, -1),
      toast: `Redo ${entry.label.toLowerCase()}`,
    }))
  },

  indexDocument: async (loadedPdf) => {
    const document = get().activeDocument
    if (!document) return
    const { extractPageText, loadPdf } = await import('./pdf.client')
    const pdf = loadedPdf ?? await loadPdf(document.blob)
    try {
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        if (get().activeDocument?.id !== document.id) break
        const existing = await db.textPages.get([document.id, pageNumber])
        if (!existing) {
          const text = await extractPageText(pdf, pageNumber)
          await db.textPages.put({ documentId: document.id, pageNumber, text })
        }
        await db.documents.update(document.id, { indexedPages: pageNumber })
        set((state) => ({
          activeDocument:
            state.activeDocument?.id === document.id
              ? { ...state.activeDocument, indexedPages: pageNumber }
              : state.activeDocument,
        }))
        await new Promise<void>((resolve) => window.setTimeout(resolve, 8))
      }
    } finally {
      if (!loadedPdf) await pdf.cleanup()
    }
  },

  loadOutline: async (pdf) => {
    const document = get().activeDocument
    if (!document || get().outline) return
    const { readOutline } = await import('./pdf.client')
    const outline = await readOutline(pdf)
    if (get().activeDocument?.id === document.id) set({ outline })
  },
}))

export function useEditorStore<T>(selector: (state: EditorState) => T) {
  return useStore(editorStore, selector)
}
