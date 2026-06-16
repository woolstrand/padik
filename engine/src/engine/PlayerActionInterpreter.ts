import { ILlmClient, PlayerAction, WorldRuntime } from '../types';
import { playerActionClassifierSystemPrompt, playerActionClassifierUserPrompt } from '../prompts';

/** Result of classifying a player action. */
export interface PlayerActionClassification {
  /** True when the player is not physically intervening in the scene. */
  isPassive: boolean;
  /**
   * English, past-tense, third-person restatement of the action.
   * Empty string for non-`act` action types (skip, say, observe).
   */
  normalizedAction: string;
}

/**
 * PlayerActionInterpreter — classifies a player action as active or passive
 * and normalises it to English past-tense third-person in a single LLM call.
 *
 * Classification is intentionally language-agnostic: the LLM judges meaning,
 * not keywords.  The normalised action text is fed to NPC and SceneProcessor
 * prompts so they reason from consistent, unambiguous English regardless of
 * what language or tense the player used.
 *
 * Short-circuits without an LLM call for unambiguous action types.
 */
export class PlayerActionInterpreter {
  constructor(private readonly llmClient: ILlmClient) {}

  /**
   * Classify and normalise the player action.
   *
   * - `skip` / null  → passive, no normalised text  (no LLM call)
   * - `say`          → active, no normalised text   (no LLM call; speech is used verbatim)
   * - `observe`      → passive, no normalised text  (no LLM call)
   * - `act`          → classified + normalised by LLM
   */
  async classify(
    playerAction: PlayerAction | null,
    world: WorldRuntime,
  ): Promise<PlayerActionClassification> {
    if (!playerAction || playerAction.type === 'skip') {
      return { isPassive: true, normalizedAction: '' };
    }
    if (playerAction.type === 'say') {
      return { isPassive: false, normalizedAction: '' };
    }
    if (playerAction.type === 'observe') {
      return { isPassive: true, normalizedAction: '' };
    }

    // type === 'act' — ask the LLM for classification + normalisation
    const messages = [
      { role: 'system' as const, content: playerActionClassifierSystemPrompt() },
      { role: 'user' as const, content: playerActionClassifierUserPrompt(playerAction.text, world) },
    ];
    const raw = await this.llmClient.complete(messages);
    const lines = raw.trim().split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

    // Find the classification line — it may not be the first line if the model adds preamble.
    const classIdx = lines.findIndex((l) => /^(ACTIVE|PASSIVE)/i.test(l));
    const isPassive = classIdx !== -1 ? /^PASSIVE/i.test(lines[classIdx]) : true;

    // Everything after the classification line is the normalised text.
    // Strip any "Line N:" echo the model might have added.
    const normalizedAction = classIdx !== -1
      ? lines
          .slice(classIdx + 1)
          .map((l) => l.replace(/^line\s*\d+\s*[:\-]\s*/i, ''))
          .join(' ')
          .trim()
      : '';

    return { isPassive, normalizedAction };
  }
}
