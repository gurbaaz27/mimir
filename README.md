# Mimir

Mimir is a private, local-first PDF workspace for students and researchers. It renders PDFs in the browser, stores structured annotations in IndexedDB, exports readable annotated PDFs and editable JSON sidecars, and exposes the active research workspace to browser agents through WebMCP.

## Run locally

```bash
bun install
bun run dev
```

Open `http://localhost:3000`. PDFs and annotations never leave the browser.

## Checks

```bash
bun run check
```

Individual commands are available as `bun run lint`, `bun run typecheck`, `bun run test`, and `bun run build`.

## WebMCP

Mimir registers tools dynamically while a PDF is open. The app sets `Origin-Agent-Cluster: ?1` and `Permissions-Policy: tools=(self)` on all routes. In a compatible Chrome development build, enable `chrome://flags/#enable-webmcp-testing` or use the relevant origin trial.

Available tools cover document context, paginated text reading, search, navigation, annotation listing/creation/update/deletion, and export preparation. Agent changes use the same transactional command path as human edits and remain undoable.

## Local data

- PDF blobs, annotations, and extracted text: IndexedDB database `mimir-local`
- Small interface preferences: `localStorage`
- No server database, uploads, auth, telemetry, or cloud sync

Deleting a document from the library also deletes its extracted text and Mimir annotations from IndexedDB.

## Key implementation notes

- PDF.js handles worker-based rendering and text extraction.
- App-created annotations use a versioned normalized-coordinate schema independent of PDF.js internals.
- PDF export uses PDF-LIB to draw annotations into original vector pages; sticky notes become numbered pins with a comments appendix.
- Existing embedded PDF annotation appearances are rendered by PDF.js and left intact in exported source files.
- OCR, signatures, stamps, collaboration, and editing imported native PDF annotations are intentionally outside v1.
