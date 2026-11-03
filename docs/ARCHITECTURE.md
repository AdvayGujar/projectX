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
    services/                   providerService · sessionQueries · turnService · keyStore
    state/                      modelStore · sessionStore · sessionsStore · useModelCatalog
    screens/                    shared screen scaffolding
    spike/                      throwaway M0 checks

packages/core/src/
  providers/                    four wire-protocol adapters + catalog + registry
  engine/                       turn loop, context assembly, streamed parts
  db/                           schema, migrations, repositories, FTS search

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

### Add a provider

1. Add a preset to `PRESETS` in `packages/core/src/providers/registry.ts`.
2. If it speaks an existing protocol (`openai-chat`, `openai-responses`, `anthropic`, `google`),
   stop — `createAdapter` already handles it.
3. Only a genuinely new wire format needs a new adapter file plus one `case` in
   `providers/adapterFactory.ts`.

### Add a tool

Tools are not built yet. When they are:
1. One module in `packages/core/src/tools/` exporting a definition: schema, `read`/`write` role,
   and an `execute` that returns a structured result.
2. Register it in the tool registry passed to the engine.
3. Never throw from a tool; return `{ isError: true }` so the turn survives.

The Thought disclosure already expects `read`/`write` roles, which is why the role belongs on
the tool definition rather than being inferred from its name.

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
`onUsage`, `onSettled`, `onError`). The port resolves the provider, key and model, runs the
engine, and reports through the sink. It imports no store and no React.

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

- One public entry per module: `index.ts`.
- Discriminated unions over boolean flags; `readonly` on anything crossing a boundary.
- `unknown` + Zod at every external boundary (provider responses, DB JSON, file contents).
- Errors are typed `AppError`s with a `userMessage`; the UI shows text, never a raw body.
- No emoji anywhere; icons are SVGs from the single icon module.
- Every async call takes an `AbortSignal` and is cancellable.
