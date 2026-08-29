import '@tanstack/react-start/client-only'
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { db, type DocumentRecord } from './db.client'
import { getDocumentSlug } from './document-route'
import {
  annotationSchema,
  type Annotation,
  type AnnotationAuthor,
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

interface EditorState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  documents: Array<DocumentRecord>
  activeDocument: DocumentRecord | null
  annotations: Array<Annotation>
  selectedAnnotationId: string | null
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
  setZoom: (zoom: number) => void
  setRotation: (rotation: number) => void
  setSelectedAnnotation: (id: string | null) => void
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
  updateAnnotation: (
    id: string,
    patch: Partial<Annotation>,
    author?: AnnotationAuthor,
  ) => Promise<Annotation>
  deleteAnnotations: (ids: Array<string>, label?: string) => Promise<void>
  undo: () => Promise<void>
  redo: () => Promise<void>
  indexDocument: (loadedPdf?: PDFDocumentProxy) => Promise<void>
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
  selectedAnnotationId: null,
  tool: 'select',
  color: '#f5c84b',
  currentPage: 1,
  zoom: 1,
  rotation: 0,
  sidebarOpen: true,
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
      currentPage: document.lastPage,
      zoom: document.zoom,
      rotation: document.rotation,
      selectedAnnotationId: null,
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
      selectedAnnotationId: null,
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

  setTool: (tool) => set({ tool }),
  setColor: (color) => set({ color }),
  setCurrentPage: (currentPage) => {
    const pageCount = get().activeDocument?.pageCount ?? 1
    set({ currentPage: Math.max(1, Math.min(currentPage, pageCount)) })
  },
  setZoom: (zoom) => set({ zoom: Math.max(0.5, Math.min(3, zoom)) }),
  setRotation: (rotation) => set({ rotation: ((rotation % 360) + 360) % 360 }),
  setSelectedAnnotation: (selectedAnnotationId) => set({ selectedAnnotationId }),
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
    if (annotations.length === 1) set({ selectedAnnotationId: annotations[0]?.id ?? null })
  },

  updateAnnotation: async (id, patch, author = 'human') => {
    const before = get().annotations.find((annotation) => annotation.id === id)
    if (!before) throw new Error(`Annotation ${id} was not found.`)
    const after = annotationSchema.parse({
      ...before,
      ...patch,
      id: before.id,
      documentId: before.documentId,
      lastModifiedBy: author,
      updatedAt: new Date().toISOString(),
    })
    await get().commit([before], [after], 'Edit annotation')
    return after
  },

  deleteAnnotations: async (ids, label = 'Delete annotation') => {
    const idSet = new Set(ids)
    const before = get().annotations.filter((annotation) => idSet.has(annotation.id))
    if (!before.length) throw new Error('No matching annotations were found.')
    await get().commit(before, [], label)
    if (get().selectedAnnotationId && idSet.has(get().selectedAnnotationId!)) {
      set({ selectedAnnotationId: null })
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
}))

export function useEditorStore<T>(selector: (state: EditorState) => T) {
  return useStore(editorStore, selector)
}
