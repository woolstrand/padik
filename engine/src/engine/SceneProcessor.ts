import { ILlmClient, NpcOutput, PlayerAction, WorldConfig } from '../types';
import { sceneProcessorSystemPrompt, sceneProcessorUserPrompt } from '../prompts';
import { SCENE_OUTCOME_SEPARATOR } from '../constants';

/**
 * Toggle internal reasoning/thinking pass in SceneProcessor prompts.
 * When true, the model reasons step-by-step before the #OUTCOME# separator;
 * the reasoning is stored in debug history but stripped from the outcome that
 * flows downstream into the Narrator and SceneManager.
 */
export const SCENE_PROCESSOR_REASONING = false;

export interface SceneProcessorResult {
  /** Clean factual description — passed to Narrator, SceneManager, NPC context. */
  outcome: string;
  /** Pre-separator reasoning text, or null when reasoning is disabled / absent. */
  reasoning: string | null;
}

/**
 * SceneProcessor — the authoritative arbiter of what actually happens.
 *
 * Consumes the current scene state, the player's action, and all NPC actions
 * for the turn.  Produces a factual, physically accurate description of the
 * consequences — resolving ambiguities, filling in latent facts, and driving
 * the plot forward without any bias toward any character.
 *
 * Its output is the single source of truth for:
 *   - what the Narrator converts into prose (no new facts allowed there), and
 *   - what the SceneManager merges into the updated scene state.
 * It also replaces the previous narrator output as the "recent events" context
 * fed to NPC processors on the next turn.
 */
export class SceneProcessor {
  constructor(private readonly llmClient: ILlmClient) {}

  async process(
    worldConfig: WorldConfig,
    sceneState: string,
    playerAction: PlayerAction | null,
    npcOutputs: NpcOutput[],
  ): Promise<SceneProcessorResult> {
    const messages = [
      { role: 'system' as const, content: sceneProcessorSystemPrompt(SCENE_PROCESSOR_REASONING) },
      {
        role: 'user' as const,
        content: sceneProcessorUserPrompt(worldConfig, sceneState, playerAction, npcOutputs),
      },
    ];

    const raw = await this.llmClient.complete(messages);

    if (SCENE_PROCESSOR_REASONING) {
      const idx = raw.indexOf(SCENE_OUTCOME_SEPARATOR);
      if (idx !== -1) {
        return {
          reasoning: raw.slice(0, idx).trim(),
          outcome: raw.slice(idx + SCENE_OUTCOME_SEPARATOR.length).trim(),
        };
      }
      // Separator missing — treat entire response as outcome, log a warning.
      console.warn(`[SceneProcessor] ${SCENE_OUTCOME_SEPARATOR} separator not found in reasoning response.`);
    }

    return { outcome: raw.trim(), reasoning: null };
  }
}
