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

### H1 — Domain types duplicated between engine and UI
`engine/src/types.ts` and `ui/src/types.ts` are maintained by hand with no shared package.
- (a) ⬤ Every type change is a two-file edit; silent drift breaks the wire contract.
- (b) ⬤ An agent must discover, read, and edit both files for any type change — pure token tax.
- **Fix direction:** extract a `shared/` package (or generate UI types from engine types) and
  import from one source of truth.

### H2 — Turn loop & commit logic duplicated in the Orchestrator
`processTurn` and `processTurnStream` share `buildPipeline` but each re-implement the
iterate-then-commit logic (history push, `turnCount++`).
- (a) ◐ New per-turn state must be wired in two places; easy to update one and forget the other.
- (b) ⬤ Agents must diff two near-identical blocks to find the intended change.
- **Fix direction:** have the blocking path consume the streaming generator, or factor a single
  `runPipeline`/`commitTurn` helper.

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

### M1 — "Isolated" steps actually communicate via shared mutable state
`buildPipeline` passes a long list of mutable boxes (`{ value: string }`), a live `npcOutputs`
array, and a getter, captured by closures. Steps claim to be decoupled but in practice share
Orchestrator-owned mutable state.
- (a) ◐ Adding/reordering steps requires understanding the implicit produce/consume timing.
- (b) ⬤ The indirection (boxes, getter reading "current" value) is non-obvious and costly to
  reason about safely.
- **Fix direction:** flow typed outputs through a per-turn context object passed step→step, or
  let each step return its output and have the loop thread it forward.

### M2 — Parser contracts split between prompts and processors
The separator tokens `#ACTIONS#` (NPC) and `#OUTCOME#` (SceneProcessor) are emitted by text in
`prompts.ts` and re-declared as string literals in the processor classes.
- (a) ◐ Changing a token means editing two files in lockstep.
- (b) ◐ The contract is implicit; an agent must cross-reference prompt + parser.
- **Fix direction:** export the separator constants from one module and reference them in both
  the prompt builder and the parser.

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
