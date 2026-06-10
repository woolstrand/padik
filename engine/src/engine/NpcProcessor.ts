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
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON block found');
      const parsed = JSON.parse(jsonMatch[0]) as { thoughts?: string; actions?: string[] };
      return {
        npcId: npc.id,
        npcName: npc.name,
        thoughts: parsed.thoughts ?? '',
        actions: Array.isArray(parsed.actions) && parsed.actions.length > 0
          ? parsed.actions
          : [NPC_DEFAULT_ACTION],
      };
    } catch {
      // Graceful fallback: treat the entire response as the thoughts
      return {
        npcId: npc.id,
        npcName: npc.name,
        thoughts: raw,
        actions: [NPC_CONFUSED_ACTION],
      };
    }
  }
}
