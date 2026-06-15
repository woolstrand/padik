# Simulation modules — NPC, SceneProcessor, Narrator, SceneManager, NpcStateManager

> Read before editing `engine/src/engine/NpcProcessor.ts`, `Narrator.ts`,
> `SceneProcessor.ts`, `SceneManager.ts`, `NpcStateManager.ts`, or `SessionLoader.ts`.
> **Update this doc in the same change** when you alter any module's inputs/outputs, parsing
> contract, or its place in the turn data flow.

These modules are the story "brain". Each LLM-using module depends only on `ILlmClient` and
pulls its text from `prompts.ts`. They are stateless except for `SceneStateManager` and
`NpcStateManager`, which hold the mutable scene and NPC state respectively. The
`Orchestrator` (see [engine-core.md](engine-core.md)) wires them via pipeline steps; these
classes know nothing about each other.

None of these modules read story config (`WorldConfig` / `NpcConfig`). The `SessionLoader`
bakes config into runtime state (`WorldRuntime`, `NpcInnerState`, initial scene state) before
the engine starts — see **SessionLoader** below.

## Data flow within a turn

```
NpcProcessor (×N)  → actions ─┐
                              ├→ SceneProcessor → factual outcome ─┬→ Narrator → prose
previous scene state ─────────┘                                    │
                                                                   └→ SceneManager.update → next scene state
```

## NpcProcessor (`NpcProcessor.ts`)

- One LLM call per NPC per turn; prompt built fresh from the NPC's `NpcInnerState` (immutable
  `persona` = character, traits, goals; mutable `mind` = prior thoughts), world style, scene
  state, the player action, and other NPCs' actions this turn.
- Parses the raw response on the `#ACTIONS#` token: text before = `thoughts` (kept between
  turns in the mind), lines after = `actions` (bullets stripped).
- Fallbacks: empty actions → `[NPC_DEFAULT_ACTION]`; missing separator → whole response
  treated as thoughts with `[NPC_CONFUSED_ACTION]`.
- Produces `NpcOutput { npcId, npcName, thoughts, actions }`; the Orchestrator writes the new
  thoughts/actions back into `NpcStateManager`.

## SceneProcessor (`SceneProcessor.ts`)

- The **neutral arbiter**: resolves what physically happens from the player action + all NPC
  actions against the current scene state. Strictly unbiased; commits outcomes rather than
  escalating.
- Its output is the single source of truth consumed by both the Narrator and the
  SceneManager, and becomes next turn's "recent events" context for NPCs.
- Optional reasoning pass gated by `SCENE_PROCESSOR_REASONING` (module-level const). When on,
  the response is split on `#OUTCOME#`: pre-separator text → `reasoning` (debug only),
  post-separator → `outcome`. Missing separator logs a warning and treats all as outcome.
- Returns `SceneProcessorResult { outcome, reasoning }`.

## Narrator (`Narrator.ts`)

- Turns the SceneProcessor's factual outcome into immersive prose for the player. **Adds no
  new facts.**
- Inputs: world config, capped narrative history, current scene state, factual outcome.
- Exposes both `narrate()` (blocking) and `narrateStream()` (token stream used by the
  streaming pipeline). Keep both in sync — they build identical messages.

## SceneStateManager (`SceneManager.ts`)

- A **stateful** module: holds a natural-language, strictly factual description of the scene
  (positions, poses, line-of-sight, inventory, **appearance, health**, environment) — no
  intentions/feelings (those live in `NpcStateManager`).
- Constructed with the **ready** initial scene state produced by the `SessionLoader`; it no
  longer touches story config and performs no async init. `getCurrentState()` is safe to read
  immediately.
- `update(sceneProcessorOutcome, narratorOutcome)` merges new events (factual outcome is
  primary, prose is supplementary) into the next state.
- `restoreState()` overwrites it during checkpoint rollback.

## NpcStateManager (`NpcStateManager.ts`)

- The **stateful** owner of every NPC's *inner* state across the session, mirroring
  `SceneStateManager` for the mental side. Holds, per NPC:
  - immutable `persona` (`id`, `name`, `character`, `traits`, `goals`), and
  - mutable `mind` (`thoughts` = inner monologue carried between turns, `lastActions`).
- Physical appearance, health and position are **not** tracked here — those belong to the
  factual scene state.
- `ids()` returns NPCs in turn order; `get(id)` reads inner state; `updateMind(id, thoughts,
  actions)` is called by the Orchestrator after an NPC acts; `snapshot()`/`restore()` back
  checkpoint rollback.

## SessionLoader (`SessionLoader.ts`)

- The intermediate component between story config and the live engine. Reads the raw
  `WorldConfig` + `NpcConfig[]` and returns an `EngineInitialState`:
  - `world` (`WorldRuntime`: setting, style, playerDescription),
  - `npcInnerStates` (immutable persona + mutable mind seeded from `initialMindset`),
  - `initialSceneState` (factual scene state built once via an LLM call from setting, player,
    and NPC **appearances** — using prompts in `loaderPrompts.ts`, kept apart from in-game
    prompts), and
  - `opening` (the opening narrative for the UI).
- After the loader runs, **no engine component references the raw config**.

## ObservationProcessor (`ObservationProcessor.ts`)

- Handles the `'observe'` player action. Called only by `ObserveStep`.
- Single LLM call with `observationSystemPrompt` + `observationUserPrompt` (in `prompts.ts`).
- Inputs: `worldConfig`, current `sceneState`, and the player's `focusText`.
- Output: a detailed, strictly factual sensory description of the player's focus area.
  Flows into the Narrator (prose) and SceneManager (state update) — see `ObserveStep` in
  [engine-core.md](engine-core.md) for pipeline placement.

## Conventions

- Never inline prompts here — all in-game text lives in `prompts.ts`; load-time text lives in
  `loaderPrompts.ts`.
- Separator tokens (`#ACTIONS#`, `#OUTCOME#`) are shared contracts with `prompts.ts`; change
  both sides together.
- These modules must remain ignorant of the Orchestrator, the HTTP layer, and each other.
