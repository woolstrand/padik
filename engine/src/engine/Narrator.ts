import { ILlmClient, WorldRuntime } from '../types';
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
    worldConfig: WorldRuntime,
    narrativeHistory: string[],
    sceneState: string,
    sceneProcessorOutcome: string,
    mode: NarratorMode = 'event',
    isPassiveTurn = false,
  ): Promise<string> {
    const messages = [
      { role: 'system' as const, content: narratorSystemPrompt(mode) },
      {
        role: 'user' as const,
        content: narratorUserPrompt(worldConfig, narrativeHistory, sceneState, sceneProcessorOutcome, mode, isPassiveTurn),
      },
    ];

    return this.llmClient.complete(messages);
  }

  async *narrateStream(
    worldConfig: WorldRuntime,
    narrativeHistory: string[],
    sceneState: string,
    sceneProcessorOutcome: string,
    mode: NarratorMode = 'event',
    isPassiveTurn = false,
  ): AsyncIterable<string> {
    const messages = [
      { role: 'system' as const, content: narratorSystemPrompt(mode) },
      {
        role: 'user' as const,
        content: narratorUserPrompt(worldConfig, narrativeHistory, sceneState, sceneProcessorOutcome, mode, isPassiveTurn),
      },
    ];

    yield* this.llmClient.completeStream(messages);
  }
}
