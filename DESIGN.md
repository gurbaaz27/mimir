# Design System

## Direction

A graduate student reading beneath bright library light for hours: the application chrome is cool and quiet, the page remains optically clean, and research marks are unmistakable. The interface is light-first, restrained, and instrument-like.

## Color

All authored tokens use OKLCH. The primary teal is reserved for action, selection, and focus. Annotation colors form a distinct semantic palette and never carry interface hierarchy.

- Background: `oklch(0.965 0.006 188)`
- Page: `oklch(1 0 0)`
- Surface: `oklch(0.985 0.004 188)`
- Ink: `oklch(0.235 0.018 188)`
- Muted ink: `oklch(0.47 0.025 188)`
- Primary: `oklch(0.50 0.105 188)`
- Primary soft: `oklch(0.92 0.035 188)`
- Copper signal: `oklch(0.58 0.13 55)`

## Typography

Inter Variable, bundled locally. A compact fixed product scale from 12–28px, tabular numerals for page controls, and no display typography in the workspace. Labels use sentence case. Long prose stays within 72ch.

## Layout

The reader is a full-height application shell with a 248px navigation rail, fluid central canvas, and optional 312px inspector. Panels collapse to drawers on tablet. The page uses an 8px spatial base with denser 4px increments inside toolbars.

## Components

Controls share 8–10px radii, visible 2px focus rings, 40px default touch targets, and complete hover/active/disabled/loading states. Cards are limited to true grouped objects; document rows and panels use dividers and surface shifts. Tooltips include keyboard shortcuts.

## Motion

State transitions use 150–200ms ease-out curves. Motion communicates panel state, selection, or task completion. Reduced-motion mode removes transforms and shortens transitions to near-instant crossfades.
