import { NpcDebugData, NpcDebugStep, PlayerAction } from '../types';

/**
 * NpcDebugHelper — collects and stores per-NPC debug data for each turn.
 *
 * Kept separate from NpcProcessor and the NPC state so neither the NPC class
 * hierarchy nor the game state is polluted with debug concerns.
 */
export class NpcDebugHelper {
  private readonly data = new Map<string, NpcDebugData>();

  /**
   * Record a single NPC processing step.
   *
   * @param npcId         NPC identifier
   * @param npcName       Display name
   * @param turn          Current turn number
   * @param recentNarrative  The narrative shown to the NPC as context
   * @param playerAction  The player action (or null for skip)
   * @param thoughts      The NPC's output thoughts
   * @param actions       The NPC's physical actions
   * @param speech        The NPC's spoken lines
   * @param mood          Updated emotional state
   * @param agenda        Updated short-term agenda
   */
  record(
    npcId: string,
    npcName: string,
    turn: number,
    recentNarrative: string,
    playerAction: PlayerAction | null,
    thoughts: string,
    actions: string[],
    speech: string[],
    mood: string,
    agenda: string[],
  ): void {
    if (!this.data.has(npcId)) {
      this.data.set(npcId, { npcId, npcName, steps: [] });
    }

    const playerText = playerAction
      ? playerAction.type === 'say'
        ? `Игрок произнёс: «${playerAction.text}»`
        : `Игрок совершил действие: ${playerAction.text}`
      : 'Игрок не предпринял действий.';

    const situation = `Сцена:\n${recentNarrative}\n\nДействие игрока: ${playerText}`;

    const step: NpcDebugStep = { turn, situation, thoughts, actions, speech, mood, agenda };
    this.data.get(npcId)!.steps.push(step);
  }

  /** Remove all steps recorded at turn >= fromTurn (used when retrying a turn). */
  rollbackToTurn(fromTurn: number): void {
    for (const data of this.data.values()) {
      data.steps = data.steps.filter((step) => step.turn < fromTurn);
    }
  }

  /** Return debug data for all NPCs, ordered by first appearance. */
  getAll(): NpcDebugData[] {
    return Array.from(this.data.values());
  }
}
