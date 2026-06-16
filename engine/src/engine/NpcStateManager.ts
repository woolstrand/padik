import { NpcInnerState } from '../types';

/**
 * NpcStateManager — owns the inner state of every NPC across the session.
 *
 * Mirrors `SceneStateManager` but for the *mental* side of characters: it holds
 * each NPC's immutable persona (identity, character, traits, goals) and mutable
 * mind (inner monologue, last actions). Physical appearance, health and
 * position are NOT tracked here — those belong to the factual scene state in
 * `SceneStateManager`.
 *
 * NPCs are kept in their original turn order so the Orchestrator can iterate
 * them deterministically each turn.
 */
export class NpcStateManager {
  private readonly order: string[];
  private readonly states: Map<string, NpcInnerState>;

  constructor(innerStates: NpcInnerState[]) {
    this.order = innerStates.map((s) => s.persona.id);
    this.states = new Map(innerStates.map((s) => [s.persona.id, cloneInnerState(s)]));
  }

  /** NPC ids in turn order. */
  ids(): string[] {
    return [...this.order];
  }

  /** Current inner state for an NPC. */
  get(npcId: string): NpcInnerState {
    const state = this.states.get(npcId);
    if (!state) {
      throw new Error(`Unknown NPC id: ${npcId}`);
    }
    return state;
  }

  /** Replace an NPC's mutable mind after it has acted this turn. */
  updateMind(
    npcId: string,
    thoughts: string,
    lastActions: string[],
    updatedMood: string,
    updatedAgenda: string[],
    updatedGoals?: string[],
  ): void {
    const state = this.get(npcId);
    state.mind = {
      thoughts,
      mood: updatedMood || state.mind.mood,
      goals: updatedGoals ?? state.mind.goals,
      agenda: [...updatedAgenda],
      lastActions: [...lastActions],
    };
  }

  /** Deep-ish copy of all inner states, for checkpointing. */
  snapshot(): Map<string, NpcInnerState> {
    return new Map(
      Array.from(this.states.entries()).map(([id, s]) => [id, cloneInnerState(s)]),
    );
  }

  /** Restore inner states from a snapshot (checkpoint rollback). */
  restore(snapshot: Map<string, NpcInnerState>): void {
    this.states.clear();
    for (const [id, s] of snapshot.entries()) {
      this.states.set(id, cloneInnerState(s));
    }
  }
}

/** Persona is immutable; mind is copied so snapshots are independent. */
function cloneInnerState(state: NpcInnerState): NpcInnerState {
  return {
    persona: state.persona,
    mind: {
      thoughts: state.mind.thoughts,
      mood: state.mind.mood,
      goals: [...state.mind.goals],
      agenda: [...state.mind.agenda],
      lastActions: [...state.mind.lastActions],
    },
  };
}
