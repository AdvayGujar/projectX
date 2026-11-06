# ProjectX

Local-first AI workspace for iOS and Android. Bring your own provider key, organise chats
into projects, read PDFs, keep documents/images/links in a project library, and generate
presentations, spreadsheets, PDFs, and Word documents.

Architecture and scope: `plan.md`.
Engineering rules: `AGENTS.md`.

## Status

- **M0, M1, and M2 are complete.** 321 tests pass: core 196, ui 14, mobile 111.
  `pnpm typecheck` passes.
- **M2 includes:** session/project storage, PDF extraction and chunking, FTS, projects and
  session actions, project instructions, the project library (files, images, summary-first
  web links), project retrieval, project document attachments, OS viewers, and drawer search.
- **Verified on device (2026-11-06):** iOS 27.2 simulator and the `ProjectX_Pixel` Android
  emulator. Home, projects, project detail, library, search, file opening, and the session
  menu render. Android without an installed PDF viewer uses the share sheet, as intended.
- **Known gaps:** DOCX/XLSX/PPTX text extraction is not wired yet (the files open through the
  OS viewer but the model cannot read them); full-page link reads wait for web search; artifact
  spec reading waits for M4. `pnpm lint` is still a placeholder in every package.

## Next: start at M3.1

M3 is read tools, citations, and memory v1. Begin with the tool registry:

1. Add `packages/core/src/tools/` with `list_files`, `read_document`, `read_sheet`,
   `search_documents`, and `get_artifact`. Use Zod schemas and return structured results;
   never throw from a tool.
2. Register them in `apps/mobile/src/services/turnPort.ts`, replacing the `noTools` executor.
3. Show tool activity in the existing `Thought` disclosure.
4. Then add page/slide/sheet citations with tap-to-page, followed by memory v1.

## Requirements

- Node 20+ and pnpm 12
- Xcode 27+ with an iOS simulator runtime (for iOS)
- Android SDK at `~/Library/Android/sdk` plus an emulator AVD
- JDK 21 (`brew install openjdk@21`); JDK 27 breaks Gradle 9.4 build scripts
- CocoaPods (iOS)

`scripts/android-env.sh` sets `ANDROID_HOME`, `JAVA_HOME`, and `PATH`. `pnpm android`
sources it automatically.

## Setup

```
pnpm install
pnpm android        # build and run the Android dev client
pnpm ios            # build and run the iOS dev client
pnpm ios:fast       # iOS only: build without code signing, install, launch (~10s warm)
```

Native modules require a development build; Expo Go is not supported.

`pnpm ios:fast` skips prebuild, pod install and Metro startup, so run `pnpm ios` once first and
keep `pnpm --filter @projectx/mobile start` running. It is simulator-only; device builds need
signing. Override the simulator with `IOS_DEVICE="iPhone 17" pnpm ios:fast`.

## Checks

```
pnpm typecheck
pnpm test
pnpm spike          # Node-side PPTX/XLSX/DOCX checks
pnpm fixture:pdf    # 300-page and 5-page PDF fixtures
```

Spike status and results: `spikes/README.md`.
Known failed approaches: `docs/FAILURES.md`.

## Layout

```
apps/mobile      Expo app, screens, native modules, spike harness
packages/core    pure TypeScript: engine, providers, tools, documents, artifacts, db
packages/ui      presentational components
spikes/          throwaway M0 checks
scripts/         Android environment helpers
```
