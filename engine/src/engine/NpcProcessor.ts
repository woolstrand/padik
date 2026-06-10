import { ILlmClient, NpcConfig, NpcOutput, NpcState, PlayerAction, WorldConfig } from '../types';

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
      { role: 'system' as const, content: this.buildSystemPrompt() },
      {
        role: 'user' as const,
        content: this.buildUserPrompt(
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

  private buildSystemPrompt(): string {
    return `Ты — система для отыгрыша ролевых персонажей в текстовой ролевой игре.
Твоя задача — войти в роль персонажа и описать его внутренний монолог и выбранные действия.
Отвечай СТРОГО в формате JSON, без каких-либо пояснений за пределами JSON:
{"thoughts": "...", "actions": ["...", "..."]}`;
  }

  private buildUserPrompt(
    npc: NpcConfig,
    state: NpcState,
    world: WorldConfig,
    recentNarrative: string,
    playerAction: PlayerAction | null,
    otherNpcActions: string[],
  ): string {
    const playerText = playerAction
      ? playerAction.type === 'say'
        ? `Игрок произнёс вслух: «${playerAction.text}»`
        : `Игрок совершил действие: ${playerAction.text}`
      : 'Игрок не предпринял никаких действий.';

    const othersText =
      otherNpcActions.length > 0
        ? `Другие персонажи уже сделали следующее:\n${otherNpcActions.map((a) => `  – ${a}`).join('\n')}`
        : '';

    return `# Обстановка
${world.setting}
${world.atmosphere}

# Текущая сцена
${recentNarrative}

# Твой персонаж: ${npc.name}
${npc.description}

Черты характера: ${npc.traits.join(', ')}.
Цели: ${npc.goals.join('; ')}.

# Твои предыдущие мысли
${state.thoughts || npc.initialState}

# Что происходит прямо сейчас
${playerText}
${othersText}

Опиши подробный внутренний монолог персонажа (размышления, эмоции, планирование), \
а затем выбери 1–3 конкретных действия, которые он совершит в эту минуту.

Отвечай только JSON:
{"thoughts": "<монолог>", "actions": ["<действие 1>", "<действие 2>"]}`.trim();
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
          : ['ничего не делает'],
      };
    } catch {
      // Graceful fallback: treat the entire response as the thoughts
      return {
        npcId: npc.id,
        npcName: npc.name,
        thoughts: raw,
        actions: ['растерянно стоит на месте'],
      };
    }
  }
}
