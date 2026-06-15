// All hardcoded application constants.
// For a production system these would come from environment variables or config files.

export const LLM_BASE_URL = 'http://localhost:1234/v1';
export const LLM_MODEL = 'local-model';
export const LLM_TEMPERATURE = 0.8;
export const LLM_MAX_TOKENS = 1500;

export const SERVER_PORT = 3001;

export const USERDATA_DIR = 'userdata';
export const STORIES_DIR = 'stories';
export const STORY_SELECTION_FILE = 'selected-story.json';
export const WORLD_FILE = 'world.json';
export const DEFAULT_STORY_ID = 'padik';

export const MAX_NARRATIVE_HISTORY_IN_PROMPT = 3;

export const NARRATOR_LANGUAGE = 'Russian';

// ---------------------------------------------------------------------------
// LLM response separator tokens — must match the prompts in prompts.ts and
// the parsers in NpcProcessor / SceneProcessor.
// ---------------------------------------------------------------------------

/** Separates NPC inner monologue from the actions block in NPC responses. */
export const NPC_ACTIONS_SEPARATOR = '#ACTIONS#';

/** Separates SceneProcessor reasoning from the factual outcome (used when reasoning is enabled). */
export const SCENE_OUTCOME_SEPARATOR = '#OUTCOME#';
