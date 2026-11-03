# M0 spikes

Throwaway checks that must pass before production modules are written.
See the plan (`plan.md`, §15) for the criteria.

## Run

```
pnpm spike                 # Node-side checks (PPTX, XLSX, DOCX)
pnpm fixture:pdf           # 300-page and 5-page PDFs for the app checks
pnpm mock:sse              # local SSE server for the streaming check
pnpm android               # build and run the in-app checks
```

Generated files land in `spikes/out/` (gitignored).

For the PDF check, push a fixture to the emulator and pick it from Downloads:

```
adb push spikes/out/large.pdf /sdcard/Download/large.pdf
```

On iOS, checks are driven by a file in the app's Documents folder. Custom URL schemes
trigger a system confirmation dialog, so they are not automated.

```
DEV=$(xcrun simctl list devices | grep "iPhone 18 Pro" | grep -oE "[0-9A-F-]{36}" | head -1)
CONTAINER=$(xcrun simctl get_app_container "$DEV" app.projectx.mobile data)
cp spikes/out/large.pdf "$CONTAINER/Documents/large.pdf"
echo pptx > "$CONTAINER/Documents/spike-action.txt"
xcrun simctl terminate "$DEV" app.projectx.mobile
xcrun simctl launch "$DEV" app.projectx.mobile
```

## Status

| # | Check | Where | Status | Notes |
|---|---|---|---|---|
| 1 | PDF extraction, 300 pages | app | **PASS** | release: 965 ms, 300 pages, 69,192 chars; +~170 MB peak PSS |
| 2 | Scanned PDF OCR | app | deferred | iOS Vision / ML Kit not wired; optional for v1 |
| 3 | pptxgenjs under Hermes | app | **PASS** | release: 62 ms, 12 slides |
| 4 | XLSX generation | app | **PASS** | release: 98 ms, 1,000 rows + formulas |
| 5 | expo-print HTML→PDF | app | **PASS** | release: 619 ms; file has 10 pages |
| 6 | docx generation | app | **PASS** | release: 31 ms, 8 sections |
| 7 | Streaming + providers | app | **PASS** | OpenCode Go live in release: first event 1.14 s, content ok; DeepSeek not tested |
| 8 | SQLite + list perf | app | partial | release: 50k rows, 866 ms total, 2 ms query; FPS inconclusive |

## App results

### Release build (Android 16, Pixel 10 AVD, 2026-11-02)

| Check | Result |
|---|---|
| PPTX | PASS — 62 ms |
| XLSX | PASS — 98 ms |
| DOCX | PASS — 31 ms |
| PDF | PASS — 619 ms |
| PDF read | PASS — 965 ms, 300 pages |
| SQLite | PASS — 866 ms total, 2 ms FTS5 query |
| DB module | PASS — 74 ms: migration, message, FTS hit |
| Streaming (mock) | blocked by cleartext policy (expected); debug PASS |
| Streaming (OpenCode Go) | **PASS** — first event 1.14 s, 1,242 ms total, content ok |
| List 5k | render 6 ms; FPS not measurable on this emulator |

### iOS release build (iPhone 18 Pro simulator, iOS 27.2, 2026-11-03)

| Check | Result |
|---|---|
| PPTX | PASS — 72 ms, 12 slides |
| XLSX | PASS — 113 ms, 1,000 rows + formulas |
| DOCX | PASS — 33 ms, 8 sections |
| PDF | PASS — 1,962 ms, 10 pages |
| PDF read | PASS — 186 ms, 300 pages, 68,891 chars |
| DB module | PASS — 20 ms: migration, message, FTS5 hit |

iOS is faster than Android for PDF extraction (PDFKit vs PDFBox) and reports the correct
page count from `expo-print`.

### Debug build

| Check | Result |
|---|---|
| PPTX | PASS — 148 ms |
| XLSX | PASS — 145 ms |
| DOCX | PASS — 88 ms |
| PDF | PASS — 1,030 ms |
| PDF read | PASS — 2.36 s, 300 pages |
| SQLite | PASS — 837 ms total, 17 ms query |
| Streaming (mock) | PASS — first event 695 ms, content ok |

### Notes

- `expo-print`'s `numberOfPages` is unreliable on Android (reports 1 for a 10-page file).
  Count pages from the generated PDF.
- `@op-engineering/op-sqlite` compiles FTS5 only when `package.json` has
  `"op-sqlite": { "fts5": true }`. The default is off. With pnpm, set it in both the app
  and the workspace root: the iOS podspec resolves the root package, Android resolves the app.
- PDF extraction with `extractTextWithInfo` adds ~170 MB PSS on a 300-page file.
  Extract page-by-page in production to cap peak memory.
- R8 release builds need `-dontwarn com.gemalto.jp2.**` for PDFBox's optional JPEG2000
  decoder. The config plugin `plugins/with-proguard-rules.js` applies it after prebuild.
- FPS cannot be measured on this headless emulator: Android Settings measures worse
  (105 ms median) than the app (53 ms). Measure a release build on a physical device.
- The release APK is 84 MB with all four ABIs; an AAB/split build will be much smaller.
- Release builds block cleartext HTTP, which is why the mock SSE test only runs in debug.
  Real providers use HTTPS.
- The live OpenCode Go test used a user-entered key with 1-day validity. It stayed in app
  memory only, was never written to disk, and was cleared by force-stopping the app.
  Re-running the check requires a fresh key.

## Bundle check (2026-11-02)

Android production bundle succeeds: 650 modules, 3.8 MB Hermes bytecode. All format
libraries (`pptxgenjs`, `xlsx`, `docx`), `op-sqlite`, and `expo-pdf-text-extract`
resolve under Metro without Node built-in failures. Runtime behaviour still needs the
emulator.

## Node results (2026-11-02)

| Check | Result |
|---|---|
| PPTX | PASS — 12 slides, 12 notes, 2 media; QuickLook renders the title slide |
| XLSX | PASS — 1,000 rows with formulas, 100 styled rows; QuickLook renders the grid |
| DOCX | PASS — 53 paragraphs, 1 table, 1 footer; QuickLook renders headings and table |

Caveats:

- Structural and QuickLook validation only. Open each file in PowerPoint/Keynote,
  Excel/Sheets, and Word/Pages before releasing.
- SheetJS formulas have no cached values, so previewers that do not calculate show
  blank cells until Excel/Sheets opens the file. Acceptable, but verify.
- `write-excel-file@4.1.1` drops `type: 'Formula'` cells. See `docs/FAILURES.md`.
