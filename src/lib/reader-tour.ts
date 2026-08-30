import type { EditorTool } from '#/lib/editor-store.client'

/**
 * The reader tour runs exactly once per browser. Bumping the suffix is how a
 * future rewrite re-introduces itself without re-nagging people who have
 * already taken this one.
 */
export const readerTourStorageKey = 'mimir:reader-tour/v1'

export function hasSeenReaderTour() {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(readerTourStorageKey) !== null
  } catch {
    // Treat unreadable storage as "already seen" rather than showing the tour
    // on every single open in private browsing.
    return true
  }
}

export function markReaderTourSeen() {
  try {
    window.localStorage.setItem(readerTourStorageKey, new Date().toISOString())
  } catch {
    // The tour still ends for this session when storage is unavailable.
  }
}

/** What a step needs to know to pick its target, its nudge, and its exit. */
export type TourContext = {
  tool: EditorTool
  sidebarOpen: boolean
  chatOpen: boolean
}

export type TourStep = {
  id: string
  title: string
  /** Prose for the card. Shortcuts wrapped in brackets render as key caps. */
  body: string
  /** A CSS selector for the element to spotlight, or null for a centered card. */
  target?: (context: TourContext) => string
  side?: 'top' | 'bottom' | 'left' | 'right'
  align?: 'start' | 'center' | 'end'
  padding?: number
  radius?: number
  /** The invitation to actually touch the thing, shown until `done` turns true. */
  hint?: (context: TourContext) => string | null
  /** Satisfied by doing, not by clicking Next. Advances the tour on its own. */
  done?: (context: TourContext) => boolean
}

export const readerTourSteps: Array<TourStep> = [
  {
    id: 'welcome',
    title: 'Welcome to mimir',
    body: 'Your document is open and everything about it stays on this device. Here is a quick lap around the desk — about thirty seconds.',
  },
  {
    id: 'toolbar',
    title: 'Your marking tools',
    body: 'Highlight, underline, draw, drop a note, or box something in. The swatch on the right sets the color, and the grip on the left moves this tray wherever you like it.',
    target: () => '[data-tour="toolbar"]',
    side: 'bottom',
    padding: 8,
    radius: 18,
    hint: () => 'Pick a tool, or just press [H]',
    done: (context) => context.tool !== 'select' && context.tool !== 'pan',
  },
  {
    id: 'navigator',
    title: 'Find your place',
    body: 'Every page as a thumbnail, plus the document’s own outline. Click either one to jump straight there.',
    target: (context) => (context.sidebarOpen ? '[data-tour="navigator"]' : '[data-tour="navigator-open"]'),
    side: 'right',
    align: 'start',
    padding: 6,
    hint: (context) => (context.sidebarOpen ? null : 'It’s tucked away — open it up'),
    done: (context) => context.sidebarOpen,
  },
  {
    id: 'search',
    title: 'Search the whole document',
    body: '[⌘F] finds a phrase across every page at once, not just the one you are looking at.',
    target: () => '[data-tour="search"]',
    side: 'bottom',
    align: 'end',
    padding: 4,
    radius: 12,
  },
  {
    id: 'chat',
    title: 'Ask mimir',
    body: 'Your reading partner. It can read this document, quote it back with page numbers, and mark it up alongside you — every action undoable.',
    target: () => '[data-tour="chat"]',
    side: 'bottom',
    align: 'end',
    padding: 4,
    radius: 12,
    hint: () => 'Open it and say hello',
    done: (context) => context.chatOpen,
  },
  {
    id: 'export',
    title: 'Take your work with you',
    body: 'Export a flattened PDF with your marks drawn in, or the annotation sidecar — plain JSON you can re-import here later.',
    target: () => '[data-tour="export"]',
    side: 'bottom',
    align: 'end',
    padding: 4,
    radius: 999,
  },
  {
    id: 'finish',
    title: 'That’s the whole tour',
    body: 'Nothing here leaves your device. [⌘Z] undoes anything, [Space] pans the page, and [Esc] always brings you back to select. Happy reading!',
  },
]
