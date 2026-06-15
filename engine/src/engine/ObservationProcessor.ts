import { ILlmClient, WorldConfig } from '../types';
import { observationSystemPrompt, observationUserPrompt } from '../prompts';

/**
 * ObservationProcessor — handles the player's observe action.
 *
 * Produces a detailed, strictly factual sensory description of whatever the
 * player is focusing their attention on.  No NPC steps or scene arbitration
 * occur — this is a pure perceptual query against the current scene state.
 *
 * The output:
 *   - feeds the Narrator (converted into atmospheric prose for the player), and
 *   - feeds the SceneManager (so newly revealed details persist in scene state).
 *
 * The output is intentionally NOT pushed to sceneProcessorHistory so NPCs do
 * not receive the player's observation as a "recent events" context on the
 * next turn.
 */
export class ObservationProcessor {
  constructor(private readonly llmClient: ILlmClient) {}

  async process(
    worldConfig: WorldConfig,
    sceneState: string,
    focusText: string,
  ): Promise<string> {
    const messages = [
      { role: 'system' as const, content: observationSystemPrompt() },
      {
        role: 'user' as const,
        content: observationUserPrompt(worldConfig, sceneState, focusText),
      },
    ];
    return (await this.llmClient.complete(messages)).trim();
  }
}
