# LLM layer — client, prompts & configuration

> Read before editing `engine/src/llm/**`, `engine/src/prompts.ts`, or
> `engine/src/constants.ts`.
> **Update this doc in the same change** when you alter the `ILlmClient` contract, prompt
> structure, or tunable constants.

## Responsibility

This layer is the only place that talks to the language model and the only place that holds
LLM-facing text and model configuration. Everything above it depends on the `ILlmClient`
**interface**, never on the concrete client.

## Key files

| File | Role |
|------|------|
| `engine/src/llm/LlmClient.ts` | Concrete `ILlmClient` over LM Studio's OpenAI-compatible API |
| `engine/src/types.ts` (`ILlmClient`, `Message`) | The abstraction all simulation modules use |
| `engine/src/prompts.ts` | **All** prompt strings + narrative templates + fallback strings |
| `engine/src/constants.ts` | Model/runtime tunables and file/path constants |

## `ILlmClient`

```ts
interface ILlmClient {
  complete(messages: Message[]): Promise<string>;
  completeStream(messages: Message[]): AsyncIterable<string>;
}
```

`LlmClient` wraps the `openai` SDK pointed at `LLM_BASE_URL` with a dummy API key (LM Studio
accepts any non-empty key). `complete` returns the full message content; `completeStream`
yields `delta.content` tokens. Construct it only in `engine/src/index.ts` and inject it.

To swap providers or add caching/retries, implement `ILlmClient` — do **not** change call
sites in the simulation modules.

## Prompts (`prompts.ts`)

Every prompt is a pure function returning a string. Grouped by consumer:

- **SceneProcessor**: `sceneProcessorSystemPrompt(reasoning)`, `sceneProcessorUserPrompt(...)`.
  The system prompt has an optional chain-of-thought branch gated by a boolean (see
  `SCENE_PROCESSOR_REASONING` in `SceneProcessor.ts`); reasoning output is separated by the
  `#OUTCOME#` token.
- **Narrator**: `narratorSystemPrompt()`, `narratorUserPrompt(...)`. Writes in
  `NARRATOR_LANGUAGE`; instructed to add no new facts.
- **NPC**: `npcSystemPrompt()`, `npcUserPrompt(...)`. Output is split on the `#ACTIONS#`
  token into thoughts vs. actions (parsing lives in `NpcProcessor`).
- **SceneManager**: `sceneStateManagerSystemPrompt()`, `...InitPrompt(...)`,
  `...UpdatePrompt(...)`.
- **Fallback strings**: `NPC_DEFAULT_ACTION`, `NPC_CONFUSED_ACTION`.

Rules:
- Never inline a prompt string inside a logic file — add/extend it here.
- Separator tokens (`#ACTIONS#`, `#OUTCOME#`) are a contract shared with the parsing code in
  `NpcProcessor`/`SceneProcessor`. Change both sides together.
- Prompt language is English; player-visible output language is controlled by
  `NARRATOR_LANGUAGE`.

## Constants (`constants.ts`)

- LLM: `LLM_BASE_URL`, `LLM_MODEL`, `LLM_TEMPERATURE`, `LLM_MAX_TOKENS`.
- Server/data: `SERVER_PORT`, `USERDATA_DIR`, `STORIES_DIR`, `STORY_SELECTION_FILE`,
  `WORLD_FILE`, `DEFAULT_STORY_ID`.
- Behavior: `MAX_NARRATIVE_HISTORY_IN_PROMPT` (how many past narrative entries enter the
  narrator prompt), `NARRATOR_LANGUAGE`.

Any new magic number or tunable belongs here, not inline.

## Token-minimization philosophy

Prompts are rebuilt from scratch each turn rather than maintaining a growing conversation.
Only NPC *thoughts* and the factual scene state persist between turns, and narrative history
fed to the narrator is capped by `MAX_NARRATIVE_HISTORY_IN_PROMPT`. Preserve this when adding
context to any prompt — prefer summarized/factual state over raw transcripts.
