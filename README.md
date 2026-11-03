# ProjectX

Local-first AI workspace for iOS and Android. Bring your own provider key, organise chats
into projects, read PDFs and Office files, and generate presentations, spreadsheets, PDFs,
and Word documents.

Architecture and scope: `plan.md`.
Engineering rules: `AGENTS.md`.

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
```

Native modules require a development build; Expo Go is not supported.

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
