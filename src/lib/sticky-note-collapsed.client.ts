import type { Annotation, NormalizedRect } from './annotations'
import { defaultNoteBounds, notePinBounds, notePinSizePx } from './annotation-geometry'

type NoteAnnotation = Extract<Annotation, { kind: 'note' }>

const stickyNoteCollapsedStoragePrefix = 'mimir:sticky-note-collapsed:'

/**
 * Whether a note is showing as a pin rather than an open panel.
 *
 * Collapsed state is per-reader, not part of the document, so it lives in
 * local storage rather than the annotation. Both the note layer and the
 * selection marquee need it — the marquee because a collapsed note's target is
 * the pin, not the panel it would open to.
 */
export function readStickyNoteCollapsed(id: string, fallback: boolean) {
  if (typeof window === 'undefined') return fallback
  try {
    const saved = window.localStorage.getItem(`${stickyNoteCollapsedStoragePrefix}${id}`)
    if (saved === 'true') return true
    if (saved === 'false') return false
  } catch {
    // The note still works for this session when storage is unavailable.
  }
  return fallback
}

export function persistStickyNoteCollapsed(id: string, collapsed: boolean) {
  try {
    window.localStorage.setItem(`${stickyNoteCollapsedStoragePrefix}${id}`, String(collapsed))
  } catch {
    // The note still works for this session when storage is unavailable.
  }
}

/** The panel a note opens to, defaulted for notes stored before bounds existed. */
export function noteExpandedBounds(
  annotation: NoteAnnotation,
  pageWidth: number,
  pageHeight: number,
  zoom: number,
): NormalizedRect {
  return annotation.bounds ?? defaultNoteBounds(annotation.point, pageWidth, pageHeight, zoom)
}

/**
 * Which side of the pin the panel is anchored to. Notes written before
 * `anchorRight` existed always stored the panel flush with the pin, so a panel
 * sitting left of its pin identifies one that was placed by the newer rule.
 */
export function noteAnchorRight(annotation: NoteAnnotation, pageWidth: number, zoom: number) {
  if (annotation.anchorRight !== undefined) return annotation.anchorRight
  if (!annotation.bounds) return false
  return annotation.bounds.x < annotation.point.x - (notePinSizePx * zoom) / pageWidth / 2
}

/**
 * What the reader can actually hit: the pin for a collapsed note, the panel for
 * an open one. Selection and drag clamping key off this rather than the stored
 * bounds, so a collapsed note can sit at the page edge its pin fits against.
 */
export function noteVisibleBounds(
  annotation: NoteAnnotation,
  pageWidth: number,
  pageHeight: number,
  zoom: number,
): NormalizedRect {
  return readStickyNoteCollapsed(annotation.id, annotation.resolved)
    ? notePinBounds(annotation.point, pageWidth, pageHeight, zoom)
    : noteExpandedBounds(annotation, pageWidth, pageHeight, zoom)
}
