# Architecture & code-quality issues

> Catalogue of known issues, ranked by severity. For each issue the impact is rated along two
> axes that matter most for this project:
>
> - **(a) Expandability** — how much the issue slows adding stories, steps, or features.
> - **(b) AI-support cost** — how much it inflates the tokens/effort an AI agent needs to
>   understand and safely change the code (duplication, hidden coupling, missing contracts).
>
> Impact scale: ⬤ high · ◐ medium · ○ low. Update this file as issues are fixed or found.

---

## High severity

### H1 — Domain types duplicated between engine and UI ✅ RESOLVED
`ui/src/types.ts` is now a re-export layer: it re-exports all wire-format types from
`engine/src/types.ts` (the single source of truth) and defines only `ChatEntry` locally.
Engine-internal types (ILlmClient, PipelineStep, NpcConfig, NpcState, GameState, …) are not
re-exported. API response shapes (`GameStateSnapshot`, `StoryListResponse`) have been moved
to `engine/src/types.ts` and are used in `index.ts` to enforce the wire contract at compile time.

### H2 — Turn loop & commit logic duplicated in the Orchestrator ✅ RESOLVED
`processTurn` and `processTurnStream` now share `createTurnContext()` and `commitTurn()`
helpers. Both methods set up context, run the pipeline, then call `commitTurn` — the
history-push and `turnCount++` logic lives in exactly one place.

### H3 — SSE parsing duplicated in the API client
`sendActionStream` and `retryActionStream` in `ui/src/api.ts` contain identical reader/decode/
split-on-`\n\n` loops.
- (a) ◐ Any change to the event framing must be applied twice.
- (b) ◐ Redundant code to read and keep consistent.
- **Fix direction:** extract one `async function* readSseStream(res)` helper.

### H4 — A tunable lives in logic instead of `constants.ts`
`SCENE_PROCESSOR_REASONING` is a hardcoded module-level `const` in `SceneProcessor.ts`,
contradicting the "tunables go in `constants.ts`" convention.
- (a) ◐ Behavior flags hidden in modules are easy to miss when configuring a deployment.
- (b) ◐ Agents expect all tunables in one place; scattering them costs search time.
- **Fix direction:** move it to `constants.ts` and inject it.

---

## Medium severity

### M1 — "Isolated" steps actually communicate via shared mutable state ✅ RESOLVED
The mutable `{ value: string }` boxes, the live `npcOutputs` array, and the deferred
`sceneProcessorOutcome` getter have been replaced by a single `TurnContext` interface.
`buildPipeline` now accepts one `ctx: TurnContext` parameter; each step reads its inputs
and writes its outputs through `ctx` fields with clearly named types. Produce/consume
ordering is still sequential but is now documented by the field names rather than hidden
by box indirection.

### M2 — Parser contracts split between prompts and processors ✅ RESOLVED
`NPC_ACTIONS_SEPARATOR` (`#ACTIONS#`) and `SCENE_OUTCOME_SEPARATOR` (`#OUTCOME#`) are now
exported from `engine/src/constants.ts` and referenced in `prompts.ts`, `NpcProcessor.ts`,
and `SceneProcessor.ts`. Changing a separator token is now a single-file edit.

### M3 — Single mutable global session in the server
`index.ts` holds one `orchestrator` / `currentStoryId`; starting a session replaces it.
- (a) ◐ Blocks multi-session / multi-user expansion without a refactor.
- (b) ○ Simple to read today, but the global makes request handlers implicitly stateful.
- **Fix direction:** introduce a session registry keyed by session id when multi-user is needed.

### M4 — No automated tests
There are no unit/integration tests for parsing, pipeline ordering, checkpoint rollback, or SSE.
- (a) ◐ Refactors (e.g. the H/M items here) are risky without a safety net.
- (b) ◐ Agents cannot self-verify changes, so they over-read code to gain confidence.
- **Fix direction:** add focused tests for `NpcProcessor.parseResponse`, SceneProcessor split,
  checkpoint restore, and SSE framing.

### M5 — Dead / parallel API surface
`POST /api/action` (blocking) and `ui/src/api.ts:sendAction` exist but the UI uses only the
streaming variants.
- (a) ○ Extra surface to keep consistent with the streaming path.
- (b) ◐ Ambiguity over which path is canonical wastes agent reasoning.
- **Fix direction:** remove the unused blocking path, or document it as an intentional API.

---

## Low severity

### L1 — Fragile shallow checkpoint copy
`saveCheckpoint`/`restoreCheckpoint` shallow-copy `npcStates` (`{ ...v }`). This is safe only
because `thoughts`/`lastActions` are replaced (not mutated in place).
- (a) ○ A future in-place mutation would silently corrupt rollback.
- (b) ○ The invariant is undocumented at the mutation sites.
- **Fix direction:** deep-copy the per-NPC state, or document the immutability invariant locally.

### L2 — Extra round-trip for debug data
After each `done` event the UI calls `GET /api/debug` separately instead of receiving debug
data in the stream.
- (a) ○ Couples every turn to a follow-up request.
- (b) ○ Minor.
- **Fix direction:** include debug deltas in the `done` payload if the panel is open.

### L4 — No input/scale guards
No bound on player input length or per-turn LLM token budget beyond `LLM_MAX_TOKENS`.
- (a) ○ Larger stories/inputs can blow the context window unpredictably.
- (b) ○ Not an agent concern day-to-day.
- **Fix direction:** add input length limits and per-story context budgeting if scaling up.
