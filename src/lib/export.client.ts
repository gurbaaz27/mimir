import '@tanstack/react-start/client-only'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import interFontUrl from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url'
import {
  annotationSidecarSchema,
  type Annotation,
  type AnnotationSidecar,
} from './annotations'
import { mergeTextQuads } from './annotation-geometry'
import type { DocumentRecord } from './db.client'

function parseColor(color: string) {
  const hex = color.replace('#', '')
  const normalized = hex.length === 3 ? hex.split('').map((value) => value + value).join('') : hex
  const value = Number.parseInt(normalized, 16)
  if (!Number.isFinite(value)) return rgb(0.15, 0.23, 0.23)
  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255)
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function buildSidecar(
  record: DocumentRecord,
  annotations: Array<Annotation>,
): AnnotationSidecar {
  return {
    schemaVersion: 1,
    app: 'mimir',
    appVersion: '0.1.0',
    document: {
      fingerprint: record.fingerprint,
      name: record.name,
      pageCount: record.pageCount,
    },
    exportedAt: new Date().toISOString(),
    annotations,
  }
}

export function exportSidecar(record: DocumentRecord, annotations: Array<Annotation>) {
  const sidecar = buildSidecar(record, annotations)
  const stem = record.name.replace(/\.pdf$/i, '')
  downloadBlob(
    new Blob([JSON.stringify(sidecar, null, 2)], { type: 'application/json' }),
    `${stem}-annotations.json`,
  )
}

export async function parseSidecar(file: File) {
  const parsed: unknown = JSON.parse(await file.text())
  return annotationSidecarSchema.parse(parsed)
}

function pagePoint(pageWidth: number, pageHeight: number, x: number, y: number) {
  return { x: x * pageWidth, y: (1 - y) * pageHeight }
}

export async function exportAnnotatedPdf(
  record: DocumentRecord,
  annotations: Array<Annotation>,
  onProgress?: (progress: number) => void,
) {
  const pdf = await PDFDocument.load(await record.blob.arrayBuffer())
  pdf.registerFontkit(fontkit)

  let embeddedFont
  try {
    embeddedFont = await pdf.embedFont(await fetch(interFontUrl).then((response) => response.arrayBuffer()), {
      subset: true,
    })
  } catch {
    embeddedFont = await pdf.embedFont(StandardFonts.Helvetica)
  }

  const byPage = new Map<number, Array<Annotation>>()
  for (const annotation of annotations) {
    const pageAnnotations = byPage.get(annotation.pageNumber) ?? []
    pageAnnotations.push(annotation)
    byPage.set(annotation.pageNumber, pageAnnotations)
  }

  const notes: Array<Extract<Annotation, { kind: 'note' }>> = []
  const pages = pdf.getPages()
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index]
    if (!page) continue
    const { width, height } = page.getSize()
    const pageAnnotations = byPage.get(index + 1) ?? []

    for (const annotation of pageAnnotations) {
      const color = parseColor(annotation.style.color)
      const opacity = annotation.style.opacity
      if (annotation.kind === 'markup') {
        for (const quad of mergeTextQuads(annotation.quads, annotation.markup !== 'highlight')) {
          const x = quad.x * width
          const y = (1 - quad.y - quad.height) * height
          if (annotation.markup === 'highlight') {
            page.drawRectangle({ x, y, width: quad.width * width, height: quad.height * height, color, opacity })
          } else {
            const lineY = annotation.markup === 'underline' ? y : y + quad.height * height * 0.48
            page.drawLine({
              start: { x, y: lineY },
              end: { x: x + quad.width * width, y: lineY },
              thickness: Math.max(1, annotation.style.strokeWidth ?? 1.5),
              color,
              opacity,
            })
          }
        }
      } else if (annotation.kind === 'ink') {
        for (const stroke of annotation.strokes) {
          for (let pointIndex = 1; pointIndex < stroke.length; pointIndex += 1) {
            const start = stroke[pointIndex - 1]
            const end = stroke[pointIndex]
            if (!start || !end) continue
            page.drawLine({
              start: pagePoint(width, height, start.x, start.y),
              end: pagePoint(width, height, end.x, end.y),
              thickness: annotation.style.strokeWidth ?? 2,
              color,
              opacity,
            })
          }
        }
      } else if (annotation.kind === 'shape') {
        if (annotation.bounds) {
          const { x, y, width: rectWidth, height: rectHeight } = annotation.bounds
          if (annotation.shape === 'ellipse') {
            page.drawEllipse({
              x: (x + rectWidth / 2) * width,
              y: (1 - y - rectHeight / 2) * height,
              xScale: (rectWidth * width) / 2,
              yScale: (rectHeight * height) / 2,
              borderColor: color,
              borderWidth: annotation.style.strokeWidth ?? 2,
              borderOpacity: opacity,
            })
          } else {
            page.drawRectangle({
              x: x * width,
              y: (1 - y - rectHeight) * height,
              width: rectWidth * width,
              height: rectHeight * height,
              borderColor: color,
              borderWidth: annotation.style.strokeWidth ?? 2,
              borderOpacity: opacity,
            })
          }
        } else if (annotation.start && annotation.end) {
          const start = pagePoint(width, height, annotation.start.x, annotation.start.y)
          const end = pagePoint(width, height, annotation.end.x, annotation.end.y)
          page.drawLine({
            start,
            end,
            thickness: annotation.style.strokeWidth ?? 2,
            color,
            opacity,
          })
          if (annotation.shape === 'arrow') {
            const angle = Math.atan2(end.y - start.y, end.x - start.x)
            const length = 10
            for (const offset of [-Math.PI / 6, Math.PI / 6]) {
              page.drawLine({
                start: end,
                end: {
                  x: end.x - length * Math.cos(angle + offset),
                  y: end.y - length * Math.sin(angle + offset),
                },
                thickness: annotation.style.strokeWidth ?? 2,
                color,
                opacity,
              })
            }
          }
        }
      } else if (annotation.kind === 'text') {
        const fontSize = annotation.style.fontSize ?? 12
        page.drawText(annotation.body || ' ', {
          x: annotation.bounds.x * width,
          // Text boxes are top-aligned in the editor. Their baseline must not
          // move when a user makes the box taller.
          y: (1 - annotation.bounds.y) * height - fontSize,
          maxWidth: annotation.bounds.width * width,
          size: fontSize,
          lineHeight: fontSize * 1.25,
          font: embeddedFont,
          color,
          opacity,
        })
      } else if (annotation.kind === 'note') {
        notes.push(annotation)
        const noteNumber = notes.length.toString()
        const point = pagePoint(width, height, annotation.point.x, annotation.point.y)
        page.drawEllipse({ x: point.x, y: point.y, xScale: 8, yScale: 8, color, opacity })
        page.drawText(noteNumber, {
          x: point.x - 3.2,
          y: point.y - 3.5,
          size: 8,
          font: embeddedFont,
          color: rgb(1, 1, 1),
        })
      }
    }
    onProgress?.((index + 1) / Math.max(1, pages.length + (notes.length ? 1 : 0)))
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
  }

  if (notes.length) {
    let appendix = pdf.addPage([612, 792])
    const drawHeading = () => {
      appendix.drawText('Comments', { x: 54, y: 738, size: 22, font: embeddedFont, color: rgb(0.1, 0.2, 0.2) })
    }
    drawHeading()
    let y = 700
    notes.forEach((note, index) => {
      const text = `${index + 1}. Page ${note.pageNumber}  ${note.body || 'Empty note'}`
      const lines = text.match(/.{1,82}(?:\s|$)/g) ?? [text]
      const requiredHeight = lines.length * 15 + 18
      if (y - requiredHeight < 52) {
        appendix = pdf.addPage([612, 792])
        drawHeading()
        y = 700
      }
      appendix.drawText(lines.join('\n'), {
        x: 54,
        y,
        size: 10.5,
        lineHeight: 15,
        maxWidth: 504,
        font: embeddedFont,
        color: rgb(0.12, 0.18, 0.18),
      })
      y -= requiredHeight
    })
  }

  const bytes = await pdf.save()
  const stem = record.name.replace(/\.pdf$/i, '')
  downloadBlob(new Blob([Uint8Array.from(bytes).buffer], { type: 'application/pdf' }), `${stem}-annotated.pdf`)
  onProgress?.(1)
}
