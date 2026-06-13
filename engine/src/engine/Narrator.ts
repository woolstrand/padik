import { ILlmClient, WorldConfig } from '../types';
import { narratorSystemPrompt, narratorUserPrompt } from '../prompts';

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
  ): Promise<string> {
    const messages = [
      { role: 'system' as const, content: narratorSystemPrompt() },
      {
        role: 'user' as const,
        content: narratorUserPrompt(worldConfig, narrativeHistory, sceneState, sceneProcessorOutcome),
      },
    ];

    return this.llmClient.complete(messages);
  }

  async *narrateStream(
    worldConfig: WorldConfig,
    narrativeHistory: string[],
    sceneState: string,
    sceneProcessorOutcome: string,
  ): AsyncIterable<string> {
    const messages = [
      { role: 'system' as const, content: narratorSystemPrompt() },
      {
        role: 'user' as const,
        content: narratorUserPrompt(worldConfig, narrativeHistory, sceneState, sceneProcessorOutcome),
      },
    ];

    yield* this.llmClient.completeStream(messages);
  }
}
