# Simulation modules — NPC, SceneProcessor, Narrator, SceneManager

> Read before editing `engine/src/engine/NpcProcessor.ts`, `Narrator.ts`,
> `SceneProcessor.ts`, or `SceneManager.ts`.
> **Update this doc in the same change** when you alter any module's inputs/outputs, parsing
> contract, or its place in the turn data flow.

These four modules are the story "brain". Each depends only on `ILlmClient` and pulls its
text from `prompts.ts`. They are stateless except for `SceneStateManager`, which holds the
current scene state. The `Orchestrator` (see [engine-core.md](engine-core.md)) wires them via
pipeline steps; these classes know nothing about each other.

## Data flow within a turn

```
NpcProcessor (×N)  → actions ─┐
                              ├→ SceneProcessor → factual outcome ─┬→ Narrator → prose
previous scene state ─────────┘                                    │
                                                                   └→ SceneManager.update → next scene state
```

## NpcProcessor (`NpcProcessor.ts`)

- One LLM call per NPC per turn; prompt built fresh from NPC config, world, scene state,
  prior thoughts, the player action, and other NPCs' actions this turn.
- Parses the raw response on the `#ACTIONS#` token: text before = `thoughts` (kept between
  turns), lines after = `actions` (bullets stripped).
- Fallbacks: empty actions → `[NPC_DEFAULT_ACTION]`; missing separator → whole response
  treated as thoughts with `[NPC_CONFUSED_ACTION]`.
- Produces `NpcOutput { npcId, npcName, thoughts, actions }`.

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

- The only **stateful** module: holds a natural-language, strictly factual description of the
  scene (positions, poses, line-of-sight, inventory, environment) — no intentions/feelings.
- Initialized **asynchronously** in the constructor from world + NPC configs; callers must
  `ensureInitialized()` before the first turn (the Orchestrator does this).
- `update(sceneProcessorOutcome, narratorOutcome)` merges new events (factual outcome is
  primary, prose is supplementary) into the next state.
- `getCurrentState()` is a sync read (safe after init); `restoreState()` overwrites it during
  checkpoint rollback.

## ObservationProcessor (`ObservationProcessor.ts`)

- Handles the `'observe'` player action. Called only by `ObserveStep`.
- Single LLM call with `observationSystemPrompt` + `observationUserPrompt` (in `prompts.ts`).
- Inputs: `worldConfig`, current `sceneState`, and the player's `focusText`.
- Output: a detailed, strictly factual sensory description of the player's focus area.
  Flows into the Narrator (prose) and SceneManager (state update) — see `ObserveStep` in
  [engine-core.md](engine-core.md) for pipeline placement.

## Conventions

- Never inline prompts here — all text lives in `prompts.ts`.
- Separator tokens (`#ACTIONS#`, `#OUTCOME#`) are shared contracts with `prompts.ts`; change
  both sides together.
- These modules must remain ignorant of the Orchestrator, the HTTP layer, and each other.
