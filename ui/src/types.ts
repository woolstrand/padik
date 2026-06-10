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
}
