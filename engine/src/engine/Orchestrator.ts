import { Narrator } from './Narrator';
import { NpcProcessor } from './NpcProcessor';
import { NpcDebugHelper } from './NpcDebugHelper';
import {
  GameState,
  NpcConfig,
  NpcDebugData,
  NpcOutput,
  NpcState,
  PlayerAction,
  TurnDoneEvent,
  TurnResult,
  TurnStreamEvent,
  WorldConfig,
} from '../types';

/**
 * Orchestrator — the central data-flow coordinator.
 *
 * Responsibilities:
 *   1. Maintain game state (narrative history, NPC states).
 *   2. On each turn: route the player action to every NPC processor in order,
 *      accumulating their outputs so each NPC can see what previous NPCs did.
 *   3. Forward all NPC outputs and the player action to the Narrator.
 *   4. Store the resulting narrative and return it to the API layer.
 */
export class Orchestrator {
  private readonly gameState: GameState;
  private readonly debugHelper = new NpcDebugHelper();

  constructor(
    private readonly npcProcessor: NpcProcessor,
    private readonly narrator: Narrator,
    npcConfigs: NpcConfig[],
    worldConfig: WorldConfig,
  ) {
    const npcStates = new Map<string, NpcState>();
    for (const npc of npcConfigs) {
      npcStates.set(npc.id, {
        npc,
        thoughts: npc.initialState,
        lastActions: [],
      });
    }

    this.gameState = {
      narrativeHistory: [],
      npcStates,
      worldConfig,
      turnCount: 0,
    };
  }

  async processTurn(playerAction: PlayerAction): Promise<TurnResult> {
    const recentNarrative =
      this.gameState.narrativeHistory.at(-1) ?? this.gameState.worldConfig.initialScene;

    const npcOutputs: NpcOutput[] = [];
    const npcIds = Array.from(this.gameState.npcStates.keys());

    // Process NPCs sequentially so each NPC can see prior NPCs' actions this turn
    for (const npcId of npcIds) {
      const state = this.gameState.npcStates.get(npcId)!;

      const otherNpcActions = npcOutputs.map(
        (o) => `${o.npcName}: ${o.actions.join(', ')}`,
      );

      const output = await this.npcProcessor.process(
        state.npc,
        state,
        this.gameState.worldConfig,
        recentNarrative,
        playerAction.type === 'skip' ? null : playerAction,
        otherNpcActions,
      );

      npcOutputs.push(output);

      // Record step in debug helper
      this.debugHelper.record(
        npcId,
        output.npcName,
        this.gameState.turnCount,
        recentNarrative,
        playerAction.type === 'skip' ? null : playerAction,
        output.thoughts,
        output.actions,
      );

      // Persist thoughts for the next turn; actions are ephemeral
      this.gameState.npcStates.set(npcId, {
        ...state,
        thoughts: output.thoughts,
        lastActions: output.actions,
      });
    }

    const narrative = await this.narrator.narrate(
      this.gameState.worldConfig,
      this.gameState.narrativeHistory,
      playerAction.type === 'skip' ? null : playerAction,
      npcOutputs,
    );

    this.gameState.narrativeHistory.push(narrative);
    this.gameState.turnCount++;

    return { narrative, npcOutputs };
  }

  /**
   * Streaming variant of processTurn.
   * Yields TurnStreamEvents:
   *   - npc:start / npc:done for each NPC as it is processed
   *   - narrator:token for each streamed narrator token
   *   - done with the final narrative and npcOutputs
   */
  async *processTurnStream(playerAction: PlayerAction): AsyncGenerator<TurnStreamEvent> {
    const recentNarrative =
      this.gameState.narrativeHistory.at(-1) ?? this.gameState.worldConfig.initialScene;

    const npcOutputs: NpcOutput[] = [];
    const npcIds = Array.from(this.gameState.npcStates.keys());

    for (const npcId of npcIds) {
      const state = this.gameState.npcStates.get(npcId)!;

      yield { type: 'npc:start', npcId, npcName: state.npc.name };

      const otherNpcActions = npcOutputs.map(
        (o) => `${o.npcName}: ${o.actions.join(', ')}`,
      );

      const output = await this.npcProcessor.process(
        state.npc,
        state,
        this.gameState.worldConfig,
        recentNarrative,
        playerAction.type === 'skip' ? null : playerAction,
        otherNpcActions,
      );

      npcOutputs.push(output);
      yield { type: 'npc:done', npcId, npcName: state.npc.name, npcOutput: output };

      this.debugHelper.record(
        npcId,
        output.npcName,
        this.gameState.turnCount,
        recentNarrative,
        playerAction.type === 'skip' ? null : playerAction,
        output.thoughts,
        output.actions,
      );

      this.gameState.npcStates.set(npcId, {
        ...state,
        thoughts: output.thoughts,
        lastActions: output.actions,
      });
    }

    let narrative = '';
    for await (const token of this.narrator.narrateStream(
      this.gameState.worldConfig,
      this.gameState.narrativeHistory,
      playerAction.type === 'skip' ? null : playerAction,
      npcOutputs,
    )) {
      narrative += token;
      yield { type: 'narrator:token', token };
    }

    this.gameState.narrativeHistory.push(narrative);
    this.gameState.turnCount++;

    const doneEvent: TurnDoneEvent = { type: 'done', narrative, npcOutputs };
    yield doneEvent;
  }

  getGameState(): Readonly<GameState> {
    return this.gameState;
  }

  getDebugData(): NpcDebugData[] {
    return this.debugHelper.getAll();
  }
}
