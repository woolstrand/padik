// Shared types mirrored from the engine.
// Keep in sync with engine/src/types.ts.

export type PlayerActionType = 'act' | 'say' | 'skip';

export interface PlayerAction {
  type: PlayerActionType;
  text: string;
}

export interface NpcOutput {
  npcId: string;
  npcName: string;
  thoughts: string;
  actions: string[];
}

export interface TurnResult {
  narrative: string;
  npcOutputs: NpcOutput[];
}

export interface NpcDebugStep {
  turn: number;
  situation: string;
  thoughts: string;
  actions: string[];
}

export interface NpcDebugData {
  npcId: string;
  npcName: string;
  steps: NpcDebugStep[];
}

export interface WorldConfig {
  setting: string;
  atmosphere: string;
  initialScene: string;
  playerDescription: string;
}

export interface GameStateSnapshot {
  narrativeHistory: string[];
  turnCount: number;
  worldConfig: WorldConfig;
  storyId: string;
}

export interface StoryInfo {
  id: string;
}

export interface StoryListResponse {
  stories: StoryInfo[];
  selectedStoryId: string;
}

// ---------------------------------------------------------------------------
// Streaming turn events — mirrors engine/src/types.ts TurnStreamEvent
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
