# Падик

> *Текстовая ролевая игра на основе LLM*
> Come to my padik, comrade.

A prototype LLM-based textual roleplay game set in a Soviet-era apartment courtyard.
Watch — or intervene — as a grumpy old lady tries to reclaim her beloved bench from a punk girl.

---

## Architecture

```
padik/
├── engine/          # TypeScript / Express game engine
│   └── src/
│       ├── constants.ts          – hardcoded config values
│       ├── types.ts              – shared domain types + ILlmClient interface
│       ├── llm/
│       │   └── LlmClient.ts      – LLM interaction layer (wraps LM Studio API)
│       ├── engine/
│       │   ├── NpcProcessor.ts   – per-NPC prompt builder + response parser
│       │   ├── Narrator.ts       – story narrator
│       │   └── Orchestrator.ts   – data-flow coordinator
│       └── index.ts              – Express server + dependency wiring
├── ui/              # React / Vite frontend
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── api.ts                – typed fetch wrappers
│       └── components/
│           ├── NarratorOutput    – scrollable narrative log
│           └── PlayerInput       – textarea + Act / Say / Skip buttons
└── userdata/
    └── stories/
        └── padik/                # default story data
            ├── world.json
            ├── npc_babushka.json
            └── npc_punk.json
```

Custom stories live in `userdata/stories/<story-id>/` and should contain:

- `world.json`
- one or more NPC files named `npc_*.json`

On the main page, choose a story and confirm to start a fresh session from that folder.
The last selected story is persisted across reloads and server restarts.

### Design principles

* **Separation of concerns** — LLM layer, NPC processing, narration, orchestration, and UI are each their own module with a single responsibility.
* **Dependency injection** — every class receives its collaborators via constructor parameters; no singletons or globals except the composition root (`index.ts`).
* **Prompt-from-scratch** — each NPC prompt is built fresh every turn to keep LLM context usage low.  Only the NPC's previous *thoughts* are carried forward.

---

## Prerequisites

| Tool | Purpose |
|------|---------|
| [Node.js](https://nodejs.org) ≥ 18 | Runtime for engine and UI tooling |
| [LM Studio](https://lmstudio.ai) | Local LLM server (OpenAI-compatible API) |

---

## Quick start (macOS)

```bash
# 1. Install dependencies
bash scripts/setup.sh

# 2. Launch LM Studio, load a model, and start the local server on port 1234
#    (LM Studio → Local Server tab → Start Server)

# 3. Start the game
bash scripts/start.sh

# 4. Open http://localhost:5173 in your browser
```

---

## Manual start

```bash
# Terminal 1 — game engine (http://localhost:3001)
cd engine && npm install && npm run dev

# Terminal 2 — UI dev server (http://localhost:5173)
cd ui && npm install && npm run dev
```

---

## Gameplay

The scene opens on a bench outside a Soviet apartment block.
Катя (punk girl) is drinking beer on the bench.
Баба Нюра (grumpy old lady) has just stepped out of the building.

You are a bystander.  Each turn you can:

| Button | Effect |
|--------|--------|
| **Действие** | Describe a physical action your character takes |
| **Сказать** | Say something out loud |
| **Пропустить** | Watch without acting — the scene advances on its own |

---

## Configuration

All constants are in [`engine/src/constants.ts`](engine/src/constants.ts):

```ts
export const LLM_BASE_URL = 'http://localhost:1234/v1';
export const LLM_MODEL    = 'local-model';   // model name shown in LM Studio
```

Change `LLM_MODEL` to match the identifier displayed in LM Studio's model selector.
