import { ILlmClient, WorldConfig } from '../types';
import { NarratorMode, narratorSystemPrompt, narratorUserPrompt } from '../prompts';

/**
 * Narrator — produces the artistic story prose that the player reads.
 *
 * Receives the world config, recent narrative history, and the factual
 * SceneProcessor outcome for the current turn.  Transforms the factual
 * description into immersive prose without adding any new facts.
 */
export class Narrator {
  constructor(private readonly llmClient: ILlmClient) {}

  async narrate(
    worldConfig: WorldConfig,
    narrativeHistory: string[],
    sceneState: string,
    sceneProcessorOutcome: string,
    mode: NarratorMode = 'event',
  ): Promise<string> {
    const messages = [
      { role: 'system' as const, content: narratorSystemPrompt(mode) },
      {
        role: 'user' as const,
        content: narratorUserPrompt(worldConfig, narrativeHistory, sceneState, sceneProcessorOutcome, mode),
      },
    ];

    return this.llmClient.complete(messages);
  }

  async *narrateStream(
    worldConfig: WorldConfig,
    narrativeHistory: string[],
    sceneState: string,
    sceneProcessorOutcome: string,
    mode: NarratorMode = 'event',
  ): AsyncIterable<string> {
    const messages = [
      { role: 'system' as const, content: narratorSystemPrompt(mode) },
      {
        role: 'user' as const,
        content: narratorUserPrompt(worldConfig, narrativeHistory, sceneState, sceneProcessorOutcome, mode),
      },
    ];

    yield* this.llmClient.completeStream(messages);
  }
}
