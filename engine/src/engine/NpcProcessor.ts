import { ILlmClient, NpcConfig, NpcOutput, NpcState, PlayerAction, WorldConfig } from '../types';
import { npcSystemPrompt, npcUserPrompt, NPC_DEFAULT_ACTION, NPC_CONFUSED_ACTION } from '../prompts';

/**
 * NPC Processor — handles a single NPC turn.
 *
 * Each call builds a fresh prompt from scratch (no running conversation) to
 * keep token usage low.  The prompt includes:
 *   – base NPC description and goals
 *   – world setting
 *   – recent narrative context
 *   – player action (if any)
 *   – actions already taken by other NPCs this turn
 *   – the NPC's previous internal thoughts
 *
 * The LLM is asked to return a JSON object with two fields:
 *   thoughts  – internal monologue / reasoning chain (stored internally)
 *   actions   – list of concrete actions (forwarded to Narrator)
 */
export class NpcProcessor {
  constructor(private readonly llmClient: ILlmClient) {}

  async process(
    npcConfig: NpcConfig,
    previousState: NpcState,
    worldConfig: WorldConfig,
    recentNarrative: string,
    playerAction: PlayerAction | null,
    otherNpcActions: string[],
  ): Promise<NpcOutput> {
    const messages = [
      { role: 'system' as const, content: npcSystemPrompt() },
      {
        role: 'user' as const,
        content: npcUserPrompt(
          npcConfig,
          previousState,
          worldConfig,
          recentNarrative,
          playerAction,
          otherNpcActions,
        ),
      },
    ];

    const raw = await this.llmClient.complete(messages);
    return this.parseResponse(raw, npcConfig);
  }

  private parseResponse(raw: string, npc: NpcConfig): NpcOutput {
    const separatorIndex = raw.indexOf('#ACTIONS#');
    if (separatorIndex !== -1) {
      const thoughts = raw.slice(0, separatorIndex).trim();
      const actionsBlock = raw.slice(separatorIndex + '#ACTIONS#'.length).trim();
      const actions = actionsBlock
        .split('\n')
        .map((line) => line.replace(/^[-*•]\s*/, '').trim())
        .filter((line) => line.length > 0);
      return {
        npcId: npc.id,
        npcName: npc.name,
        thoughts,
        actions: actions.length > 0 ? actions : [NPC_DEFAULT_ACTION],
      };
    }

    // Fallback: treat the entire response as thoughts, signal confusion via action
    return {
      npcId: npc.id,
      npcName: npc.name,
      thoughts: raw,
      actions: [NPC_CONFUSED_ACTION],
    };
  }
}
