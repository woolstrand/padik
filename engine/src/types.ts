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

export interface NpcConfig {
  id: string;
  name: string;
  description: string;
  traits: string[];
  goals: string[];
  initialState: string;
}

export interface WorldConfig {
  setting: string;
  atmosphere: string;
  initialScene: string;
  playerDescription: string;
}

export interface NpcState {
  npc: NpcConfig;
  /** Internal monologue kept between turns; injected into the next prompt. */
  thoughts: string;
  lastActions: string[];
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
  npcStates: Map<string, NpcState>;
  worldConfig: WorldConfig;
  turnCount: number;
}

export interface StoryInfo {
  id: string;
}

export interface NpcOutput {
  npcId: string;
  npcName: string;
  thoughts: string;
  actions: string[];
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
  worldConfig: WorldConfig;
  storyId: string;
  sceneState: string;
  storyHistory: StoryHistoryEntry[];
}

/** Response body for GET /api/stories. */
export interface StoryListResponse {
  stories: StoryInfo[];
  selectedStoryId: string;
}
