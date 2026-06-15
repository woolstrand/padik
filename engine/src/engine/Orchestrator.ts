import { NpcDebugHelper } from './NpcDebugHelper';
import { NpcProcessor } from './NpcProcessor';
import { Narrator } from './Narrator';
import { SceneProcessor } from './SceneProcessor';
import { SceneStateManager } from './SceneManager';
import { ObservationProcessor } from './ObservationProcessor';
import { NpcStep } from './steps/NpcStep';
import { NarrateStep } from './steps/NarrateStep';
import { SceneProcessorStep } from './steps/SceneProcessorStep';
import { SceneUpdateStep } from './steps/SceneUpdateStep';
import { ObserveStep } from './steps/ObserveStep';
import {
  GameState,
  ILlmClient,
  NpcConfig,
  NpcDebugData,
  NpcOutput,
  NpcState,
  PlayerAction,
  StoryHistoryEntry,
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
 * Pipeline order each turn:
 *   NPC steps → SceneProcessorStep → NarrateStep → SceneUpdateStep
 *
 * Steps are logically isolated — they receive typed inputs and produce typed
 * outputs without knowledge of each other.  All wiring lives here.
 */
export class Orchestrator {
  private readonly gameState: GameState;
  private readonly debugHelper = new NpcDebugHelper();
  private readonly sceneManager: SceneStateManager;

  // Step objects — created once, reused across turns.
  private readonly npcSteps: Map<string, NpcStep>;
  private readonly sceneProcessorStep: SceneProcessorStep;
  private readonly narrateStep: NarrateStep;
  private readonly sceneUpdateStep: SceneUpdateStep;
  private readonly observeStep: ObserveStep;

  private lastPlayerAction: PlayerAction | null = null;
  private checkpoint: {
    narrativeHistory: string[];
    sceneProcessorHistory: string[];
    sceneProcessorReasoningHistory: string[];
    storyHistory: StoryHistoryEntry[];
    npcStates: Map<string, NpcState>;
    turnCount: number;
    sceneState: string;
  } | null = null;

  constructor(
    npcProcessor: NpcProcessor,
    narrator: Narrator,
    sceneProcessor: SceneProcessor,
    observationProcessor: ObservationProcessor,
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
      sceneProcessorHistory: [],
      sceneProcessorReasoningHistory: [],
      storyHistory: [],
      npcStates,
      worldConfig,
      turnCount: 0,
    };

    this.sceneManager = new SceneStateManager(llmClient, worldConfig, npcConfigs);

    this.npcSteps = new Map(
      npcConfigs.map((npc) => [npc.id, new NpcStep(npcProcessor, npc.name)]),
    );
    this.sceneProcessorStep = new SceneProcessorStep(sceneProcessor);
    this.narrateStep = new NarrateStep(narrator);
    this.sceneUpdateStep = new SceneUpdateStep(this.sceneManager);
    this.observeStep = new ObserveStep(observationProcessor);
  }

  private saveCheckpoint(action: PlayerAction): void {
    this.lastPlayerAction = action;
    this.checkpoint = {
      narrativeHistory: [...this.gameState.narrativeHistory],
      sceneProcessorHistory: [...this.gameState.sceneProcessorHistory],
      sceneProcessorReasoningHistory: [...this.gameState.sceneProcessorReasoningHistory],
      storyHistory: [...this.gameState.storyHistory],
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
    this.gameState.sceneProcessorHistory = [...this.checkpoint.sceneProcessorHistory];
    this.gameState.sceneProcessorReasoningHistory = [...this.checkpoint.sceneProcessorReasoningHistory];
    this.gameState.storyHistory = [...this.checkpoint.storyHistory];
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
   * Normal pipeline: NPC steps → SceneProcessorStep → NarrateStep → SceneUpdateStep
   * Observation pipeline (action type 'observe'): ObserveStep → NarrateStep → SceneUpdateStep
   *
   * In observation mode, NPC steps and SceneProcessor are skipped entirely —
   * the player is perceiving the scene, not acting in it.  The observation
   * outcome plays the role of sceneProcessorOutcome for the Narrator and
   * SceneManager.  sceneProcessorHistory is NOT updated so NPCs do not
   * receive the observation as a "recent events" context on the next turn.
   *
   * Each BoundStep captures its inputs via closure so the main execution loop
   * is a simple iteration with no per-step branching in the Orchestrator.
   */
  private buildPipeline(
    playerAction: PlayerAction | null,
    sceneState: string,
    lastSceneProcessorOutcome: string,
    npcOutputs: NpcOutput[],
    sceneProcessorOutcome: { value: string },
    sceneProcessorReasoning: { value: string },
    narrative: { value: string },
  ): BoundStep[] {
    if (playerAction?.type === 'observe') {
      return this.buildObservationPipeline(playerAction, sceneState, sceneProcessorOutcome, narrative);
    }
    const steps: BoundStep[] = [];

    // ── NPC steps (sequential so each sees prior NPCs' actions this turn) ───
    // NPCs receive the SceneProcessor outcome from the previous turn as their
    // "recent events" context — more factual and useful than narrator prose.
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
            recentNarrative: lastSceneProcessorOutcome,
            playerAction,
            otherNpcActions,
            sceneState,
          });
          npcOutputs.push(output);
          this.debugHelper.record(
            npcId,
            output.npcName,
            this.gameState.turnCount,
            lastSceneProcessorOutcome,
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

    // ── SceneProcessor step ──────────────────────────────────────────────────
    // Resolves what actually happened from player + NPC actions.
    // npcOutputs is a live reference populated by the NPC steps above.
    const sceneProcessorStep = this.sceneProcessorStep;
    steps.push({
      displayName: sceneProcessorStep.displayName,
      execute: async () => {
        const result = await sceneProcessorStep.execute({
          worldConfig: this.gameState.worldConfig,
          sceneState,
          playerAction,
          npcOutputs,
        });
        sceneProcessorOutcome.value = result.outcome;
        sceneProcessorReasoning.value = result.reasoning ?? '';
      },
    });

    // ── Narrator step ────────────────────────────────────────────────────────
    // Converts the SceneProcessor factual outcome into artistic prose.
    // sceneProcessorOutcome.value is set by the step above.
    const narrateStep = this.narrateStep;
    const narrateInput = {
      worldConfig: this.gameState.worldConfig,
      narrativeHistory: this.gameState.narrativeHistory,
      sceneState,
      mode: 'event' as const,
      get sceneProcessorOutcome() { return sceneProcessorOutcome.value; },
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
    // Must be last. Takes both outcomes to produce the updated scene state.
    const sceneUpdateStep = this.sceneUpdateStep;
    steps.push({
      displayName: sceneUpdateStep.displayName,
      execute: async () => {
        await sceneUpdateStep.execute({
          sceneProcessorOutcome: sceneProcessorOutcome.value,
          narratorOutcome: narrative.value,
        });
      },
    });

    return steps;
  }

  /**
   * Observation pipeline: ObserveStep → NarrateStep → SceneUpdateStep.
   *
   * The observation outcome (detailed factual description of what the player
   * perceives) flows into both the Narrator and the SceneManager so that
   * newly revealed details are persisted in scene state.
   */
  private buildObservationPipeline(
    playerAction: PlayerAction,
    sceneState: string,
    observationOutcome: { value: string },
    narrative: { value: string },
  ): BoundStep[] {
    const steps: BoundStep[] = [];

    // ── ObserveStep ──────────────────────────────────────────────────────────
    const observeStep = this.observeStep;
    steps.push({
      displayName: observeStep.displayName,
      execute: async () => {
        observationOutcome.value = await observeStep.execute({
          worldConfig: this.gameState.worldConfig,
          sceneState,
          focusText: playerAction.text,
        });
      },
    });

    // ── Narrator step ────────────────────────────────────────────────────────
    const narrateStep = this.narrateStep;
    const narrateInput = {
      worldConfig: this.gameState.worldConfig,
      narrativeHistory: this.gameState.narrativeHistory,
      sceneState,
      mode: 'observation' as const,
      get sceneProcessorOutcome() { return observationOutcome.value; },
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
    // Persists newly revealed details into the scene state.
    const sceneUpdateStep = this.sceneUpdateStep;
    steps.push({
      displayName: sceneUpdateStep.displayName,
      execute: async () => {
        await sceneUpdateStep.execute({
          sceneProcessorOutcome: observationOutcome.value,
          narratorOutcome: narrative.value,
        });
      },
    });

    return steps;
  }

  async processTurn(playerAction: PlayerAction): Promise<TurnResult> {
    this.saveCheckpoint(playerAction);
    await this.sceneManager.ensureInitialized();

    const sceneState = this.sceneManager.getCurrentState();
    const lastSceneProcessorOutcome =
      this.gameState.sceneProcessorHistory.at(-1) ?? this.gameState.worldConfig.initialScene;
    const playerActionNullable = playerAction.type === 'skip' ? null : playerAction;

    const npcOutputs: NpcOutput[] = [];
    const sceneProcessorOutcome = { value: '' };
    const sceneProcessorReasoning = { value: '' };
    const narrative = { value: '' };

    const pipeline = this.buildPipeline(
      playerActionNullable,
      sceneState,
      lastSceneProcessorOutcome,
      npcOutputs,
      sceneProcessorOutcome,
      sceneProcessorReasoning,
      narrative,
    );

    for (const step of pipeline) {
      await step.execute();
    }

    this.gameState.narrativeHistory.push(narrative.value);
    if (playerAction.type === 'observe') {
      this.gameState.storyHistory.push({ kind: 'observation', turn: this.gameState.turnCount, text: sceneProcessorOutcome.value });
    } else {
      this.gameState.sceneProcessorHistory.push(sceneProcessorOutcome.value);
      this.gameState.sceneProcessorReasoningHistory.push(sceneProcessorReasoning.value);
      this.gameState.storyHistory.push({ kind: 'event', turn: this.gameState.turnCount, text: sceneProcessorOutcome.value, reasoning: sceneProcessorReasoning.value || undefined });
    }
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
    const lastSceneProcessorOutcome =
      this.gameState.sceneProcessorHistory.at(-1) ?? this.gameState.worldConfig.initialScene;
    const playerActionNullable = playerAction.type === 'skip' ? null : playerAction;

    const npcOutputs: NpcOutput[] = [];
    const sceneProcessorOutcome = { value: '' };
    const sceneProcessorReasoning = { value: '' };
    const narrative = { value: '' };

    const pipeline = this.buildPipeline(
      playerActionNullable,
      sceneState,
      lastSceneProcessorOutcome,
      npcOutputs,
      sceneProcessorOutcome,
      sceneProcessorReasoning,
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
    if (playerAction.type === 'observe') {
      this.gameState.storyHistory.push({ kind: 'observation', turn: this.gameState.turnCount, text: sceneProcessorOutcome.value });
    } else {
      this.gameState.sceneProcessorHistory.push(sceneProcessorOutcome.value);
      this.gameState.sceneProcessorReasoningHistory.push(sceneProcessorReasoning.value);
      this.gameState.storyHistory.push({ kind: 'event', turn: this.gameState.turnCount, text: sceneProcessorOutcome.value, reasoning: sceneProcessorReasoning.value || undefined });
    }
    this.gameState.turnCount++;

    const doneEvent: TurnDoneEvent = {
      type: 'done',
      narrative: narrative.value,
      npcOutputs,
      sceneState: this.sceneManager.getCurrentState(),
      storyHistory: [...this.gameState.storyHistory],
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

  cancelTurn(): void {
    this.restoreCheckpoint();
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
