# Engine core — turn pipeline & Orchestrator

> Read before editing `engine/src/engine/Orchestrator.ts` or `engine/src/engine/steps/**`.
> **Update this doc in the same change** when you alter the pipeline order, step contracts,
> game-state shape, or the checkpoint/retry/cancel behavior.

## Responsibility

The `Orchestrator` is the central data-flow coordinator. It owns the mutable game state and,
once per turn, builds and runs an ordered pipeline of isolated steps, routing each step's
typed output back into game state. It exposes blocking and streaming turn variants plus
retry/cancel.

It does **not** talk to the LLM directly and does **not** contain any prompt text — it only
wires steps together.

## Key files

| File | Role |
|------|------|
| `engine/src/engine/Orchestrator.ts` | State owner, pipeline builder, turn loop, checkpoints |
| `engine/src/engine/steps/NpcStep.ts` | One bound NPC per instance → `NpcOutput` |
| `engine/src/engine/steps/SceneProcessorStep.ts` | Player + NPC actions → factual outcome |
| `engine/src/engine/steps/NarrateStep.ts` | Factual outcome → prose (supports streaming) |
| `engine/src/engine/steps/SceneUpdateStep.ts` | Outcome + prose → new scene state |
| `engine/src/engine/steps/ObserveStep.ts` | Observe action → factual sensory description |
| `engine/src/types.ts` | `PipelineStep`, `GameState`, `NpcState`, `TurnStreamEvent`, etc. |

## Pipeline (rebuilt every turn)

**Normal pipeline:**
```
NPC steps (sequential, one per NPC) → SceneProcessorStep → NarrateStep → SceneUpdateStep
```

**Observation pipeline** (action type `'observe'`):
```
ObserveStep → NarrateStep → SceneUpdateStep
```
NPC steps and SceneProcessorStep are skipped entirely — the player is perceiving the scene,
not acting in it. `sceneProcessorHistory` is NOT updated so NPCs do not receive the
observation as "recent events" on the next turn. The observation outcome plays the role of
`sceneProcessorOutcome` for the Narrator and SceneManager.

- NPC steps run **sequentially** so each NPC sees the actions of NPCs already processed this
  turn (`otherNpcActions`).
- NPCs receive the **previous turn's SceneProcessor outcome** as "recent events" context
  (more factual than narrator prose), plus the current factual scene state.
- `SceneUpdateStep` must run **last**; it merges the factual outcome (primary) and the
  narrator prose (secondary) into the next scene state.

## Step pattern

Each step implements `PipelineStep<TInput, TOutput>` (`displayName` + `execute`). Inside
`Orchestrator.buildPipeline`, every step is wrapped into a `BoundStep` whose inputs are
captured by closure, so the turn loop is a plain iteration with no per-step branching.

Cross-step values that are produced and consumed within a turn (e.g. the SceneProcessor
outcome feeding the Narrator) are passed via small mutable boxes (`{ value: string }`) and a
live `npcOutputs` array. A `BoundStep` may add an optional `executeStream()` (used only by
`NarrateStep`) — when present, the streaming turn loop forwards its tokens as
`narrator:token` events.

**To add a step:** create a `PipelineStep` class under `steps/`, instantiate it once in the
`Orchestrator` constructor, and push a `BoundStep` for it in `buildPipeline` (or
`buildObservationPipeline`) at the correct position. Wire nothing elsewhere.

## Turn lifecycle

1. `saveCheckpoint(action)` snapshots narrative/scene-processor histories, a shallow copy of
   `npcStates`, `turnCount`, and the current scene state.
2. `sceneManager.ensureInitialized()` awaits the async first-turn scene init.
3. `buildPipeline(...)` → iterate steps (`execute` or `executeStream`).
4. Commit: push narrative + scene-processor outcome/reasoning, increment `turnCount`.

`processTurn` returns `TurnResult`; `processTurnStream` yields `step:start` / `step:done` /
`narrator:token` / `done` (and `error`) events. The two paths share `buildPipeline` but
duplicate the loop/commit logic — keep them consistent when editing.

## Checkpoint / retry / cancel

- `retryLastTurnStream()` restores the checkpoint and re-runs the last action with fresh LLM
  calls.
- `cancelTurn()` restores the checkpoint (used when the UI aborts a turn).
- `restoreCheckpoint()` also rolls back `NpcDebugHelper` (`rollbackToTurn`) and the
  `SceneStateManager` state.

Only one checkpoint (the most recent turn) is retained — retry/cancel are single-level.

## Gotchas

- Checkpoint copies of `npcStates` are **shallow** (`{ ...v }`); `lastActions`/`thoughts` are
  replaced rather than mutated in place, so this is currently safe — preserve that invariant.
- The Narrator input uses a getter for `sceneProcessorOutcome` so it reads the value set by
  the prior step at execution time, not at build time.
