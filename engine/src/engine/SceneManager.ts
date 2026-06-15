import { ILlmClient } from '../types';
import {
  sceneStateManagerSystemPrompt,
  sceneStateManagerUpdatePrompt,
} from '../prompts';

/**
 * SceneStateManager — tracks the factual, observable state of the scene.
 *
 * Maintains a natural-language description of what is physically present and
 * happening in the scene: spatial layout, character and object positions,
 * poses, line-of-sight, inventory, appearance, health, etc.  No intentions,
 * feelings or thoughts (those live in `NpcStateManager`).
 *
 * The starting state is built once by the `SessionLoader` and injected here, so
 * this manager no longer touches story config or performs async init — it is
 * ready to read synchronously from construction. After each narrator turn it is
 * updated via an LLM call that merges the previous state with new events.
 */
export class SceneStateManager {
  private currentState: string;

  constructor(
    private readonly llmClient: ILlmClient,
    initialState: string,
  ) {
    this.currentState = initialState;
  }

  /** Synchronous read — always safe. */
  getCurrentState(): string {
    return this.currentState;
  }

  /** Overwrite state directly (used when restoring a checkpoint). */
  restoreState(state: string): void {
    this.currentState = state;
  }

  /**
   * Call after each turn to merge the new events into the scene state.
   * Takes both the SceneProcessor factual outcome (primary) and the Narrator
   * artistic output (secondary context).
   */
  async update(sceneProcessorOutcome: string, narratorOutcome: string): Promise<void> {
    const messages = [
      { role: 'system' as const, content: sceneStateManagerSystemPrompt() },
      {
        role: 'user' as const,
        content: sceneStateManagerUpdatePrompt(this.currentState, sceneProcessorOutcome, narratorOutcome),
      },
    ];
    this.currentState = (await this.llmClient.complete(messages)).trim();
  }
}
