# Story data format

> Read before editing files under `userdata/stories/**` or the loading/validation code in
> `engine/src/index.ts`.
> **Update this doc in the same change** when you change the `WorldConfig` / `NpcConfig`
> shape or the folder contract.

The raw config files below are read **only** by the `SessionLoader`
(`engine/src/engine/SessionLoader.ts`), which bakes them into the engine's runtime state
(`WorldRuntime`, `NpcPersona` + `NpcMind`, and the initial factual scene state). Engine
components never see these config shapes directly — see
[simulation.md](simulation.md).

## Folder layout

```
userdata/
├── selected-story.json          { "storyId": "<id>" }  — persisted selection
└── stories/
    └── <story-id>/              id matches [a-zA-Z0-9_-]+
        ├── world.json           required (WorldConfig)
        └── npc_*.json           one or more (NpcConfig); loaded sorted by filename
```

A folder is a valid, listable story only if it contains `world.json` **and** at least one
`npc_*.json`. NPC turn order within a turn follows the sorted filename order.

## `world.json` → `WorldConfig`

| Field | Meaning |
|-------|---------|
| `setting` | Factual description of the place (baked into `WorldRuntime.setting`; fed to SceneProcessor / scene init). |
| `style` | Style/mood guidance for the Narrator and NPC prompts (baked into `WorldRuntime.style`). |
| `opening` | Opening narrative prose shown to the player as the first message (returned to the UI as `opening`). |
| `playerDescription` | Who the player is; used by the loader when building the initial scene state. |

## `npc_*.json` → `NpcConfig`

| Field | Meaning |
|-------|---------|
| `id` | Stable unique id (used as the `npcStates` / debug key). |
| `name` | Display name (shown in prose, debug, and as step `displayName`). |
| `appearance` | Physical appearance; seeds the **factual scene state** (SceneManager), not the NPC mind. |
| `character` | Personality / character description; seeds the immutable `NpcPersona`. |
| `traits` | String list of personality traits (immutable persona). |
| `goals` | String list of objectives driving behavior (immutable persona). |
| `initialMindset` | Seeds the NPC's mutable mind — its first-turn inner monologue. |

## Conventions

- Narrative content is **Russian**; JSON keys stay as defined in `engine/src/types.ts`.
- Keep `id` unique within a story and stable across edits (it keys persistent NPC state).
- Any schema change must be mirrored in `WorldConfig` / `NpcConfig` in
  `engine/src/types.ts`, reflected in the `SessionLoader` mapping, and validated in
  `index.ts`. Runtime types (`WorldRuntime`, `NpcPersona`, `NpcMind`) are the engine-facing
  side and are produced from these config shapes.
