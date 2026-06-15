# UI — React / Vite frontend

> Read before editing `ui/src/**`.
> **Update this doc in the same change** when you alter components, the API client, the
> streaming-event handling, or shared types.

## Responsibility

A chat-style client that renders the narrative, captures player input, streams turn progress,
and exposes a debug panel. It is a thin view over the engine API — it holds no game logic.

## Key files

| File | Role |
|------|------|
| `ui/src/App.tsx` | Top-level state + turn orchestration (stream consumption, retry/cancel) |
| `ui/src/api.ts` | Typed `fetch` wrappers + SSE stream parsers |
| `ui/src/types.ts` | Types **mirrored by hand** from `engine/src/types.ts` |
| `ui/src/components/NarratorOutput.tsx` | Scrollable narrative log + streaming/progress display |
| `ui/src/components/PlayerInput.tsx` | Textarea + Act/Say/Skip/Retry/Stop buttons |
| `ui/src/components/DebugPanel.tsx` | Debug panel (see [debug.md](debug.md)) |

## Data flow

`App` loads stories + initial state on mount. A turn calls `sendActionStream` (or
`retryActionStream`), an async generator yielding `TurnStreamEvent`s:

- `step:start` / `step:done` → set/clear the progress label.
- `narrator:token` → append to the streaming entry (live prose with a cursor).
- `done` → commit the narrative entry, update scene state/history, refresh debug data.
- `error` → throw → surfaced as an error banner.

Cancellation uses an `AbortController` stored in a ref; aborting removes the optimistic player
entry and calls `cancelTurn()` so server state matches.

## SSE parsing

`api.ts` reads the response body, decodes chunks, splits on `\n\n`, and `JSON.parse`s each
`data: ` line into a `TurnStreamEvent`. Keep this parser in sync with the server's event
format ([server-api.md](server-api.md)).

## Conventions

- **Types are duplicated**: any change to `engine/src/types.ts` that the UI consumes must be
  mirrored in `ui/src/types.ts`. There is no shared package.
- `PlayerActionType` is `'act' | 'say' | 'skip' | 'observe'`; `ChatEntry.type` includes
  `'player-observe'` mapped to the label "Наблюдение" in `NarratorOutput`.
- All user-facing strings are **Russian**; identifiers/comments stay English.
- Vite proxies `/api` → `http://localhost:3001` (`vite.config.ts`), so the client uses
  relative paths and avoids CORS in dev.
- Keep components presentational; turn/session logic stays in `App.tsx`.
