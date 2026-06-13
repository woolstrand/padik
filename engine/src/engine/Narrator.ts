import { ILlmClient, NpcOutput, PlayerAction, WorldConfig } from '../types';
import { narratorSystemPrompt, narratorUserPrompt } from '../prompts';

/**
 * Narrator — produces the story update paragraph(s) that the player reads.
 *
 * Receives the world config, recent narrative history, the player's action,
 * and the concrete actions decided by all NPC processors this turn.
 * Builds a fresh prompt each time and asks the LLM to write immersive prose.
 */
export class Narrator {
  constructor(private readonly llmClient: ILlmClient) {}

  async narrate(
    worldConfig: WorldConfig,
    narrativeHistory: string[],
    playerAction: PlayerAction | null,
    npcOutputs: NpcOutput[],
    sceneState: string,
  ): Promise<string> {
    const messages = [
      { role: 'system' as const, content: narratorSystemPrompt() },
      {
        role: 'user' as const,
        content: narratorUserPrompt(worldConfig, narrativeHistory, playerAction, npcOutputs, sceneState),
      },
    ];

    return this.llmClient.complete(messages);
  }

  async *narrateStream(
    worldConfig: WorldConfig,
    narrativeHistory: string[],
    playerAction: PlayerAction | null,
    npcOutputs: NpcOutput[],
    sceneState: string,
  ): AsyncIterable<string> {
    const messages = [
      { role: 'system' as const, content: narratorSystemPrompt() },
      {
        role: 'user' as const,
        content: narratorUserPrompt(worldConfig, narrativeHistory, playerAction, npcOutputs, sceneState),
      },
    ];

    yield* this.llmClient.completeStream(messages);
  }
}
