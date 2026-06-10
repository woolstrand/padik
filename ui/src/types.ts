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
