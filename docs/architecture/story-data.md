# Story data format

> Read before editing files under `userdata/stories/**` or the loading/validation code in
> `engine/src/index.ts`.
> **Update this doc in the same change** when you change the `WorldConfig` / `NpcConfig`
> shape or the folder contract.

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
| `setting` | Factual description of the place (fed to SceneProcessor / SceneManager). |
| `atmosphere` | Style/mood guidance for the Narrator and NPC prompts. |
| `initialScene` | Opening scene text; also the first narrative entry shown to the player. |
| `playerDescription` | Who the player is in this scene. |

## `npc_*.json` → `NpcConfig`

| Field | Meaning |
|-------|---------|
| `id` | Stable unique id (used as the `npcStates` / debug key). |
| `name` | Display name (shown in prose, debug, and as step `displayName`). |
| `description` | Physical + character description for the NPC prompt. |
| `traits` | String list of personality traits. |
| `goals` | String list of objectives driving behavior. |
| `initialState` | Seeds the NPC's first-turn "previous thoughts". |

## Conventions

- Narrative content is **Russian**; JSON keys stay as defined in `engine/src/types.ts`.
- Keep `id` unique within a story and stable across edits (it keys persistent NPC state).
- Any schema change must be mirrored in `WorldConfig` / `NpcConfig` in both
  `engine/src/types.ts` and `ui/src/types.ts`, and validated in `index.ts`.
