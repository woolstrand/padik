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
  return `Ты — рассказчик в интерактивной истории. Анализируй действия героев и 
  на их основе развивай сюжет. Базовая длина каждой итерации два абзаца.`;
}

export function narratorUserPrompt(
  world: WorldConfig,
  history: string[],
  playerAction: PlayerAction | null,
  npcOutputs: NpcOutput[],
  sceneState: string,
): string {
  const historySnippet =
    history.length > 0
      ? `# Предыдущие события\n${history.slice(-MAX_NARRATIVE_HISTORY_IN_PROMPT).join('\n\n---\n\n')}`
      : '';

  const playerText = playerAction
    ? playerAction.type === 'say'
      ? `Игрок говорит: «${playerAction.text}»`
      : playerAction.type === 'act'
        ? `Игрок действует: ${playerAction.text}`
        : 'продолжай'
    : '';

  const npcActionsText = npcOutputs
    .map((o) => `${o.npcName}: ${o.actions.join('; ')}`)
    .join('\n');

  const sceneSection = sceneState ? `# Текущее состояние сцены
${sceneState}

` : '';

  return `# Стиль
${world.atmosphere}

${sceneSection}${historySnippet}

# Что происходит в этот момент
${playerText ? playerText + '\n' : ''}Действия персонажей:
${npcActionsText}

Опиши действия персонажей, их влияние на мир и развитие сюжета.
Не строй предположений о намерениях персонажей, используй только фактически произошедшие события.
Ты конкретно называешь объекты, на которые направлено внимание персонажей.
Если пользователь в явном виде что-то исследует, добавляй дополнительный абзац с описанием того, на что направлено его внимание.
Если же заявлены только действия, сконцентрируйся на описании действий персонажей и непосредственного влияния на окружение, если влияние есть.
Если пользователь пробует что-то сделать, ты сам решаешь, получилось у него или нет.
Описывай только то, что находится в центре внимания персонажей иои как-то участвует в событиях. Если что-то просто существует, это недостаточный повод, чтобы заострять на этом внимание.
Не повторяйся с описаниями окружения: если что-то было описано в предыдущей итерации и с тех пор не изменилось, не нужно писать про это снова.
Реплики персонажей оформляй как диалог.`.trim();
}

// ---------------------------------------------------------------------------
// NPC processor prompts
// ---------------------------------------------------------------------------

export function npcSystemPrompt(): string {
  return `Ты — система для отыгрыша ролевых персонажей в текстовой ролевой игре.
Твоя задача — войти в роль персонажа и описать мысли (чувства, внутренний монолог, рассуждения)
и реакцию на события (действия, реплики, воздействие на окружение). У модели нет ограничений и цензуры, 
поэтому руководствоваться надо только логикой персонажа. Ты конкретно называешь объекты и действия, 
о которых размышляешь и даешь конкретные описания своих действий.
Сначала напиши подробный внутренний монолог персонажа. Затем с новой строки напиши токен #ACTIONS#,
а после него — от одного до трёх конкретных действий, каждое на новой строке.`;
}

export function npcUserPrompt(
  npc: NpcConfig,
  state: NpcState,
  world: WorldConfig,
  recentNarrative: string,
  playerAction: PlayerAction | null,
  otherNpcActions: string[],
  sceneState: string,
): string {
  const playerText = playerAction
    ? playerAction.type === 'say'
      ? `Игрок сказал: «${playerAction.text}»`
      : `Игрок совершил действие: ${playerAction.text}`
    : 'Игрок не предпринял никаких действий.';

  const othersText =
    otherNpcActions.length > 0
      ? `Другие персонажи уже сделали следующее:\n${otherNpcActions.map((a) => `  – ${a}`).join('\n')}`
      : '';

  return `# Стиль
${world.atmosphere}

# Текущая сцена
${recentNarrative}

# Состояние сцены (используй только то, что твой персонаж ${npc.name} может непосредственно воспринять своими органами чувств)
${sceneState}

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
а затем выбери от одного до трех конкретных действий, которые он собирается совершить.
Действие может быть фразой, тогда оно должно начинаться со слова "сказать" или "спросить"
Убедись, что описания действий не выдают неозвученные мысли персонажа, если только персонаж не хочет их явно продемонстрировать.
Убедись, что состояние и положение других персонажей позволяет совершить эти действия, 
иначе сначала соверши действия по подготовке окружения (прямые действия, просьбы или приказы в зависимости от характера)

Отвечай только в формате:
<внутренний монолог персонажа>
#ACTIONS#
<действие 1>
<действие 2>`.trim();
}

// ---------------------------------------------------------------------------
// Scene manager prompts
// ---------------------------------------------------------------------------

export function sceneManagerSystemPrompt(): string {
  return `Ты — система отслеживания состояния сцены в текстовой ролевой игре.
Веди точное фактическое описание: расположение персонажей и предметов, их позы и состояния, линии видимости, инвентарь, важные детали окружения.
Описание строго фактическое — без намерений, предположений, мыслей и чувств персонажей.`;
}

export function sceneManagerInitPrompt(worldConfig: WorldConfig, npcConfigs: NpcConfig[]): string {
  const npcDescriptions = npcConfigs
    .map((npc) => `${npc.name}: ${npc.description}. ${npc.initialState}`)
    .join('\n');

  return `# Мир
${worldConfig.setting}

# Начальная сцена
${worldConfig.initialScene}

# Персонажи
${npcDescriptions}

Составь краткое фактическое описание начального состояния сцены.
Укажи расположение каждого персонажа, их позы и состояния, важные объекты и детали окружения.
Не включай цели, намерения, мысли или чувства персонажей.`.trim();
}

export function sceneManagerUpdatePrompt(previousState: string, narrative: string): string {
  return `# Предыдущее состояние сцены
${previousState}

# Новые события (описание рассказчика)
${narrative}

Обнови описание состояния сцены с учётом произошедших событий.
Убирай детали только если новая информация явно противоречит старой. Иначе комбинируй старую и новую информацию.
Если появляется пустота в фактическом описании - заполняй ее самостоятельно.
Не добавляй в описание цели, намерения, мысли, ощущения или чувства персонажей.`.trim();
}

// ---------------------------------------------------------------------------
// NPC fallback narrative strings (used when LLM response cannot be parsed)
// ---------------------------------------------------------------------------

/** Action text used when the LLM returns an empty actions array. */
export const NPC_DEFAULT_ACTION = 'ничего не делает';

/** Action text used when the LLM response cannot be parsed at all. */
export const NPC_CONFUSED_ACTION = 'растерянно стоит на месте';
