# Architecture and extension points

How the app is put together, and how to add to it without touching unrelated code.
Engineering rules live in `AGENTS.md`; this file is the map.

## Shape

```
apps/mobile  →  packages/ui  →  packages/core
apps/mobile  →  packages/core
packages/core → no app, ui, or platform imports
```

| Package | Owns | Must not |
|---|---|---|
| `packages/core` | providers, engine, database, tools, documents, artifacts, memory | import React, React Native, Expo, or the app |
| `packages/ui` | presentational components and theme tokens | fetch, read SQL, touch the keychain, navigate |
| `apps/mobile` | screens, navigation, services, stores, native modules | put business logic in components |

Data flows in one direction: a screen asks a service, the service uses core, the result
lands in a store, a `packages/ui` component renders it.

## Current tree

```
apps/mobile/
  app/                          Expo Router routes (default exports only here)
    _layout.tsx                 drawer + every <Drawer.Screen>
    index.tsx                   new chat / empty state
    session/[id].tsx            the session screen (composition point)
    projects.tsx  artifacts.tsx  settings.tsx
    dev/spike.tsx               M0 harness, hidden from the drawer
  src/
    db/client.ts                one op-sqlite connection, migrations first
    navigation/                 drawer content, openDrawer
    services/                   providerService · sessionQueries · turnService · keyStore · fileStorage · pdfExtractor · searchService
    state/                      modelStore · sessionStore · sessionsStore · useModelCatalog
    screens/                    shared screen scaffolding
    spike/                      throwaway M0 checks

packages/core/src/
  providers/                    four wire-protocol adapters + catalog + registry
  engine/                       turn loop, context assembly, streamed parts
  tools/                        read-tool contracts, Zod schemas, and scoped implementations
  documents/                    path policy, kind detection, file importer, chunking,
                                PDF extraction, office/text parsers, structured extraction
  db/                           schema, migrations, repositories (including artifacts), FTS
  paths.ts                      shared relative-path validation for db and documents
  ports.ts                      platform boundaries (file storage, PDF)

packages/ui/src/
  theme.ts  types.ts  icons.tsx
  markdown/ session/ composer/ drawer/ empty/ settings/ primitives/
```

## Recipes

### Add a UI feature

1. Create `packages/ui/src/<feature>/<Name>.tsx`.
   - Props in, callbacks out. No data access.
   - Style with `theme.ts` tokens, never literal colours.
2. Export it from `packages/ui/src/index.ts` — that barrel is the only public entry.
3. Mount it in the screen that owns the data, `apps/mobile/app/…`, passing props.
4. If it needs new data, add a query to `apps/mobile/src/services/*`, not to the component.

The last step is the one that matters: **a new UI feature edits exactly two files** — its own
component and the screen that composes it.

### Add a screen

1. `apps/mobile/app/<route>.tsx`, default export.
2. **Declare it in `app/_layout.tsx` with `<Drawer.Screen name="…" />`.** Expo Router 58 does
   not infer drawer screens from the file tree; an undeclared route renders a white screen.
3. If it is top level, add it to `DESTINATIONS` in `src/navigation/DrawerShell.tsx`.

### Import a file

1. Core owns the record and the path policy: `documents/paths.ts` builds
   `sessions/<sessionId>/files/<fileId>.<ext>` for a standalone chat and
   `projects/<projectId>/library/<fileId>.<ext>` for a project, the root
   `paths.ts` validates relative paths for both `db` and `documents`, and
   `documents/import.ts` copies through the `FileStoragePort` and writes the `files` and
   pending `documents` rows in one batch. A file is owned by a session or a project, never
   both; project-chat imports stay in the library when the chat is deleted.
2. `ImportFileInput` takes exactly one of `sessionId` and `projectId`. A session id derives
   the owner from the chat (a project chat still writes into the library); a project id
   verifies the project and imports directly into its library. Images have nothing to
   extract, so the importer marks them `ready` with `pageCount: 0` and no chunks.
3. The app supplies the port with `createAppFileStorage()` from
   `apps/mobile/src/services/fileStorage.ts`.
4. Picker URIs and file names never become paths. Core rejects `..`, absolute paths,
   backslashes, and control characters; the adapter only joins validated relative paths
   under `Paths.document`.
5. Deleting a project removes its rows by cascade, then the app removes
   `projects/<projectId>` through `FileStoragePort.removeDirectory`. A cleanup failure is
   returned as a warning, never thrown, so the deleted project is not restored.

### Add a project library item

1. Rows come from `files.listLibrary(projectId)` and `projectLinks.listByProject(projectId)`.
   `listLibrary` excludes link snapshots (`project_links.snapshot_file_id`), because the link
   row represents that page; the snapshot file is an implementation detail.
2. `apps/mobile/src/services/projectLibraryService.ts` merges the two lists newest first as
   `ProjectLibraryItem` (`{ kind: "file" } | { kind: "link" }`), and owns add/remove:
   - `addProjectFile` uses the importer with `projectId`.
   - `addProjectLink` uses `createProjectLinkImporter` with the platform web-fetch and file
     storage adapters. The URL is saved first; a fetch failure is stored on the link row.
   - Removing a file deletes the row and then its bytes. Removing a link deletes the link,
     then its snapshot row and bytes. Each returns a cleanup warning or null instead of
     throwing for a dirty sandbox.
3. The project screen loads the items with its other data, and the Library tab renders
   `ProjectLibraryPanel` (FlashList, stable file/link keys, one row per item).

### Extract a PDF

1. `PdfPort` lives in `packages/core/src/ports.ts`; the mobile adapter is
   `apps/mobile/src/services/pdfExtractor.ts` (`expo-pdf-text-extract`, 30 s timeout,
   abort checks around each native call).
2. `createPdfExtractionService` reads page by page, chunks 800–1200 tokens with ~15%
   overlap and never across pages, replaces `doc_chunks` in one transaction, and moves the
   document through `extracting` to `ready`, `error`, or back to `pending` on abort.
3. The existing `doc_chunks` FTS triggers do the indexing; query with
   `createSearchRepository(ctx).chunks(...)`. Only documents in `ready` are searchable, so a
   failed or aborted re-extraction keeps the last successful chunks but hides them from search.
4. `createStructuredExtractionService(ctx, storage)` handles DOCX, XLSX/CSV, PPTX, and text.
   It reads bytes or text through `FileStoragePort`, parses in core, and replaces chunks in
   one transaction. `ingestFile` dispatches by kind and returns the refreshed document row;
   unknown kinds are marked as an extraction error rather than left pending.
5. DOCX headings become sections and tables become pipe-separated rows. PPTX follows
   `presentation.xml` order and includes notes. XLSX keeps values and formula text and stores
   each row band's A1 range in `doc_chunks.section`; CSV goes through the same SheetJS reader.
6. `read_document`, `read_sheet`, and `search_documents` only read extracted chunks. A path
   is never accepted from the model, and every query is scoped to the chat's session and
   project library.

### Build project chat context

1. `createProjectContextRetriever(ctx).retrieve({ projectId, sessionId, query, maxTokens })`
   reads the project library and the current chat's own files. Other chats and other
   projects are excluded in SQL by `contextChunks`, `contextTotals`, and
   `listContextChunks`, so a caller cannot widen the scope by accident.
2. When the scoped `tokenTotal` fits `maxTokens`, every scoped chunk goes in. Otherwise the
   retriever takes the top FTS hits, adds each hit's ordinal neighbours, dedupes by chunk
   id, and fits the chars/4 budget. Only the final chunk is truncated.
3. The same call returns the project's newest 20 artifacts as metadata. Full spec reads
   belong to `get_artifact` in M4, so the catalog must not grow into a spec loader.
4. `turnPort.ts` resolves the model first, then loads the session and its project. A project
   chat retrieves with `maxTokens = max(1_000, min(8_000, floor(contextWindow * 0.25)))`,
   and `composeSystemPrompt(instructions, retrieved.text, retrieved.artifacts)` joins the
   non-empty sections — instructions, library, artifact catalog — with blank lines. A
   standalone chat, or a project with nothing to add, sends `""`.
5. The library text is already page-tagged (`[File: …, p.N]`) by the retriever. The turn does
   not load full artifact specs; that is `get_artifact` in M4.

### Attach a document in a project chat

1. The composer's `attach()` sends images down the existing picker-URI/vision path.
2. In a project chat, a document goes through `ingestFile({ sessionId, sourceUri, name,
   mime, size })`. The importer derives the project from the chat and writes the file into
   the project library, so it survives deleting the chat. The chip carries the library
   `fileId`, not the picker URI.
3. `ingestFile` runs the PDF extraction before returning. The chip is only added when the
   document did not end in `error`; a failed import still stays in the library, with a notice
   explaining that its text could not be read.
4. `send()` passes document chips as `{ fileId, name, mimeType }` in `TurnInput.documents`.
   The port writes one `attachment` part per document after the image parts, so transcript
   chip indices line up with the stored part order. `loadAttachment` returns the stored
   `fileId` for document parts, and the session screen opens them through the OS preview
   service.
5. A standalone chat has no library to read through, so it shows a notice that documents
   belong to a project instead of adding a chip. `attachmentProblem` blocks documents unless
   the caller passes `{ documentsAllowed: true }`, while image vision and size checks always
   apply.

### Cite a document read

1. Read tools attach `citations` to their `ToolOutcome`: file id, name, kind, and the page or
   section. The executor preserves them and the engine persists them inside the
   `tool_result` part, so no schema migration is needed.
2. `turnPort` forwards citations to the live sink; `sessionQueries` collects them when a chat
   is reopened. `mergeCitations` drops the same page/section read twice.
3. `citedCitations(text, citations)` scans the answer for `p.12`, `Slide 4`, or `Budget!C2`
   and resolves each token against the citations the turn actually read. Sheet references
   match any chunk range that contains the cited cell. Unknown references stay plain text.
4. `CitationChips` renders the resolved references as pressable pills under the answer.
   Android does not reliably deliver taps to a `Text` nested inside another `Text`, so inline
   chips were replaced with this row; a custom text layout can revisit inline placement.
5. Tapping a chip loads the matching chunks through `citationSource.loadCitationSource` and
   opens `CitationSheet`. The sheet shows the extracted page/section text and an Open file
   button for the original file; no bytes are loaded into the transcript.

### Open a stored file

1. `apps/mobile/src/services/filePreview.ts` is the only entry point. `openStoredFile(relativePath,
   mimeType)` resolves the URI through `createAppFileStorage().uriFor`, refuses a missing file,
   then asks `File.canPreview()`. A previewable file goes to `File.preview()` (Quick Look on
   iOS, an `ACTION_VIEW` intent on Android) and returns `"preview"`.
2. When the platform cannot preview it — Office formats, or no installed handler — the same
   call uses `Sharing.shareAsync(uri, { mimeType, dialogTitle: "Open in…" })` if
   `Sharing.isAvailableAsync()`, and returns `"shared"`. The file is handed off; nothing is
   copied out of the sandbox.
3. A missing file or a device with neither a viewer nor a share target throws an `AppError`
   with a `userMessage`, so callers show inline text rather than a dialog.
4. `openFileById(fileId)` loads the `files` row and delegates, so a caller only needs the id
   stored on a transcript part. Library rows call `openStoredFile(file.path, file.mime)` and
   link rows call `Linking.openURL`; both surfaces report failures through the same notice.
5. The session screen keeps the existing lazy base64 load for images and uses
   `AttachmentViewer`. Documents never load bytes in the app; they open through the OS.
6. Page-level jumps (`p.12`, `Slide 4`, `Sheet1!B2`) wait for citations in M3.
   `File.preview()` always opens at the start of the document, and neither platform exposes a
   page offset.

### Search the workspace from the drawer

1. `apps/mobile/src/services/searchService.ts` is the only drawer search entry point.
   `searchWorkspace(query)` returns no groups when `toFtsQuery` finds no terms, then runs
   `search.messages` and `search.chunks` in parallel with `limit: 20` through `getDbContext`.
2. `groupSearchHits(messages, chunks)` is pure and testable without a database. Message hits
   group by session (`title = sessionTitle`, `subtitle = projectName ?? "Chat"`); chunk hits
   group by file (`title = sourceTitle ?? fileName`, `subtitle = projectName ?? "File"`,
   `meta = page ? "p.<n>" : "Summary"`). The two hit lists are interleaved so chat matches
   cannot starve document results; relevance order is preserved within each, capped at 8 groups
   and 4 snippets per group.
3. `DrawerShell` debounces the field by 250 ms, clears results below two characters, and drops
   stale responses with a request id. `DrawerContent` swaps Recents for `DrawerSearchResults`
   whenever the query is non-empty; the field, destinations and account row stay in place.
4. FTS snippets mark matches with `[` and `]`; `DrawerSearchResults` splits on those markers so
   only the term is emphasised.
5. A message result closes the drawer and pushes `/session/[id]` with `focus: messageId`. The
   session screen passes `focus` to `SessionBody`; `Transcript` reports each row's `y` through
   `onTurnLayout`, and `SessionBody` scrolls to that row once. While the focus scroll is
   pending the content-size handler does not scroll to the end; once it fires, normal streaming
   resumes scrolling to the end.
6. A chunk result uses `Linking.openURL(sourceUrl)` for a project link summary and
   `openFileById(fileId)` for a stored file. Failures leave the drawer open and print the
   error inline through the same search error slot.

### Add a provider

1. Add a preset to `PRESETS` in `packages/core/src/providers/registry.ts`.
2. If it speaks an existing protocol (`openai-chat`, `openai-responses`, `anthropic`, `google`),
   stop — `createAdapter` already handles it.
3. Only a genuinely new wire format needs a new adapter file plus one `case` in
   `providers/adapterFactory.ts`.

### Add a tool

1. Create one module in `packages/core/src/tools/` using `defineTool`: a Zod `input`, an
   explicit `read`/`write` role, and an `execute` that returns `{ content, display }`.
   `content` is model-facing text; `display` is the short Thought line.
2. Register it in `createReadTools` (or a later write-tool registry).
3. Never throw for expected failures. `createToolExecutor` catches errors, validates input,
   caps output at 8k characters, and returns `isError` instead of crashing the turn.
4. Keep tool ids and scope checks in SQL: resolve the chat's project and files once, and never
   accept a path or an unscoped file id from the model.

The Thought disclosure reads the persisted `role` and `display` fields, so they belong on the
tool contract rather than being inferred from a name. A multi-step turn is one transcript row:
`loadSession` folds assistant/tool messages into one `ViewTurn`, and the live sink remaps each
assistant message onto the first row before adopting the final message id.

### Change the look

Everything visual comes from `packages/ui/src/theme.ts` — colours, radii, spacing, the type
scale. Components read tokens, so a re-skin is a one-file change. Remaining literal colours are
placeholders from the locked design and should move to tokens when the palette is decided.

### Replace the conversation engine

`turnService` is the only thing that runs a turn. A different engine means rewriting that one
service and keeping its exported signature (`sendTurn`, `stopTurn`, `SendTurnInput`).

## Extending without forking

**Turns.** `apps/mobile/src/services/turnPort.ts` defines a `TurnPort` (`send`, `stop`,
`isRunning`) and a `TurnSink` (`onUserTurn`, `onAssistantStart`, `onText`, `onReasoning`,
`onToolActivity`, `onCitations`, `onUsage`, `onTurnFinished`, `onSettled`, `onError`). The port resolves the
provider, key and model, supplies the read-tool registry, runs the engine, and reports through
the sink. It imports no store and no React. `onAssistantStart` carries the engine step so the
sink can keep one transcript row for a multi-step turn.

`services/turnService.ts` is the composition root: `createTurnPort(createSessionStoreSink())`.
A different shell supplies its own sink instead of importing the app's stores.

**Screens.** `app/session/[id].tsx` composes three sections from
`src/screens/session/` — `SessionTopBar`, `SessionBody`, `SessionComposerSection` — and owns
state plus the sheets. Adding a section means adding a component and one JSX line.

**Tests.** Two runners, split by what they can see:

| Runner | Where | Covers |
|---|---|---|
| Vitest | `packages/core`, `packages/ui` | engine, database, providers, pure markdown and formatting, module boundaries |
| Jest + jest-expo + RNTL | `apps/mobile` | component rendering, stores, turn maths |

Pure logic is extracted so it can be tested without a renderer: `packages/ui/src/markdown/parse.ts`,
`packages/ui/src/session/format.ts`, `apps/mobile/src/services/turnMath.ts`. Component tests
live in `apps/mobile` because that is where the Expo renderer is configured; they import
`@projectx/ui` directly.

```
pnpm test                                   # every package
pnpm --filter @projectx/ui test             # one package
pnpm --filter @projectx/mobile test         # jest
```

`packages/core/src/__tests__/boundaries.test.ts` enforces the module rules below by reading
the import graph; it fails CI if a deep import appears.

## Remaining weak seams

1. **No `internal/` split yet.** Modules are folders inside one package, so "only import the
   public entry" is enforced by `boundaries.test.ts` and review, not by structure.
2. **Two test runners.** Vitest for core/ui, Jest for mobile, because Expo's renderer preset
   only ships for Jest. Component tests therefore live in `apps/mobile` even when they assert
   `packages/ui` behaviour.

## Conventions worth repeating

- Optimize only after measuring a release build. Native code must clear a 30% improvement on a
  hot path and keep the plan's budgets; otherwise keep the simpler JS or platform path.
- Within JS, push filtering, sorting, counts, and search into SQLite; use indexed queries,
  batched reads/writes, `Promise.all`, FlashList, debounced search, and memoized selectors.
- Imported files are session-owned for standalone chats and project-owned for project chats;
  generated artifacts keep a project home. Projects aggregate through both.
- One public entry per module: `index.ts`.
- Discriminated unions over boolean flags; `readonly` on anything crossing a boundary.
- `unknown` + Zod at every external boundary (provider responses, DB JSON, file contents).
- Errors are typed `AppError`s with a `userMessage`; the UI shows text, never a raw body.
- No emoji anywhere; icons are SVGs from the single icon module.
- Every async call takes an `AbortSignal` and is cancellable.
