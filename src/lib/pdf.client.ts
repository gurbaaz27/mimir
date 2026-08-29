import '@tanstack/react-start/client-only'
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
} from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'

GlobalWorkerOptions.workerSrc = workerSrc

export interface PdfMetadata {
  pageCount: number
  title?: string
  author?: string
}

export async function fingerprintBlob(blob: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function createPdfLoadingTask(blob: Blob): Promise<PDFDocumentLoadingTask> {
  return getDocument({
    data: new Uint8Array(await blob.arrayBuffer()),
    enableXfa: false,
  })
}

export async function loadPdf(blob: Blob): Promise<PDFDocumentProxy> {
  return (await createPdfLoadingTask(blob)).promise
}

export async function readPdfMetadata(pdf: PDFDocumentProxy): Promise<PdfMetadata> {
  const metadata = await pdf.getMetadata().catch(() => null)
  const info = metadata?.info as { Title?: string; Author?: string } | undefined
  return {
    pageCount: pdf.numPages,
    title: info?.Title || undefined,
    author: info?.Author || undefined,
  }
}

export async function extractPageText(pdf: PDFDocumentProxy, pageNumber: number) {
  const page = await pdf.getPage(pageNumber)
  const content = await page.getTextContent()
  return content.items
    .filter((item): item is TextItem => 'str' in item)
    .map((item) => `${item.str}${item.hasEOL ? '\n' : ' '}`)
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export interface OutlineEntry {
  title: string
  /** Nesting depth, zero for a top-level section. */
  level: number
  pageNumber?: number
}

/**
 * Flatten a PDF's bookmark tree into readable entries with resolved page
 * numbers. Destinations that cannot be resolved keep their title and lose only
 * the page, so a partly broken outline still reads.
 */
export async function readOutline(pdf: PDFDocumentProxy): Promise<Array<OutlineEntry>> {
  const items = await pdf.getOutline().catch(() => null)
  if (!items?.length) return []

  const resolvePageNumber = async (destination: unknown) => {
    try {
      const resolved = typeof destination === 'string' ? await pdf.getDestination(destination) : destination
      const reference = Array.isArray(resolved) ? resolved[0] : undefined
      if (reference && typeof reference === 'object') return (await pdf.getPageIndex(reference)) + 1
    } catch {
      return undefined
    }
    return undefined
  }

  type OutlineNode = Awaited<ReturnType<PDFDocumentProxy['getOutline']>>[number]
  const walk = async (nodes: Array<OutlineNode>, level: number): Promise<Array<OutlineEntry>> => {
    const entries: Array<OutlineEntry> = []
    for (const node of nodes) {
      entries.push({ title: node.title, level, pageNumber: await resolvePageNumber(node.dest) })
      if (node.items?.length) entries.push(...(await walk(node.items, level + 1)))
    }
    return entries
  }

  return walk(items, 0)
}
