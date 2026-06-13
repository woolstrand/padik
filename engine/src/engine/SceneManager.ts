import { ILlmClient, NpcConfig, WorldConfig } from '../types';
import {
  sceneManagerSystemPrompt,
  sceneManagerInitPrompt,
  sceneManagerUpdatePrompt,
} from '../prompts';

/**
 * SceneManager — tracks the factual, observable state of the scene.
 *
 * Maintains a natural-language description of what is physically present and
 * happening in the scene: spatial layout, character and object positions,
 * poses, line-of-sight, inventory, etc.  No intentions, feelings or thoughts.
 *
 * Initialised async from world + NPC descriptions; updated after each
 * narrator turn via an LLM call that merges previous state with new events.
 */
export class SceneManager {
  private currentState: string = '';
  private readonly initPromise: Promise<void>;

  constructor(
    private readonly llmClient: ILlmClient,
    worldConfig: WorldConfig,
    npcConfigs: NpcConfig[],
  ) {
    this.initPromise = this.initializeState(worldConfig, npcConfigs);
  }

  private async initializeState(worldConfig: WorldConfig, npcConfigs: NpcConfig[]): Promise<void> {
    const messages = [
      { role: 'system' as const, content: sceneManagerSystemPrompt() },
      { role: 'user' as const, content: sceneManagerInitPrompt(worldConfig, npcConfigs) },
    ];
    this.currentState = (await this.llmClient.complete(messages)).trim();
  }

  /** Await this before the first turn to ensure the scene is initialised. */
  async ensureInitialized(): Promise<void> {
    await this.initPromise;
  }

  /** Synchronous read — always safe after ensureInitialized() has resolved. */
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
   * artistic output (secondary context).  Must not be called before
   * ensureInitialized() resolves.
   */
  async update(sceneProcessorOutcome: string, narratorOutcome: string): Promise<void> {
    const messages = [
      { role: 'system' as const, content: sceneManagerSystemPrompt() },
      {
        role: 'user' as const,
        content: sceneManagerUpdatePrompt(this.currentState, sceneProcessorOutcome, narratorOutcome),
      },
    ];
    this.currentState = (await this.llmClient.complete(messages)).trim();
  }
}
