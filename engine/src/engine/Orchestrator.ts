import { NpcDebugHelper } from './NpcDebugHelper';
import { NpcProcessor } from './NpcProcessor';
import { Narrator } from './Narrator';
import { SceneManager } from './SceneManager';
import { NpcStep } from './steps/NpcStep';
import { NarrateStep } from './steps/NarrateStep';
import { SceneUpdateStep } from './steps/SceneUpdateStep';
import {
  GameState,
  ILlmClient,
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
 * An execution unit inside a turn's pipeline with all inputs pre-bound via
 * closures.  The Orchestrator iterates these in order each turn.
 */
interface BoundStep {
  displayName: string;
  execute(): Promise<void>;
  /**
   * Optional streaming variant — yields raw text tokens.
   * When present, the Orchestrator uses this instead of execute() and
   * forwards each token as a narrator:token event.
   */
  executeStream?(): AsyncIterable<string>;
}

/**
 * Orchestrator — the central data-flow coordinator.
 *
 * Responsibilities:
 *   1. Maintain game state (narrative history, NPC states).
 *   2. At the start of each turn build an ordered BoundStep pipeline.
 *   3. Iterate the pipeline, passing inputs (derived from game state) to each
 *      step and routing their outputs back into game state.
 *   4. Expose both blocking (processTurn) and streaming (processTurnStream)
 *      variants.
 *
 * Steps are logically isolated — they receive typed inputs and produce typed
 * outputs without knowledge of each other.  All wiring lives here.
 */
export class Orchestrator {
  private readonly gameState: GameState;
  private readonly debugHelper = new NpcDebugHelper();
  private readonly sceneManager: SceneManager;

  // Step objects — created once, reused across turns.
  private readonly npcSteps: Map<string, NpcStep>;
  private readonly narrateStep: NarrateStep;
  private readonly sceneUpdateStep: SceneUpdateStep;

  private lastPlayerAction: PlayerAction | null = null;
  private checkpoint: {
    narrativeHistory: string[];
    npcStates: Map<string, NpcState>;
    turnCount: number;
    sceneState: string;
  } | null = null;

  constructor(
    npcProcessor: NpcProcessor,
    narrator: Narrator,
    npcConfigs: NpcConfig[],
    worldConfig: WorldConfig,
    llmClient: ILlmClient,
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

    this.sceneManager = new SceneManager(llmClient, worldConfig, npcConfigs);

    this.npcSteps = new Map(
      npcConfigs.map((npc) => [npc.id, new NpcStep(npcProcessor, npc.name)]),
    );
    this.narrateStep = new NarrateStep(narrator);
    this.sceneUpdateStep = new SceneUpdateStep(this.sceneManager);
  }

  private saveCheckpoint(action: PlayerAction): void {
    this.lastPlayerAction = action;
    this.checkpoint = {
      narrativeHistory: [...this.gameState.narrativeHistory],
      npcStates: new Map(
        Array.from(this.gameState.npcStates.entries()).map(([k, v]) => [k, { ...v }]),
      ),
      turnCount: this.gameState.turnCount,
      sceneState: this.sceneManager.getCurrentState(),
    };
  }

  private restoreCheckpoint(): void {
    if (!this.checkpoint) return;
    this.gameState.narrativeHistory = [...this.checkpoint.narrativeHistory];
    this.gameState.npcStates = new Map(
      Array.from(this.checkpoint.npcStates.entries()).map(([k, v]) => [k, { ...v }]),
    );
    this.gameState.turnCount = this.checkpoint.turnCount;
    this.debugHelper.rollbackToTurn(this.checkpoint.turnCount);
    this.sceneManager.restoreState(this.checkpoint.sceneState);
  }

  /**
   * Builds the ordered pipeline for a single turn.
   *
   * Each BoundStep captures its inputs via closure so the main execution loop
   * is a simple iteration with no per-step branching in the Orchestrator.
   * Routing of intermediate results (npcOutputs → narrator, narrative →
   * scene-update) is handled here.
   */
  private buildPipeline(
    playerAction: PlayerAction | null,
    sceneState: string,
    recentNarrative: string,
    npcOutputs: NpcOutput[],
    narrative: { value: string },
  ): BoundStep[] {
    const steps: BoundStep[] = [];

    // ── NPC steps (sequential so each sees prior NPCs' actions this turn) ───
    for (const npcId of this.gameState.npcStates.keys()) {
      const npcStep = this.npcSteps.get(npcId)!;
      steps.push({
        displayName: npcStep.displayName,
        execute: async () => {
          const state = this.gameState.npcStates.get(npcId)!;
          const otherNpcActions = npcOutputs.map(
            (o) => `${o.npcName}: ${o.actions.join(', ')}`,
          );
          const output = await npcStep.execute({
            npcConfig: state.npc,
            npcState: state,
            worldConfig: this.gameState.worldConfig,
            recentNarrative,
            playerAction,
            otherNpcActions,
            sceneState,
          });
          npcOutputs.push(output);
          this.debugHelper.record(
            npcId,
            output.npcName,
            this.gameState.turnCount,
            recentNarrative,
            playerAction,
            output.thoughts,
            output.actions,
          );
          this.gameState.npcStates.set(npcId, {
            ...state,
            thoughts: output.thoughts,
            lastActions: output.actions,
          });
        },
      });
    }

    // ── Narrator step ────────────────────────────────────────────────────────
    // narrateInput.npcOutputs is a live reference — it will be populated by
    // the NPC steps above before the narrator step executes.
    const narrateStep = this.narrateStep;
    const narrateInput = {
      worldConfig: this.gameState.worldConfig,
      narrativeHistory: this.gameState.narrativeHistory,
      playerAction,
      npcOutputs,
      sceneState,
    };
    steps.push({
      displayName: narrateStep.displayName,
      execute: async () => {
        narrative.value = await narrateStep.execute(narrateInput);
      },
      async *executeStream() {
        for await (const token of narrateStep.narrateStream(narrateInput)) {
          narrative.value += token;
          yield token;
        }
      },
    });

    // ── Scene update step ────────────────────────────────────────────────────
    // narrative.value is set by the narrator step which precedes this one.
    const sceneUpdateStep = this.sceneUpdateStep;
    steps.push({
      displayName: sceneUpdateStep.displayName,
      execute: async () => {
        await sceneUpdateStep.execute({ narrative: narrative.value });
      },
    });

    return steps;
  }

  async processTurn(playerAction: PlayerAction): Promise<TurnResult> {
    this.saveCheckpoint(playerAction);
    await this.sceneManager.ensureInitialized();

    const sceneState = this.sceneManager.getCurrentState();
    const recentNarrative =
      this.gameState.narrativeHistory.at(-1) ?? this.gameState.worldConfig.initialScene;
    const playerActionNullable = playerAction.type === 'skip' ? null : playerAction;

    const npcOutputs: NpcOutput[] = [];
    const narrative = { value: '' };

    const pipeline = this.buildPipeline(
      playerActionNullable,
      sceneState,
      recentNarrative,
      npcOutputs,
      narrative,
    );

    for (const step of pipeline) {
      await step.execute();
    }

    this.gameState.narrativeHistory.push(narrative.value);
    this.gameState.turnCount++;

    return { narrative: narrative.value, npcOutputs };
  }

  /**
   * Streaming variant of processTurn.
   * Yields TurnStreamEvents:
   *   - step:start / step:done for each pipeline step as it executes
   *   - narrator:token for each streamed narrator token
   *   - done with the final narrative and npcOutputs
   */
  async *processTurnStream(playerAction: PlayerAction): AsyncGenerator<TurnStreamEvent> {
    this.saveCheckpoint(playerAction);
    await this.sceneManager.ensureInitialized();

    const sceneState = this.sceneManager.getCurrentState();
    const recentNarrative =
      this.gameState.narrativeHistory.at(-1) ?? this.gameState.worldConfig.initialScene;
    const playerActionNullable = playerAction.type === 'skip' ? null : playerAction;

    const npcOutputs: NpcOutput[] = [];
    const narrative = { value: '' };

    const pipeline = this.buildPipeline(
      playerActionNullable,
      sceneState,
      recentNarrative,
      npcOutputs,
      narrative,
    );

    for (const step of pipeline) {
      yield { type: 'step:start', displayName: step.displayName };

      if (step.executeStream) {
        for await (const token of step.executeStream()) {
          yield { type: 'narrator:token', token };
        }
      } else {
        await step.execute();
      }

      yield { type: 'step:done', displayName: step.displayName };
    }

    this.gameState.narrativeHistory.push(narrative.value);
    this.gameState.turnCount++;

    const doneEvent: TurnDoneEvent = {
      type: 'done',
      narrative: narrative.value,
      npcOutputs,
      sceneState: this.sceneManager.getCurrentState(),
    };
    yield doneEvent;
  }

  async *retryLastTurnStream(): AsyncGenerator<TurnStreamEvent> {
    if (!this.lastPlayerAction || !this.checkpoint) {
      yield { type: 'error', message: 'No previous turn to retry.' };
      return;
    }
    const action = this.lastPlayerAction;
    this.restoreCheckpoint();
    yield* this.processTurnStream(action);
  }

  get hasLastTurn(): boolean {
    return this.lastPlayerAction !== null && this.checkpoint !== null;
  }

  getGameState(): Readonly<GameState> {
    return this.gameState;
  }

  getSceneState(): string {
    return this.sceneManager.getCurrentState();
  }

  getDebugData(): NpcDebugData[] {
    return this.debugHelper.getAll();
  }
}
