import '@tanstack/react-start/client-only'
import Dexie, { type EntityTable, type Table } from 'dexie'
import type { ChatClientPersistence, ChatPersistedState } from '@tanstack/ai-client'
import type { Annotation } from './annotations'

export interface DocumentRecord {
  id: string
  fingerprint: string
  name: string
  /** Stable, human-readable route segment for this local document. */
  routeSlug?: string
  size: number
  pageCount: number
  blob: Blob
  title?: string
  author?: string
  createdAt: string
  lastOpenedAt: string
  lastPage: number
  zoom: number
  rotation: number
  indexedPages: number
}

export interface TextPageRecord {
  documentId: string
  pageNumber: number
  text: string
}

export interface PreferenceRecord {
  key: string
  value: unknown
}

export interface ChatHistoryRecord extends ChatPersistedState {
  documentId: string
}

class MimirDatabase extends Dexie {
  documents!: EntityTable<DocumentRecord, 'id'>
  annotations!: EntityTable<Annotation, 'id'>
  textPages!: Table<TextPageRecord, [string, number]>
  preferences!: EntityTable<PreferenceRecord, 'key'>
  chatHistories!: EntityTable<ChatHistoryRecord, 'documentId'>

  constructor() {
    super('mimir-local')
    this.version(1).stores({
      documents: 'id,&fingerprint,lastOpenedAt',
      annotations: 'id,documentId,pageNumber,[documentId+pageNumber],updatedAt',
      textPages: '[documentId+pageNumber],documentId,pageNumber',
      preferences: 'key',
    })
    this.version(2).stores({
      documents: 'id,&fingerprint,lastOpenedAt',
      annotations: 'id,documentId,pageNumber,[documentId+pageNumber],updatedAt',
      textPages: '[documentId+pageNumber],documentId,pageNumber',
      preferences: 'key',
      chatHistories: 'documentId',
    })
  }
}

export const db = new MimirDatabase()

/** Stores one TanStack AI conversation per local PDF. */
export const chatPersistence: ChatClientPersistence = {
  async getItem(documentId) {
    const record = await db.chatHistories.get(documentId)
    if (!record) return null
    return {
      messages: record.messages,
      ...(record.resume ? { resume: record.resume } : {}),
    }
  },
  setItem(documentId, state) {
    return db.chatHistories.put({ documentId, ...state }).then(() => undefined)
  },
  removeItem(documentId) {
    return db.chatHistories.delete(documentId)
  },
}

export async function getStorageEstimate() {
  if (!navigator.storage?.estimate) return null
  return navigator.storage.estimate()
}
