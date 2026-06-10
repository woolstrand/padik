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

// ---------------------------------------------------------------------------
// Streaming turn events — emitted by Orchestrator.processTurnStream
// ---------------------------------------------------------------------------

export interface NpcStartEvent {
  type: 'npc:start';
  npcId: string;
  npcName: string;
}

export interface NpcDoneEvent {
  type: 'npc:done';
  npcId: string;
  npcName: string;
  npcOutput: NpcOutput;
}

export interface NarratorTokenEvent {
  type: 'narrator:token';
  token: string;
}

export interface TurnDoneEvent {
  type: 'done';
  narrative: string;
  npcOutputs: NpcOutput[];
}

export interface TurnErrorEvent {
  type: 'error';
  message: string;
}

export type TurnStreamEvent =
  | NpcStartEvent
  | NpcDoneEvent
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

export interface GameState {
  narrativeHistory: string[];
  npcStates: Map<string, NpcState>;
  worldConfig: WorldConfig;
  turnCount: number;
}

export interface NpcOutput {
  npcId: string;
  npcName: string;
  thoughts: string;
  actions: string[];
}

export type PlayerActionType = 'act' | 'say' | 'skip';

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
