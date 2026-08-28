import '@tanstack/react-start/client-only'
import Dexie, { type EntityTable, type Table } from 'dexie'
import type { Annotation } from './annotations'

export interface DocumentRecord {
  id: string
  fingerprint: string
  name: string
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

class MimirDatabase extends Dexie {
  documents!: EntityTable<DocumentRecord, 'id'>
  annotations!: EntityTable<Annotation, 'id'>
  textPages!: Table<TextPageRecord, [string, number]>
  preferences!: EntityTable<PreferenceRecord, 'key'>

  constructor() {
    super('mimir-local')
    this.version(1).stores({
      documents: 'id,&fingerprint,lastOpenedAt',
      annotations: 'id,documentId,pageNumber,[documentId+pageNumber],updatedAt',
      textPages: '[documentId+pageNumber],documentId,pageNumber',
      preferences: 'key',
    })
  }
}

export const db = new MimirDatabase()

export async function getStorageEstimate() {
  if (!navigator.storage?.estimate) return null
  return navigator.storage.estimate()
}
