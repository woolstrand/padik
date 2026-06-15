/**
 * Prompts used exclusively at session-load time by the SessionLoader.
 *
 * These are kept separate from the in-game prompts in `prompts.ts`: they run
 * once, when a session is initialised, to bake the raw story configuration
 * into the engine's initial runtime state (e.g. the first factual scene state).
 * Per-turn gameplay prompts must NOT live here.
 */

import { NpcPersona, WorldRuntime } from './types';

/** Appearance of a single NPC as seen when building the initial scene state. */
export interface NpcAppearance {
  name: string;
  appearance: string;
}

export function initialSceneStateSystemPrompt(): string {
  return `You are a scene state tracker for a text RPG.
Produce an accurate factual description of the starting scene: characters' positions and objects, their poses and conditions, lines of sight, inventory, important environmental details.
Strictly factual — no intentions, assumptions, thoughts, or feelings.
Be specific, precise, and concise. No stylistic embellishment.`;
}

export function initialSceneStateUserPrompt(
  world: WorldRuntime,
  playerDescription: string,
  npcs: NpcAppearance[],
): string {
  const npcDescriptions = npcs
    .map((npc) => `${npc.name}: ${npc.appearance}`)
    .join('\n');

  return `# World
${world.setting}

# Player (protagonist present in the scene)
${playerDescription}

# Characters (physical appearance)
${npcDescriptions}

Write a brief factual description of the initial scene state.
Include each character's position, pose, and physical condition; important objects; and notable environmental details.
Do not include goals, intentions, thoughts, or feelings.`.trim();
}
