# Server & HTTP API

> Read before editing `engine/src/index.ts`.
> **Update this doc in the same change** when you add/change an endpoint, alter the
> composition root, or change story loading/validation.

## Responsibility

`engine/src/index.ts` is the **composition root** and HTTP server. It wires every dependency
(the only place allowed to construct concrete classes), discovers and validates story
folders, holds the single live `Orchestrator`, and exposes the REST/SSE API consumed by the
UI.

## Composition root

`buildOrchestrator(storyId)` constructs a fresh `LlmClient`, the three processors
(`NpcProcessor`, `Narrator`, `SceneProcessor`), loads `world.json` + `npc_*.json` for the
story, and returns a new `Orchestrator`. Starting a session rebuilds the orchestrator,
discarding all prior game state. Constants come from `constants.ts`; never hardcode config
here.

## Story discovery & safety

- Stories live in `userdata/stories/<id>/`; a valid folder has `world.json` and at least one
  `npc_*.json`.
- `isValidStoryId` restricts ids to `[a-zA-Z0-9_-]+`; `getStoryFolderPath` resolves and
  verifies the path stays under the stories root (path-traversal guard). **Preserve both
  checks** on any new story-path code.
- Selected story id is persisted to `userdata/selected-story.json` and restored on boot
  (falling back to `DEFAULT_STORY_ID`, then the first available).

## Endpoints

| Method & path | Purpose |
|---------------|---------|
| `POST /api/action` | Process a turn (blocking) → `TurnResult`. |
| `POST /api/action/stream` | Process a turn as **SSE** (`step:*`, `narrator:token`, `done`, `error`). |
| `POST /api/action/retry/stream` | Roll back the last turn and re-run it (same SSE shape). |
| `POST /api/turn/cancel` | Restore the pre-turn checkpoint after a client abort. |
| `GET /api/state` | Current narrative/scene state snapshot + selected story. |
| `GET /api/stories` | List valid stories + selected id. |
| `POST /api/session/start` | Switch story, rebuild orchestrator, return fresh snapshot. |
| `GET /api/debug` | Per-NPC debug data (see [debug.md](debug.md)). |

## Conventions

- Validate `PlayerAction.type` (`act`/`say`/`skip`) and require `text` for non-skip actions
  before processing.
- SSE handlers set `text/event-stream` headers, `flushHeaders()`, write
  `data: <json>\n\n` per event, and always `res.end()` in `finally`.
- Errors are logged server-side and returned as a generic message (the UI surfaces "Is LM
  Studio running?"). Don't leak internals to the client.
- The server holds a single mutable `orchestrator`/`currentStoryId`; it is single-session by
  design (no per-user state).
