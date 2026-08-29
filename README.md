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

Mimir registers tools in two scopes. The app sets `Origin-Agent-Cluster: ?1` and `Permissions-Policy: tools=(self)` on all routes. In a compatible Chrome development build, enable `chrome://flags/#enable-webmcp-testing` or use the relevant origin trial.

**Library scope** — always registered, so an agent arriving at the home page has somewhere to start:

| Tool | Purpose |
| --- | --- |
| `list_documents` | The PDFs stored in this browser, with page counts and annotation counts |
| `open_document` | Open one in the reader by id or name, which registers the document tools |

**Document scope** — registered while a PDF is open:

| Tool | Purpose |
| --- | --- |
| `get_document_context` | Metadata, reading position, and how much text has been extracted |
| `get_document_outline` | Bookmark tree with resolved page numbers |
| `read_document_text` | Extracted text for a page or page range, with cursors |
| `search_document` | Page-numbered snippets; each result index is a read cursor |
| `navigate_document` | Scroll to a page or an annotation |
| `list_annotations` | Compact summaries by default, full records with geometry on request |
| `get_annotation_context` | The page text surrounding one mark |
| `create_annotations` | Up to 20 marks per call, quote-anchored where possible |
| `update_annotations` | Text, resolved state, and style, as one undo step |
| `delete_annotations` | Removal, scoped to the agent's own marks by default |
| `undo_last_change` | Revert the most recent change |
| `prepare_export` | Open the export panel for the reader to confirm |

Every tool publishes a JSON Schema generated from the Zod schema that validates its input, so what an agent reads is what it is held to, and failures come back as one readable sentence with a recovery hint rather than a serialized error.

Agent changes use the same transactional command path as human edits and remain undoable. Two behaviours are deliberately constrained: `delete_annotations` skips annotations the reader made unless `includeHumanAnnotations` is set, and `prepare_export` only opens the export panel — the reader has to click save.

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
