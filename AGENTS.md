# ProjectX — Agent Instructions

Project rules for this repository. They take precedence over the global
`~/.config/opencode/AGENTS.md` where they conflict.

Architecture detail lives in `plan.md`. Read it before
changing providers, storage, artifacts, the engine, or native modules.

## Non-negotiables

1. The agent core is ours: no OpenCode, dsh, LangChain, or Vercel AI SDK at runtime.
2. No backend, accounts, or sync in v1. The app calls provider APIs directly.
3. `packages/core` is pure TypeScript — no React, React Native, Expo, or DOM imports.
4. API keys live only in Keychain/Keystore. They never enter SQLite, logs, or commits.
5. Artifact specs are the source of truth; preview and export consume the same spec.
6. Every commit is authored and committed by Advay. No AI attribution anywhere.
7. No shell, code execution, or remote workspace in v1.

## Architecture and module boundaries

```
apps/mobile  →  packages/ui  →  packages/core
apps/mobile  →  packages/core
packages/core → no app, ui, or platform imports
```

- `packages/core` owns the engine, providers, tools, documents, artifacts, memory, and
  storage. It must run in Node for tests.
- `packages/ui` owns presentational components. No data access, provider calls, or SQL.
- `apps/mobile` owns screens, navigation, services, and native modules.

Domain modules:

```
core:    providers · engine · tools · documents · artifacts · memory · db
ui:      markdown · deck-preview · sheet-grid · doc-preview
mobile:  screens · services · native modules
```

Rules:

- Each module exposes one public entry point, `index.ts`. Everything else stays in
  `internal/` and is never imported across a module boundary.
- No circular dependencies. If two modules need each other, extract a contract or use
  an event.
- Depend on ports and interfaces, not concrete implementations. Ports live in
  `core/src/ports.ts`.
- Shared mutable state is forbidden. Use repositories, events, or explicit parameters.
- Singletons are limited to the DB connection, logger, and `TurnService`.
- Changing a provider, a file codec, or a screen must not require edits outside that
  module's public contract.

## TypeScript

- `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride` enabled.
- `unknown` plus Zod at every boundary: provider responses, file contents, DB JSON, user
  input. `any` is a build failure.
- Brand IDs (`ProjectId`, `SessionId`, `FileId`) so they cannot be mixed.
- Use discriminated unions for states and events. No boolean flags or stringly-typed
  modes.
- `readonly` for data crossing module boundaries.
- Explicit return types on exported functions.
- `import type` for type-only imports.
- No default exports except Expo Router route files.
- No `enum`; use unions or `as const` maps.
- `satisfies` for config objects.
- No non-null assertions unless the invariant is proven and commented.

## Functions and files

- Target 40 lines per function. 60 is the hard maximum; split before you reach it.
- Maximum 4 parameters. Group related arguments into an options object.
- Maximum 3 levels of nesting. Use guard clauses and early returns.
- One responsibility per function. If the name needs "and", split it.
- No boolean parameters that switch behaviour; use separate functions or a named mode.
- Keep files under 300 lines; split past 400.
- A component's render body stays under 80 lines; extract child components.
- Comments explain why, not what. TODOs state what is missing and why.

## Errors and async

- Use `AppError` with `code`, `message`, `userMessage`, `retryable`, and `cause`.
- Expected failures are typed errors; throw only for invariant violations.
- Never swallow errors and never use an empty catch.
- Map provider errors to readable messages; never surface raw bodies or keys.
- Tool failures return a structured error to the model; they do not crash a turn.
- Every async operation accepts an `AbortSignal` and checks it before and after awaits.
- No floating promises. `void` only when deliberately fire-and-forget, with a comment.
- Retry only network errors, 429, and 5xx, with exponential backoff and jitter.
- Every network and native call has a timeout.

## React Native

- Screens compose; they contain no business logic.
- No `fetch` or SQL in components. Data flows through services and repositories.
- Streaming lives in `TurnService`, never in component state.
- Zustand selectors only; never subscribe a component to the whole store.
- FlashList for lists over 20 items, stable keys, memoized rows.
- Only the streaming message re-renders; completed messages stay frozen.
- Derive state during render. Do not mirror props into state.
- Effects only for external synchronisation, with explicit dependencies.
- Respect safe areas, keyboard avoidance, 44pt hit targets, and Dynamic Type.
- No `console.*`; use the logger.
- No inline objects or functions in hot list paths unless measured.

## Storage and data

- SQLite is the source of truth for chats, metadata, and indexes. Files hold bytes.
- Migrations are append-only and numbered. Never edit a shipped migration.
- Wrap multi-row writes in a transaction.
- Parameterised queries only. No string-built SQL.
- Repositories own queries; UI and engine never write SQL.
- FTS tables are maintained by triggers and covered by tests.
- File paths resolve through the storage service; reject `..` and symlink escapes.
- Artifact versions are immutable. Edits create a new version.

## Providers and artifacts

- One adapter per wire protocol: `openai-chat`, `openai-responses`, `anthropic`, `google`.
- Adapters translate to and from internal types only. No provider types outside
  `providers/`.
- Every adapter handles streaming deltas, tool calls, usage, abort, 401, 429, and 5xx.
- Record SSE fixtures and test every path; unit tests never call live APIs.
- OpenCode Go sends `User-Agent` and `x-opencode-session`, and routes by model protocol.
- Spec schema changes require a version bump and a migration path for stored versions.
- Generation validates with Zod, then makes one repair attempt with the error list.
- Small edits are patches producing a new version, not full regeneration.
- Exporters sit behind `ArtifactExporter`; swapping a codec never touches the UI.
- Test exports by unzipping and asserting required parts, plus a manual open in
  PowerPoint, Keynote, Excel, or Word before release.

## Security

- Never ask for or accept an API key in chat. The user types keys directly into the app; the
  agent never sees the value. Refer to providers by name.
- If a key appears in a tool result or log, do not echo it. Tell the user to rotate it.
- Secrets: Keychain/Keystore only. Redact `authorization`, `x-api-key`, and key-like
  strings from logs and error reports.
- Treat provider responses and file contents as untrusted input.
- No telemetry or analytics by default, and no document content in logs or crash reports.
- No `eval`, `new Function`, or dynamic code execution.
- New dependencies need approval. Allowed licences: MIT, Apache-2.0, BSD.
- Pin versions, commit the lockfile, and use a single package manager.

## Testing and verification

- Core logic: Vitest with fake ports and recorded fixtures.
- UI behaviour: React Native Testing Library.
- Critical flows: Maestro — onboarding, import, chat, export.
- New behaviour and bug fixes require a test. Write the failing regression test first.
- Before every commit: typecheck, lint, tests.
- UI and native changes are verified on both iOS and Android.
- Never claim something works unless you ran it and saw it pass.

Performance budgets live in the plan (§14): cold start under 2 s, session open under
300 ms, 60 fps scroll, 30 fps streaming.

## Delegation

Standing instruction from the owner (2026-11-03). Keep the main session free for architecture,
decisions, and working directly with the owner. Delegate through subagents:

| Work | Model | Examples |
|---|---|---|
| Mechanical coding, repetitive edits, test runs | `opencode-go/beam-free` | renaming, formatting, fixture updates, running and reporting tests, repetitive file changes |
| Critical coding, design, debugging | `opencode-go/deepseek-v4.1-flash` | new modules, protocol logic, data-model changes, tricky failures, public contracts |
| Architecture, security, scope, final review | Main agent | decisions the owner must see and approve |

Rules:

- Subagents start with fresh context. Give them file paths, constraints, acceptance criteria,
  and the exact verification command. Never assume they know this conversation.
- Review every subagent result before accepting it. Run the verification yourself for any
  change that is load-bearing.
- Do not delegate the final decision on architecture, security, data loss, or scope.
- Never send API keys, tokens, or secrets to a subagent.
- If Beam is unavailable, use `opencode-go/deepseek-v4.1-flash` instead of blocking.
- If a task is small enough that delegation costs more than doing it, do it directly.
- Do not use a subagent to bypass a rule in this file.

## End of session

Standing instruction from the owner (2026-11-03). Before ending a work session:

1. Run `pnpm clean`. It stops the Android emulator, shuts down booted iOS simulators,
   deletes generated build output (`ios/build`, `android/app/build`, `android/build`,
   `.gradle`, `.cxx`, `dist`, `spikes/out`), prunes the pnpm store, and reports free space.
2. Stop any Metro/Expo process and any Gradle daemon still running.
3. Remove duplicate or orphan simulator runtimes and devices only after confirming they are
   unused. Ask before deleting pre-existing SDK components, AVDs, NDK versions, shared
   caches, `node_modules`, `ios/Pods`, or anything outside this repository.
4. Never delete source, docs, tests, or user data.
5. Report the before/after free space in the hand-off.

## Git

Hard rules:

- The only author and committer is Advay (`advaygujar`). Never set `GIT_AUTHOR_*`,
  `GIT_COMMITTER_*`, or pass `--author`.
- No AI attribution anywhere: no `Co-Authored-By`, no "Generated with", no tool, model,
  or assistant name in commit messages, PR bodies, branch names, code comments, or docs.
- Never rewrite history to change attribution. Never force-push without approval.

Commit messages:

- Imperative, specific, 72 characters maximum in the subject.
- Body only when the reason is not obvious: one to three short sentences on why.
- No emojis, no "misc", no "update files".
- Examples:
  - `add streaming SSE parser for OpenAI chat`
  - `fix deck export dropping speaker notes`
  - `split document extraction into per-format modules`

Commits:

- One logical change per commit. Keep refactors separate from features.
- No secrets, `.env`, build output, `node_modules`, or generated files.
- Branch names: `feat/…`, `fix/…`, `chore/…`, `docs/…`.

### Workflow

ProjectX-specific. Every change lands through a pull request; nothing is committed straight to
`master`.

1. Branch from an up-to-date `master`, using the prefix that matches the work.
2. Commit in logical units on the branch — not one commit for everything.
3. Push the branch and open a PR against `master`. The body follows the `pr` skill:
   Summary, Evidence, Merge Danger.
4. Merge once typecheck, lint, and tests pass. Squash by default so `master` stays linear.
5. Delete the branch afterwards, on the remote and locally.

This applies to documentation and one-line fixes too. If a change is worth making, it is worth
a branch.

## Definition of done

- Typecheck, lint, and tests pass with no new suppressions.
- New behaviour has a test; bug fixes have a regression test.
- No secrets, debug prints, dead code, or commented-out code.
- Module boundaries hold: no deep imports, no cycles, no codec leaking into core.
- Performance budgets are not regressed.
- Docs and the plan are updated when behaviour or architecture changes.
- UI and native changes verified on iOS and Android.

## Session start

1. Read `~/.dsh/LESSONS.md` and `docs/FAILURES.md` if present.
2. Read this file and the plan at `plan.md`.
3. Check `docs/FAILURES.md` before retrying an approach that previously failed.
4. If a task conflicts with these rules, stop and ask.

## Commands

Use the scripts in the root `package.json`. Expected names:

```
pnpm typecheck
pnpm lint
pnpm test
pnpm ios
pnpm android
```

Do not add a second package manager or a second lockfile.
