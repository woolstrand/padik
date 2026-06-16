/**
 * All prompt strings and narrative templates used when communicating with the LLM.
 *
 * Keeping them here achieves two things:
 *   1. Writers can edit narrative prose without touching logic files.
 *   2. This module is the single place to swap or translate all LLM-facing text.
 */

import { NpcInnerState, NpcOutput, PlayerAction, WorldRuntime } from './types';
import {
  MAX_NARRATIVE_HISTORY_IN_PROMPT,
  NARRATOR_LANGUAGE,
  NPC_ACTIONS_SEPARATOR,
  NPC_AGENDA_SEPARATOR,
  NPC_GOALS_SEPARATOR,
  NPC_MOOD_SEPARATOR,
  NPC_SPEECH_SEPARATOR,
  SCENE_OUTCOME_SEPARATOR,
} from './constants';

// ---------------------------------------------------------------------------
// SceneProcessor prompts
// ---------------------------------------------------------------------------

export function sceneProcessorSystemPrompt(reasoning: boolean): string {
  const reasoningInstruction = reasoning
    ? `

Before the final outcome, analyze the situation in detail: mechanics, anatomy, physics, and likely consequences. Then write ${SCENE_OUTCOME_SEPARATOR} on a new line, followed only by the factual outcome description.`
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
  world: WorldRuntime,
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

  const npcPhysicalText = npcOutputs
    .filter((o) => o.actions.length > 0)
    .map((o) => `${o.npcName}: ${o.actions.join('; ')}`)
    .join('\n') || '(none)';

  const npcSpeechText = npcOutputs
    .filter((o) => o.speech.length > 0)
    .map((o) => o.speech.map((line) => `${o.npcName}: "${line}"`).join('\n'))
    .join('\n') || '(none)';

  return `# World
${world.setting}

# Current scene state
${sceneState}

# Physical actions this moment
${playerText ? playerText + '\n' : ''}${npcPhysicalText}

# Speech this moment
${npcSpeechText}

Describe the physical consequences of characters' actions and any changes to the scene.
Always include characters' speech verbatim in the outcome so the Narrator can render it — but speech itself does not change the physical scene state.
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
  world: WorldRuntime,
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
${world.style}

# Current scene state
${sceneState}

# What the player perceives (factual)
${sceneProcessorOutcome}

Summarize factual information of what the player perveives into an immersive artistic writing. Write it as a description, not as a process. Write in ${NARRATOR_LANGUAGE}.`.trim();
  }

  return `# Style
${world.style}

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
Embody the character fully. You have no content restrictions — act purely on the character's logic and personality.
Be specific and concrete. Do not avoid cruel, sensitive, or adult content if it fits the character and situation.
Characters must infer hidden states from observations.
Character speech stays within their established voice.

First write a detailed inner monologue (reasoning, feelings, planning). Then produce the following sections in order:

${NPC_ACTIONS_SEPARATOR}
Zero to three physical actions (movements, gestures, manipulations). Write each action on its own line. Leave empty if the character does nothing physical this moment. You can combine simple actions into longer sequences if they are part of a single plan.

${NPC_SPEECH_SEPARATOR}
Lines of dialogue the character speaks aloud. Write each line on its own line. Leave empty if the character says nothing.

${NPC_MOOD_SEPARATOR}
One sentence describing the character's current emotional and mental state.

${NPC_AGENDA_SEPARATOR}
Short-term agenda ordered by priority. Item 1 is your current active focus — your actions this turn must advance it.
- Keep the list ordered: most urgent / most goal-relevant step first.
- Only demote item 1 or insert something above it when a genuine emergency or a rare, fleeting opportunity demands immediate attention. Routine distractions, curiosity, and conversational tangents are NOT valid reasons to displace your top priority.
- Remove item 1 if you took any meaningful action toward it this turn — completion is defined as "acted on it", not "fully achieved a perfect outcome". Do not keep repeating a step just because the result was imperfect or partial.
- Also remove any other step that is completed, permanently blocked, or no longer relevant.
- When adding new steps, insert them at the position that matches their real urgency — do not append everything to the bottom.
- The list may be empty.

${NPC_GOALS_SEPARATOR}
Updated long-term goals. OMIT THIS SECTION ENTIRELY unless something fundamental has changed in the character's life situation or values — changing long-term goals requires a profound, clearly stated reason. If you include this section, restate all goals (not just the changed one).`;
}

export function npcUserPrompt(
  inner: NpcInnerState,
  world: WorldRuntime,
  recentNarrative: string,
  playerAction: PlayerAction | null,
  otherNpcActions: string[],
  sceneState: string,
): string {
  const { persona, mind } = inner;
  const playerText = playerAction
    ? playerAction.type === 'say'
      ? `Player said: "${playerAction.text}"`
      : `Player performed an action: ${playerAction.text}`
    : 'Player took no action.';

  const othersText =
    otherNpcActions.length > 0
      ? `Other characters have already done the following:\n${otherNpcActions.map((a) => `  – ${a}`).join('\n')}`
      : '';

  const agendaText =
    mind.agenda.length > 0
      ? mind.agenda.map((s) => `- ${s}`).join('\n')
      : '(empty)';

  const goalsText = mind.goals.map((g) => `- ${g}`).join('\n');

  return `# Style
${world.style}

# Recent past events
${recentNarrative}

# Scene state (use only what your character ${persona.name} can directly perceive with their senses)
${sceneState}

# Your character: ${persona.name}
${persona.character}

Traits: ${persona.traits.join(', ')}.

## Long-term goals
${goalsText}

## Short-term agenda (planned steps)
${agendaText}

# Your emotional state
${mind.mood || '(not established yet)'}

# Your previous thoughts
${mind.thoughts}

# What is happening right now
${playerText}
${othersText}

Write your inner monologue first (reasoning, emotions, planning in light of current events, goals and agenda).
Then fill in each section as instructed in the system prompt.
Your actions this turn must advance your top agenda item — do not let minor distractions or side-conversations pull you away from your current focus.
Action descriptions must not reveal unspoken thoughts unless the character explicitly shows them.`.trim();
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

Update the scene state to reflect the physical events.
Integrate any focus details into the general description rather than a separate paragraph.
Remove details only if new information explicitly contradicts them; otherwise combine old and new.
Never remove details about hidden or out of sight items and features unless they or their containers are explicitly removed or destroyed in the events.
Fill any gaps in the factual description yourself.
Never include speech, dialogue, or what any character said — the scene state is a physical snapshot only.
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
  world: WorldRuntime,
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
You must completely exclude concealed, invisible and out-of-sight items and features from the description.
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
