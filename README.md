# ProjectX

Local-first AI workspace for iOS and Android. Bring your own provider key, organise chats
into projects, read PDFs, keep documents/images/links in a project library, and generate
presentations, spreadsheets, PDFs, and Word documents.

Architecture and scope: `plan.md`.
Engineering rules: `AGENTS.md`.

## Status

- **M0, M1, M2, M3.1, and M3.2 are complete.** 384 tests pass: core 236, ui 24, mobile 124.
  `pnpm typecheck` passes. `pnpm lint` is still a placeholder in every package.
- **M3.1 includes:** `list_files`, `read_document`, `read_sheet`, `search_documents`, and
  `get_artifact`; DOCX/XLSX/PPTX/text extraction into chunks; tool activity in the Thought row.
- **M3.2 includes:** structured citations from read/search results, tappable source chips, and a
  cited-page sheet with Open file.
- **Known gaps:** the Think toggle does not send a reasoning field yet (M3.2a); web search and
  full-page reads are M3.2b; memory v1 is M3.3; artifact creation and versions wait for M4.
- **Verified on device (2026-11-06):** iOS 27.2 simulator and the `ProjectX_Pixel` Android
  emulator. Home, projects, project detail, library, search, file opening, and the session
  menu render. Android without an installed PDF viewer uses the share sheet, as intended.

## Next: M3.2a, then M3.2b

M3.1 and M3.2 are merged. The next work is:

1. **Reasoning control** — a neutral `ReasoningRequest`, per-model `canDisable`/effort
   capabilities, adapter mapping, and reasoning history for tool loops. Think off must send
   the provider's disable field, not just hide the block.
2. **Web search** — provider-native first (DeepSeek/Kimi raw search+fetch, Anthropic/OpenAI/
   Google/xAI/OpenRouter server tools, Groq browser search), then BYO third-party adapters
   (Brave, Tavily, Exa, Firecrawl, Parallel). No app-run search service.
3. **Then M3.3** — memory v1 (global/project memory, `update_memory`, budgeted context).

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
