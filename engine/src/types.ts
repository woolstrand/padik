// Shared domain types for the game engine.

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Abstraction over LLM completion — NpcProcessor and Narrator depend on this, not on a concrete client. */
export interface ILlmClient {
  complete(messages: Message[]): Promise<string>;
  completeStream(messages: Message[]): AsyncIterable<string>;
}

/** A single isolated processing unit in the turn pipeline. */
export interface PipelineStep<TInput, TOutput> {
  displayName: string;
  execute(input: TInput): Promise<TOutput>;
}

// ---------------------------------------------------------------------------
// Streaming turn events — emitted by Orchestrator.processTurnStream
// ---------------------------------------------------------------------------

export interface StepStartEvent {
  type: 'step:start';
  displayName: string;
}

export interface StepDoneEvent {
  type: 'step:done';
  displayName: string;
}

export interface NarratorTokenEvent {
  type: 'narrator:token';
  token: string;
}

export interface TurnDoneEvent {
  type: 'done';
  narrative: string;
  npcOutputs: NpcOutput[];
  sceneState: string;
  storyHistory: StoryHistoryEntry[];
}

export interface TurnErrorEvent {
  type: 'error';
  message: string;
}

export type TurnStreamEvent =
  | StepStartEvent
  | StepDoneEvent
  | NarratorTokenEvent
  | TurnDoneEvent
  | TurnErrorEvent;

// ---------------------------------------------------------------------------
// Story configuration — raw shapes parsed from the userdata JSON files.
// Consumed ONLY by the SessionLoader; runtime engine code never sees these.
// ---------------------------------------------------------------------------

/** Raw `world.json` shape. */
export interface WorldConfig {
  /** Factual description of the place (world facts). */
  setting: string;
  /** Narration style / mood guidance. */
  style: string;
  /** Opening narrative prose shown to the player as the first message. */
  opening: string;
  /** Who the player is in this scene. */
  playerDescription: string;
}

/** Raw `npc_*.json` shape. */
export interface NpcConfig {
  id: string;
  name: string;
  /** Physical appearance — seeds the factual scene state (SceneManager). */
  appearance: string;
  /** Character / personality description — seeds the NPC inner state. */
  character: string;
  traits: string[];
  goals: string[];
  /** Initial inner monologue / mental state seed. */
  initialMindset: string;
}

// ---------------------------------------------------------------------------
// Engine runtime state — produced by the SessionLoader from the config above.
// Engine components depend only on these types, never on the raw config.
// ---------------------------------------------------------------------------

/** Static world data baked for the engine. Immutable during play. */
export interface WorldRuntime {
  /** Factual world facts (SceneProcessor, ObservationProcessor, scene init). */
  setting: string;
  /** Narration style / mood (Narrator, NPC prompts). */
  style: string;
  /** Who the player is. */
  playerDescription: string;
}

/** Immutable identity & personality of an NPC. Never changes during play. */
export interface NpcPersona {
  id: string;
  name: string;
  /** Character / personality description (no physical appearance). */
  character: string;
  traits: string[];
}

/** Mutable mental state of an NPC. Evolves every turn. */
export interface NpcMind {
  /** Internal monologue kept between turns; injected into the next prompt. */
  thoughts: string;
  /** Current emotional / mental state; updated each turn. */
  mood: string;
  /** Long-term goals and motivations; rarely changes. */
  goals: string[];
  /** Short-term planned steps (to-do list); updated every turn. */
  agenda: string[];
  /** Actions taken on the most recent turn. */
  lastActions: string[];
}

/** Full inner state of an NPC: immutable persona + mutable mind. */
export interface NpcInnerState {
  readonly persona: NpcPersona;
  mind: NpcMind;
}

/** Complete initial engine state produced by the SessionLoader. */
export interface EngineInitialState {
  world: WorldRuntime;
  /** NPC inner states in turn order. */
  npcInnerStates: NpcInnerState[];
  /** Factual scene state at the start of play (positions, poses, appearance, objects). */
  initialSceneState: string;
  /** Opening narrative prose shown to the player as the first message. */
  opening: string;
}

export interface StoryHistoryEntry {
  /** 'event' = normal/skip turn (SceneProcessor output); 'observation' = player observe action. */
  kind: 'event' | 'observation';
  /** 0-indexed turn number when this entry was produced. */
  turn: number;
  /** Factual text — SceneProcessor outcome or ObservationProcessor output. */
  text: string;
  /** Pre-outcome reasoning, only present for 'event' entries when SCENE_PROCESSOR_REASONING is enabled. */
  reasoning?: string;
}

export interface GameState {
  narrativeHistory: string[];
  sceneProcessorHistory: string[];
  sceneProcessorReasoningHistory: string[];
  storyHistory: StoryHistoryEntry[];
  world: WorldRuntime;
  turnCount: number;
  /** Consecutive turns since the player last took a physical action (type 'act'). Resets to 0 on 'act'. */
  passiveTurnCount: number;
}

export interface StoryInfo {
  id: string;
}

/**
 * The mutable runtime data the Orchestrator can export for saving and
 * re-import to restore a previous session.
 */
export interface OrchestratorSaveData {
  gameState: GameState;
  sceneState: string;
  /** NPC inner states keyed by NPC id — plain object for JSON serialization. */
  npcStates: Record<string, NpcInnerState>;
  lastPlayerAction: PlayerAction | null;
}

/** Full save file written to disk by SaveManager. */
export interface SaveSnapshot extends OrchestratorSaveData {
  storyId: string;
  savedAt: string;
}

export interface NpcOutput {
  npcId: string;
  npcName: string;
  thoughts: string;
  /** Physical actions the NPC performs (excludes speech). */
  actions: string[];
  /** Lines of dialogue spoken by the NPC. */
  speech: string[];
  /** Updated emotional / mental state for this turn. */
  updatedMood: string;
  /** Updated short-term agenda (replaces previous agenda entirely). */
  updatedAgenda: string[];
  /** Updated long-term goals — only set when the LLM signals a change. */
  updatedGoals?: string[];
}

export type PlayerActionType = 'act' | 'say' | 'skip' | 'observe';

export interface PlayerAction {
  type: PlayerActionType;
  text: string;
}

export interface TurnResult {
  narrative: string;
  npcOutputs: NpcOutput[];
}

export interface NpcDebugStep {
  turn: number;
  /** Formatted description of what the NPC was shown (scene + player action). */
  situation: string;
  thoughts: string;
  actions: string[];
  speech: string[];
  mood: string;
  agenda: string[];
}

export interface NpcDebugData {
  npcId: string;
  npcName: string;
  steps: NpcDebugStep[];
}

// ---------------------------------------------------------------------------
// HTTP API response shapes — constructed by the engine, consumed by the UI
// ---------------------------------------------------------------------------

/** Response body for GET /api/state and POST /api/session/start. */
export interface GameStateSnapshot {
  narrativeHistory: string[];
  turnCount: number;
  world: WorldRuntime;
  /** Opening narrative shown to the player as the first message. */
  opening: string;
  storyId: string;
  sceneState: string;
  storyHistory: StoryHistoryEntry[];
}

/** Response body for GET /api/stories. */
export interface StoryListResponse {
  stories: StoryInfo[];
  selectedStoryId: string;
}
