import { ILlmClient, NpcOutput, PlayerAction, WorldConfig } from '../types';
import { MAX_NARRATIVE_HISTORY_IN_PROMPT } from '../constants';

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
  ): Promise<string> {
    const messages = [
      { role: 'system' as const, content: this.buildSystemPrompt() },
      {
        role: 'user' as const,
        content: this.buildUserPrompt(worldConfig, narrativeHistory, playerAction, npcOutputs),
      },
    ];

    return this.llmClient.complete(messages);
  }

  private buildSystemPrompt(): string {
    return `Ты — нарратор в атмосферной текстовой ролевой игре в жанре бытового реализма.
Описывай события в настоящем времени, от третьего лица, живо и кинематографично.
Не принимай решения за игрока. Описывай только то, что происходит с НПС и окружением.
Длина ответа — 2–4 абзаца.`;
  }

  private buildUserPrompt(
    world: WorldConfig,
    history: string[],
    playerAction: PlayerAction | null,
    npcOutputs: NpcOutput[],
  ): string {
    const historySnippet =
      history.length > 0
        ? `# Предыдущие события\n${history.slice(-MAX_NARRATIVE_HISTORY_IN_PROMPT).join('\n\n---\n\n')}`
        : '';

    const playerText = playerAction
      ? playerAction.type === 'say'
        ? `Игрок произносит вслух: «${playerAction.text}»`
        : playerAction.type === 'act'
          ? `Игрок совершает действие: ${playerAction.text}`
          : ''
      : '';

    const npcActionsText = npcOutputs
      .map((o) => `${o.npcName}: ${o.actions.join('; ')}`)
      .join('\n');

    return `# Обстановка
${world.setting}
${world.atmosphere}

${historySnippet}

# Что происходит в этот момент
${playerText ? playerText + '\n' : ''}Действия персонажей:
${npcActionsText}

Напиши атмосферное описание этого момента для читателя.`.trim();
  }
}
