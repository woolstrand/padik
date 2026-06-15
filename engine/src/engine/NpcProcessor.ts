import { ILlmClient, NpcInnerState, NpcOutput, NpcPersona, PlayerAction, WorldRuntime } from '../types';
import { npcSystemPrompt, npcUserPrompt, NPC_DEFAULT_ACTION, NPC_CONFUSED_ACTION } from '../prompts';
import { NPC_ACTIONS_SEPARATOR } from '../constants';

/**
 * NPC Processor — handles a single NPC turn.
 *
 * Each call builds a fresh prompt from scratch (no running conversation) to
 * keep token usage low.  The prompt includes:
 *   – the NPC's immutable persona (character, traits, goals)
 *   – world style
 *   – recent narrative context
 *   – player action (if any)
 *   – actions already taken by other NPCs this turn
 *   – the NPC's previous internal thoughts (mutable mind)
 *
 * The LLM is asked to return a JSON object with two fields:
 *   thoughts  – internal monologue / reasoning chain (stored internally)
 *   actions   – list of concrete actions (forwarded to Narrator)
 */
export class NpcProcessor {
  constructor(private readonly llmClient: ILlmClient) {}

  async process(
    inner: NpcInnerState,
    world: WorldRuntime,
    recentNarrative: string,
    playerAction: PlayerAction | null,
    otherNpcActions: string[],
    sceneState: string,
  ): Promise<NpcOutput> {
    const messages = [
      { role: 'system' as const, content: npcSystemPrompt() },
      {
        role: 'user' as const,
        content: npcUserPrompt(
          inner,
          world,
          recentNarrative,
          playerAction,
          otherNpcActions,
          sceneState,
        ),
      },
    ];

    const raw = await this.llmClient.complete(messages);
    return this.parseResponse(raw, inner.persona);
  }

  private parseResponse(raw: string, persona: NpcPersona): NpcOutput {
    const separatorIndex = raw.indexOf(NPC_ACTIONS_SEPARATOR);
    if (separatorIndex !== -1) {
      const thoughts = raw.slice(0, separatorIndex).trim();
      const actionsBlock = raw.slice(separatorIndex + NPC_ACTIONS_SEPARATOR.length).trim();
      const actions = actionsBlock
        .split('\n')
        .map((line) => line.replace(/^[-*•]\s*/, '').trim())
        .filter((line) => line.length > 0);
      return {
        npcId: persona.id,
        npcName: persona.name,
        thoughts,
        actions: actions.length > 0 ? actions : [NPC_DEFAULT_ACTION],
      };
    }

    // Fallback: treat the entire response as thoughts, signal confusion via action
    return {
      npcId: persona.id,
      npcName: persona.name,
      thoughts: raw,
      actions: [NPC_CONFUSED_ACTION],
    };
  }
}
