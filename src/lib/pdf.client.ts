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
