// Wire-format and API response types: single source of truth is engine/src/types.ts.
// This file re-exports only the types that cross the HTTP/SSE boundary so that
// UI code continues to import from './types' (or '../types') without change.
// Internal engine types (ILlmClient, PipelineStep, NpcConfig, NpcInnerState, GameState, …)
// are intentionally NOT re-exported here.
export type {
  PlayerActionType,
  PlayerAction,
  NpcOutput,
  TurnResult,
  NpcDebugStep,
  NpcDebugData,
  WorldRuntime,
  StoryHistoryEntry,
  StoryInfo,
  StepStartEvent,
  StepDoneEvent,
  NarratorTokenEvent,
  TurnDoneEvent,
  TurnErrorEvent,
  TurnStreamEvent,
  GameStateSnapshot,
  StoryListResponse,
} from '../../engine/src/types';

// ---------------------------------------------------------------------------
// UI-only types — not part of the wire contract
// ---------------------------------------------------------------------------

export interface ChatEntry {
  type: 'narrative' | 'player-act' | 'player-say' | 'player-skip' | 'player-observe';
  text: string;
}
