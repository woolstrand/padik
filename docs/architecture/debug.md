# Debug subsystem

> Read before editing `engine/src/engine/NpcDebugHelper.ts` or
> `ui/src/components/DebugPanel.tsx`.
> **Update this doc in the same change** when you change what debug data is captured or how
> it is displayed.

## Responsibility

Capture and display per-NPC reasoning and scene-state history for development/tuning, kept
strictly **separate** from game logic so neither `NpcProcessor` nor `GameState` is polluted
with debug concerns.

## Capture — `NpcDebugHelper` (engine)

- Owned by the `Orchestrator`; `record(...)` is called inside each NPC step with the turn
  number, the situation shown to the NPC (scene + player action), the NPC's thoughts, and its
  actions.
- Stores a `NpcDebugData { npcId, npcName, steps[] }` per NPC; each `NpcDebugStep` is one
  turn.
- `rollbackToTurn(fromTurn)` drops steps at/after a turn — called during checkpoint restore
  (retry/cancel) so debug history matches game state.
- Exposed via `GET /api/debug` (`Orchestrator.getDebugData()`).

Scene-state debug data (current `SceneManager` state + the `sceneProcessorHistory` /
`sceneProcessorReasoningHistory` arrays) travels through the normal `/api/state` and `done`
SSE payloads, not through `NpcDebugHelper`.

## Display — `DebugPanel.tsx` (UI)

- Collapsible side panel. Left: NPC list with per-NPC step counts. Right: that NPC's turns
  (newest first) showing situation, thoughts, actions.
- "Scene" section has two tabs: **Состояние** (current `SceneManager` state) and **История**
  (chronological SceneProcessor outcomes, with optional reasoning when
  `SCENE_PROCESSOR_REASONING` is enabled).

## Conventions

- Debug data must never feed back into game logic — it is read-only output.
- If you add a captured field, extend `NpcDebugStep`/`NpcDebugData` in **both**
  `engine/src/types.ts` and `ui/src/types.ts`, populate it in `NpcDebugHelper.record`, and
  render it in `DebugPanel`.
