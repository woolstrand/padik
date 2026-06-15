# Padik — Copilot Project Guide

> Auto-loaded context for every Copilot request in this repository.
> Keep it short. Deep, subsystem-specific knowledge lives in linked files — read the
> relevant one **before** changing that subsystem.

## What this project is

Padik is a prototype **LLM-driven textual roleplay game**. The player is a participant in a
scene, but not an event driver. Each turn, autonomous NPCs react, a neutral arbiter resolves what physically happens, a narrator turns that into prose, and a scene tracker updates the world state. All LLM-facing text is in `engine/src/prompts.ts`; the model runs locally via LM Studio.

```
padik/
├── engine/   TypeScript / Express game engine (the brain)
├── ui/       React / Vite frontend (chat-style client)
└── userdata/ Story content as JSON (world + NPCs)
```

## Turn data flow (the heart of the system)

```
player action
   ↓
NPC steps (one per NPC, sequential)      → each NPC's thoughts + actions
   ↓
SceneProcessor                            → neutral factual outcome ("what happened")
   ↓
Narrator                                  → artistic prose shown to the player (streamed)
   ↓
SceneManager update                       → new factual scene state for next turn
```

The `Orchestrator` builds this pipeline fresh each turn and routes typed inputs/outputs
between isolated steps. Prompts are rebuilt from scratch every turn (only NPC *thoughts* and
the factual scene state persist) to keep LLM token usage low.

## Core conventions

- **TypeScript everywhere**, ES modules, strict typing. No `any` unless unavoidable.
- **Dependency injection**: classes receive collaborators via constructor params. The only
  composition root is `engine/src/index.ts`. No singletons/globals elsewhere.
- **`ILlmClient` abstraction**: simulation modules depend on the interface, never on `LlmClient`.
- **Prompts are data**: never inline prompt strings in logic files — add/edit them in
  `engine/src/prompts.ts`. Tunables go in `engine/src/constants.ts`.
- **Engine and UI share duplicated types**: `engine/src/types.ts` and `ui/src/types.ts` must be
  kept in sync by hand (there is no shared package).
- **Narrative/UI text is Russian**; code, identifiers, and comments are English.

## Subsystem reference docs

Read the matching doc before working in that area, and **update it in the same change** when
you alter that subsystem's behavior, contracts, or structure.

| Area | When you touch… | Doc |
|------|-----------------|-----|
| Turn pipeline, Orchestrator, steps, checkpoints/retry | `engine/src/engine/Orchestrator.ts`, `engine/src/engine/steps/**` | [docs/architecture/engine-core.md](../docs/architecture/engine-core.md) |
| LLM client, prompts, model config, streaming | `engine/src/llm/**`, `prompts.ts`, `constants.ts` | [docs/architecture/llm-layer.md](../docs/architecture/llm-layer.md) |
| NPC / Narrator / SceneProcessor / SceneManager | `engine/src/engine/NpcProcessor.ts`, `Narrator.ts`, `SceneProcessor.ts`, `SceneManager.ts` | [docs/architecture/simulation.md](../docs/architecture/simulation.md) |
| HTTP server, endpoints, story loading | `engine/src/index.ts` | [docs/architecture/server-api.md](../docs/architecture/server-api.md) |
| React UI, components, SSE consumption | `ui/src/**` | [docs/architecture/ui.md](../docs/architecture/ui.md) |
| Debug panel & debug data capture | `engine/src/engine/NpcDebugHelper.ts`, `ui/src/components/DebugPanel.tsx` | [docs/architecture/debug.md](../docs/architecture/debug.md) |
| Story JSON format | `userdata/stories/**` | [docs/architecture/story-data.md](../docs/architecture/story-data.md) |

Known architecture/code-quality issues and their severity:
[docs/architecture/ISSUES.md](../docs/architecture/ISSUES.md).

## Working agreements for the agent

- Prefer small, localized edits that respect the existing DI + pipeline structure.
- When adding a pipeline step, follow the `PipelineStep` pattern and wire it only in
  `Orchestrator.buildPipeline`.
- When changing a type in `engine/src/types.ts`, mirror it in `ui/src/types.ts` (and vice versa).
- When changing LLM behavior, edit `prompts.ts`/`constants.ts`, not the module logic.
- After changing any subsystem, update its reference doc above so this guide stays accurate.
- Build checks: `cd engine && npm run build` and `cd ui && npm run build`.
```