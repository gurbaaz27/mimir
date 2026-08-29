# Design System

## Direction

mimir is named for a Norse god who traded an eye for a drink from the well of wisdom, and the mark is that god drawn small and soft. The interface follows: white, quiet, and unfussy, with the logo's warmth rationed out in slivers. Paper is the only bright object on screen; everything else is hairlines, gray text, and space.

Brand line: **where ~~gods~~ humans and ai study together**. Lowercase throughout — the product name is `mimir`, never `Mimir`.

## Color

Authored in OKLCH. Surfaces are white first; text is a crisp near-black through gray. The logo's cream, clay, and bark appear only as accents — never as interface hierarchy. Action is expressed as ink-black, not as a brand hue. Annotation colors remain a separate semantic palette.

- Paper: `oklch(1 0 0)` · Background: `oklch(0.995 0.0015 90)`
- Surface: `oklch(0.978 0.0035 85)` · Sunken: `oklch(0.958 0.005 85)`
- Desk (reading surface behind the page): `oklch(0.966 0.008 85)`
- Ink: `oklch(0.205 0.008 60)` · Soft: `oklch(0.34 0.006 60)` · Muted: `oklch(0.545 0.006 60)` · Faint: `oklch(0.685 0.006 60)`
- Hairline: `oklch(0.918 0.004 75)` · Strong: `oklch(0.855 0.006 75)`
- Brand: cream `oklch(0.962 0.019 88)`, clay `oklch(0.705 0.028 72)`, bark `oklch(0.455 0.032 62)`
- Signal: moss `oklch(0.52 0.075 155)` for agent availability, danger `oklch(0.53 0.19 28)`

## Typography

Two families, both bundled locally so the app stays offline-capable.

- **Overused Grotesk** (variable, SIL OFL) for display: headlines, the wordmark, dialog titles. Tight tracking (−.03em to −.045em), weight 620–640.
- **Geist Variable** for everything else: UI labels, body copy, controls. Tabular numerals on page and zoom controls.

Marketing copy is lowercase and plain-spoken; product chrome stays sentence case. Prose stays within 46ch.

## Layout

The reader is a full-height shell: 54px topbar, 48px tool rail, then a fluid canvas with an optional 228px page navigator. There is no annotations sidebar — marks are edited on the page itself, and a floating selection bar carries only what a mark cannot express inline. The library is a 1000px column with a centered hero. 8px spatial base, 4px inside toolbars.

## Components

Buttons are pill-shaped with ink-black fills for primary action; icon buttons are 34px with 9px radii. Cards are reserved for true grouped objects — document rows use dividers and surface shifts. Focus rings are 2px ink at 2px offset. Tooltips carry keyboard shortcuts.

## Motion

Icons come from [lucide-animated](https://lucide-animated.com) (vendored under `src/components/icons`, MIT), driven by Motion. Lucide glyphs without an animated counterpart are wrapped in the same hover contract, so every icon behaves alike. The containing button owns the animation, so motion fires anywhere on the target rather than only over the glyph.

Presses scale to ~.92–.96 on a `cubic-bezier(.2,.9,.25,1)` spring. Panels, menus, and toasts enter over 130–200ms. Motion communicates state, never decoration. Reduced-motion mode collapses everything to near-instant.

## Accessibility

WCAG 2.2 AA, complete keyboard operation, non-color state cues, screen-reader labels on every control, and touch-friendly tablet annotation. Decorative icons are `aria-hidden`; the logo is an empty-alt image beside a real text wordmark.
