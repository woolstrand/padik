# Падик

> *Текстовая ролевая игра на основе LLM*
> Come to my padik, comrade.

A prototype LLM-based textual roleplay game set in a Soviet-era apartment courtyard.
Watch — or intervene — as a grumpy old lady tries to reclaim her beloved bench from a punk girl.

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
| **Наблюдать** | Examine something closely — NPCs don't react, revealed details are remembered |
| **Пропустить** | Watch without acting — the scene advances on its own |
| **Повторить** | Re-run the last turn with fresh LLM responses |
| **Стоп** | Cancel the turn currently being processed |

---

## Choosing and adding stories

On the main page, pick a story from the dropdown and press **Начать сессию** to start a fresh
session from that folder.  The last selected story is remembered across reloads and server
restarts.

Custom stories live in `userdata/stories/<story-id>/` and must contain:

- `world.json` — the setting, atmosphere, opening scene, and player description
- one or more NPC files named `npc_*.json`

See [docs/architecture/story-data.md](docs/architecture/story-data.md) for the full JSON
format.

---

## Configuration

All runtime settings are in [`engine/src/constants.ts`](engine/src/constants.ts):

```ts
export const LLM_BASE_URL = 'http://localhost:1234/v1';
export const LLM_MODEL    = 'local-model';   // model name shown in LM Studio
```

Change `LLM_MODEL` to match the identifier displayed in LM Studio's model selector.

---

## For developers & AI agents

Architecture and subsystem documentation lives under
[`.github/copilot-instructions.md`](.github/copilot-instructions.md) (auto-loaded by Copilot)
and [`docs/architecture/`](docs/architecture/).  Start there before changing the code.
