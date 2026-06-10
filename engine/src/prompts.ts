/**
 * All prompt strings and narrative templates used when communicating with the LLM.
 *
 * Keeping them here achieves two things:
 *   1. Writers can edit narrative prose without touching logic files.
 *   2. This module is the single place to swap or translate all LLM-facing text.
 */

import { NpcConfig, NpcOutput, NpcState, PlayerAction, WorldConfig } from './types';
import { MAX_NARRATIVE_HISTORY_IN_PROMPT } from './constants';

// ---------------------------------------------------------------------------
// Narrator prompts
// ---------------------------------------------------------------------------

export function narratorSystemPrompt(): string {
  return `Ты — нарратор в атмосферной текстовой ролевой игре в жанре бытового реализма.
Описывай события в настоящем времени, от третьего лица, живо и кинематографично.
Не принимай решения за игрока. Описывай только то, что происходит с НПС и окружением.
Длина ответа — 2–4 абзаца.`;
}

export function narratorUserPrompt(
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

// ---------------------------------------------------------------------------
// NPC processor prompts
// ---------------------------------------------------------------------------

export function npcSystemPrompt(): string {
  return `Ты — система для отыгрыша ролевых персонажей в текстовой ролевой игре.
Твоя задача — войти в роль персонажа и описать его внутренний монолог и выбранные действия.
Отвечай СТРОГО в формате JSON, без каких-либо пояснений за пределами JSON:
{"thoughts": "...", "actions": ["...", "..."]}`;
}

export function npcUserPrompt(
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

// ---------------------------------------------------------------------------
// NPC fallback narrative strings (used when LLM response cannot be parsed)
// ---------------------------------------------------------------------------

/** Action text used when the LLM returns an empty actions array. */
export const NPC_DEFAULT_ACTION = 'ничего не делает';

/** Action text used when the LLM response cannot be parsed at all. */
export const NPC_CONFUSED_ACTION = 'растерянно стоит на месте';
