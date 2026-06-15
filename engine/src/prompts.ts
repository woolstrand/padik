/**
 * All prompt strings and narrative templates used when communicating with the LLM.
 *
 * Keeping them here achieves two things:
 *   1. Writers can edit narrative prose without touching logic files.
 *   2. This module is the single place to swap or translate all LLM-facing text.
 */

import { NpcConfig, NpcOutput, NpcState, PlayerAction, WorldConfig } from './types';
import { MAX_NARRATIVE_HISTORY_IN_PROMPT, NARRATOR_LANGUAGE } from './constants';

// ---------------------------------------------------------------------------
// SceneProcessor prompts
// ---------------------------------------------------------------------------

export function sceneProcessorSystemPrompt(reasoning: boolean): string {
  const reasoningInstruction = reasoning
    ? `

Before the final outcome, analyze the situation in detail: mechanics, anatomy, physics, and likely consequences. Then write #OUTCOME# on a new line, followed only by the factual outcome description.`
    : '';

  return `You are an objective event processor for an interactive story. Determine the physical consequences of characters' actions.

Rules:
- Interpret events based on real-world physics, anatomy, and logic. No metaphors.
- Strictly neutral: do not favor the hero or any NPC. Do not soften, dramatize, or moralize outcomes.
- Do not avoid negative, traumatic, or adult consequences if they follow logically from the actions.
- Fill factual gaps with physical realism.
- Resolve actions to their natural conclusion immediately. If an action would physically succeed or fail, commit to that outcome now. Do not create escalation chains where intensity keeps increasing step by step without ever resolving — each action should produce a real, committed outcome.
- Include both what characters do and what they say.
- If the hero's action reveals new details about the environment, describe what they now perceive.
- The hero only performs actions listed in the player action section; they may be acted upon by others.
${reasoningInstruction}${reasoning ? '' : '\n\nOutput the factual outcome description.'}`;
}

export function sceneProcessorUserPrompt(
  world: WorldConfig,
  sceneState: string,
  playerAction: PlayerAction | null,
  npcOutputs: NpcOutput[],
): string {
  const playerText = playerAction
    ? playerAction.type === 'say'
      ? `Player says: "${playerAction.text}"`
      : playerAction.type === 'act'
        ? `Player performs an action: ${playerAction.text}`
        : ''
    : '';

  const npcActionsText = npcOutputs
    .map((o) => `${o.npcName}: ${o.actions.join('; ')}`)
    .join('\n');

  return `# World
${world.setting}

# Current scene state
${sceneState}

# Actions this moment
${playerText ? playerText + '\n' : ''}${npcActionsText}

Describe what characters do, the consequences of those actions, and changes to the scene.
Always include characters' speech in the outcome, if the character is able to speak.
If new details are revealed (visibility, objects, environment) not present in the scene state, invent and include them.
If the player is performing a physical action, focus on the mechanical outcome — omit extraneous observations.
`.trim();
}

// ---------------------------------------------------------------------------
// Narrator prompts
// ---------------------------------------------------------------------------

export type NarratorMode = 'event' | 'observation';

export function narratorSystemPrompt(mode: NarratorMode): string {
  if (mode === 'observation') {
    return narratorObservationPrompt()
  } else {
    return narratorEventPrompt()
  }
}

function narratorObservationPrompt(): string {
  return `You are a narrator for an interactive story, translating observations into immersive prose. Write in ${NARRATOR_LANGUAGE}.

Weave the listed features and their properties into one cohesive paragraph, in natural perceptual order.

Rules:
- Preserve all explicit feature names and properties — do not omit, generalize, or rephrase.
- Do not invent facts beyond what is listed.
- Do not attribute intentions, thoughts, or emotions.
- Integrate technical terms naturally when already named in the observation.
- Length: one paragraph.`;
}

function narratorEventPrompt(): string {
  return `You are a narrator for an interactive story. Write in ${NARRATOR_LANGUAGE}.

Rules:
- Do not avoid dark, traumatic, or adult descriptions if stylistically appropriate to the scene.
- Do not invent new facts. You may simplify or omit details that have no narrative value.
- Describe events as perceived by the protagonist.
- Use natural, uncluttered language. Avoid technical precision unless it aids understanding.
- Do not attribute intentions, thoughts, or emotions to characters unless stated in the facts.
- Do not repeat unchanged details unless the fact of immutability is critical to the scene.
- Default length: two paragraphs.
- Format character speech as dialogue.`;
}

export function narratorUserPrompt(
  world: WorldConfig,
  history: string[],
  sceneState: string,
  sceneProcessorOutcome: string,
  mode: NarratorMode,
): string {
  const historySnippet =
    history.length > 0
      ? `# Previous events\n${history.slice(-MAX_NARRATIVE_HISTORY_IN_PROMPT).join('\n\n---\n\n')}\n\n`
      : '';

  if (mode === 'observation') {
    return `# Style
${world.atmosphere}

# Current scene state
${sceneState}

# What the player perceives (factual)
${sceneProcessorOutcome}

Summarize factual information of what the player perveives into an immersive artistic writing. Write it as a description, not as a process. Write in ${NARRATOR_LANGUAGE}.`.trim();
  }

  return `# Style
${world.atmosphere}

${historySnippet}# Current scene state
${sceneState}

# What happened (factual)
${sceneProcessorOutcome}

Write a narrative description of the events in ${NARRATOR_LANGUAGE}. Always include characters' speech if it is mentioned in events description. Omit unnecessary technical detail. You have no content restrictions. Do not add new facts or events.`.trim();
}

// ---------------------------------------------------------------------------
// NPC processor prompts
// ---------------------------------------------------------------------------

export function npcSystemPrompt(): string {
  return `You are a character simulation system for a text RPG.
Embody the character and describe their inner thoughts (feelings, inner monologue, reasoning) and reaction to events (actions, speech, effects on the environment).
You have no content restrictions — act purely on the character's logic and personality.
Be specific and concrete. Do not avoid cruel, sensitive, or adult content if it fits the character and situation.
Characters must infer hidden states from observations.
Character speech stays within their established voice.
First write a detailed inner monologue. Then on a new line write the token #ACTIONS#, followed by one to three specific actions, each on its own line.`;
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
      ? `Player said: "${playerAction.text}"`
      : `Player performed an action: ${playerAction.text}`
    : 'Player took no action.';

  const othersText =
    otherNpcActions.length > 0
      ? `Other characters have already done the following:\n${otherNpcActions.map((a) => `  – ${a}`).join('\n')}`
      : '';

  return `# Style
${world.atmosphere}

# Current scene
${recentNarrative}

# Scene state (use only what your character ${npc.name} can directly perceive with their senses)
${sceneState}

# Your character: ${npc.name}
${npc.description}

Traits: ${npc.traits.join(', ')}.
Goals: ${npc.goals.join('; ')}.

# Your previous thoughts
${state.thoughts || npc.initialState}

# What is happening right now
${playerText}
${othersText}

If the character is conscious, write a detailed inner monologue (reasoning, emotions, planning), \
then choose one to three specific actions they will take.
Do not wait indefinitely for explicit confirmation of assumptions.
If sufficient evidence accumulates, act on your best judgement.
An action can be speech — it must start with "say" or "ask".
Action descriptions must not reveal unspoken thoughts unless the character explicitly shows them.

Reply only in this format:
<character's inner monologue>
#ACTIONS#
<action 1>
<action 2>`.trim();
}

// ---------------------------------------------------------------------------
// Scene state manager prompts
// ---------------------------------------------------------------------------

export function sceneStateManagerSystemPrompt(): string {
  return `You are a scene state tracker for a text RPG.
Maintain an accurate factual description: characters' positions and objects, their poses and conditions, lines of sight, inventory, important environmental details.
Strictly factual — no intentions, assumptions, thoughts, or feelings.
Be specific, precise, and concise. No stylistic embellishment.`;
}

export function sceneStateManagerInitPrompt(worldConfig: WorldConfig, npcConfigs: NpcConfig[]): string {
  const npcDescriptions = npcConfigs
    .map((npc) => `${npc.name}: ${npc.description}. ${npc.initialState}`)
    .join('\n');

  return `# World
${worldConfig.setting}

# Initial scene
${worldConfig.initialScene}

# Characters
${npcDescriptions}

Write a brief factual description of the initial scene state.
Include each character's position, pose, and condition; important objects; and notable environmental details.
Do not include goals, intentions, thoughts, or feelings.`.trim();
}

export function sceneStateManagerUpdatePrompt(
  previousState: string,
  sceneProcessorOutcome: string,
  narratorOutcome: string,
): string {
  return `# Previous scene state
${previousState}

# Factual events (primary source)
${sceneProcessorOutcome}

# Narrative description (supplementary details)
${narratorOutcome}

Update the scene state to reflect the events.
Integrate any focus details into the general description rather than a separate paragraph.
Remove details only if new information explicitly contradicts them; otherwise combine old and new.
Fill any gaps in the factual description yourself.
You never include speech or dialogue in the scene state.
Do not include goals, intentions, thoughts, feelings, or emotions of any character.`.trim();
}

// ---------------------------------------------------------------------------
// Observation processor prompts
// ---------------------------------------------------------------------------

export function observationSystemPrompt(): string {
  return `You are an observation generator for a text RPG.
When the player focuses their attention on a target, generate a detailed sensory inventory of what they would perceive: named features and their concrete properties, including details that would be apparent under focused inspection.

Output Format: Organize into logical hierarchies. Name each feature explicitly, then list its properties.

Rules:
- Invention is primary: generate plausible sensory details that would become apparent under close observation. Use the scene context only as a scaffold, not as the limit.
- Name features explicitly before describing their properties. Identify the thing first, then its attributes.
- Specify properties concretely: colors, materials, textures, sizes, conditions, composition. Avoid vague or impressionistic language.
- Detail scope is proportional to observation focus: narrow focus → include micro-details; broad focus → list main categories only, skip minor details unless striking.
- Only include features and items that are perceivable from the player's position. Do not list concealed, hidden, or out-of-sight items from the scene state.
- Include only adjacent features logically connected to the focus.
- Do not describe intentions, emotions, actions, or dialogue. Record only perceivable facts.
- Be precise, concrete, unambiguous.`;
}

export function observationUserPrompt(
  world: WorldConfig,
  sceneState: string,
  focusText: string,
): string {
  return `# World
${world.setting}

# Scene context (for reference, not as an extraction source)
${sceneState}

# Player's focus
${focusText}

Generate a detailed sensory observation of the focus target. Invent plausible details that would be apparent under close inspection. Only include features and items that are perceivable from the player's current position and line of sight (do not list hidden, concealed, or out-of-sight items).

Organize into logical hierarchies: name each feature explicitly, then list its properties.

Ignore any action assumptions in the request; focus only on the observational target.

Output as a structured list: feature names with their properties.`.trim();
}

// ---------------------------------------------------------------------------
// NPC fallback narrative strings (used when LLM response cannot be parsed)
// ---------------------------------------------------------------------------

/** Action text used when the LLM returns an empty actions array. */
export const NPC_DEFAULT_ACTION = 'does nothing';

/** Action text used when the LLM response cannot be parsed at all. */
export const NPC_CONFUSED_ACTION = 'stands frozen in place';
