import { NpcDebugHelper } from './NpcDebugHelper';
import { NpcProcessor } from './NpcProcessor';
import { Narrator } from './Narrator';
import { SceneProcessor } from './SceneProcessor';
import { SceneStateManager } from './SceneManager';
import { NpcStateManager } from './NpcStateManager';
import { ObservationProcessor } from './ObservationProcessor';
import { PlayerActionInterpreter } from './PlayerActionInterpreter';
import { NpcStep } from './steps/NpcStep';
import { NarrateStep } from './steps/NarrateStep';
import { SceneProcessorStep } from './steps/SceneProcessorStep';
import { SceneUpdateStep } from './steps/SceneUpdateStep';
import { ObserveStep } from './steps/ObserveStep';
import { PlayerIntentStep } from './steps/PlayerIntentStep';
import {
  EngineInitialState,
  GameState,
  ILlmClient,
  NpcDebugData,
  NpcInnerState,
  NpcOutput,
  OrchestratorSaveData,
  PlayerAction,
  StoryHistoryEntry,
  TurnDoneEvent,
  TurnResult,
  TurnStreamEvent,
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
 * Mutable per-turn context shared across all pipeline steps.
 *
 * Steps read their inputs and write their outputs into this object.
 * This replaces individual mutable boxes ({ value: string }) and the
 * loosely-captured npcOutputs array, making the produce/consume
 * relationships explicit and centralised.
 */
interface TurnContext {
  readonly sceneState: string;
  readonly lastSceneProcessorOutcome: string;
  readonly playerAction: PlayerAction | null;
  npcOutputs: NpcOutput[];
  sceneProcessorOutcome: string;
  sceneProcessorReasoning: string;
  narrative: string;
  /** Set by PlayerIntentStep: true when the player is not physically intervening. */
  playerIsPassive: boolean;
  /** Set by PlayerIntentStep: English past-tense third-person restatement of the player act. Empty for say/skip/observe. */
  normalizedPlayerAction: string;
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
  private readonly npcStateManager: NpcStateManager;

  /** Opening narrative — first message shown to the player and the NPCs' first-turn context. */
  private readonly opening: string;

  // Step objects — created once, reused across turns.
  private readonly npcSteps: Map<string, NpcStep>;
  private readonly sceneProcessorStep: SceneProcessorStep;
  private readonly narrateStep: NarrateStep;
  private readonly sceneUpdateStep: SceneUpdateStep;
  private readonly observeStep: ObserveStep;
  private readonly playerIntentStep: PlayerIntentStep;

  private lastPlayerAction: PlayerAction | null = null;
  private checkpoint: {
    narrativeHistory: string[];
    sceneProcessorHistory: string[];
    sceneProcessorReasoningHistory: string[];
    storyHistory: StoryHistoryEntry[];
    npcStates: Map<string, NpcInnerState>;
    turnCount: number;
    sceneState: string;
    passiveTurnCount: number;
  } | null = null;

  constructor(
    npcProcessor: NpcProcessor,
    narrator: Narrator,
    sceneProcessor: SceneProcessor,
    observationProcessor: ObservationProcessor,
    initialState: EngineInitialState,
    llmClient: ILlmClient,
  ) {
    this.gameState = {
      narrativeHistory: [],
      sceneProcessorHistory: [],
      sceneProcessorReasoningHistory: [],
      storyHistory: [],
      world: initialState.world,
      turnCount: 0,
      passiveTurnCount: 0,
    };

    this.opening = initialState.opening;
    this.npcStateManager = new NpcStateManager(initialState.npcInnerStates);
    this.sceneManager = new SceneStateManager(llmClient, initialState.initialSceneState);

    this.npcSteps = new Map(
      initialState.npcInnerStates.map((npc) => [
        npc.persona.id,
        new NpcStep(npcProcessor, npc.persona.name),
      ]),
    );
    this.sceneProcessorStep = new SceneProcessorStep(sceneProcessor);
    this.narrateStep = new NarrateStep(narrator);
    this.sceneUpdateStep = new SceneUpdateStep(this.sceneManager);
    this.observeStep = new ObserveStep(observationProcessor);
    this.playerIntentStep = new PlayerIntentStep(new PlayerActionInterpreter(llmClient));
  }

  private saveCheckpoint(action: PlayerAction): void {
    this.lastPlayerAction = action;
    this.checkpoint = {
      narrativeHistory: [...this.gameState.narrativeHistory],
      sceneProcessorHistory: [...this.gameState.sceneProcessorHistory],
      sceneProcessorReasoningHistory: [...this.gameState.sceneProcessorReasoningHistory],
      storyHistory: [...this.gameState.storyHistory],
      npcStates: this.npcStateManager.snapshot(),
      turnCount: this.gameState.turnCount,
      sceneState: this.sceneManager.getCurrentState(),
      passiveTurnCount: this.gameState.passiveTurnCount,
    };
  }

  private restoreCheckpoint(): void {
    if (!this.checkpoint) return;
    this.gameState.narrativeHistory = [...this.checkpoint.narrativeHistory];
    this.gameState.sceneProcessorHistory = [...this.checkpoint.sceneProcessorHistory];
    this.gameState.sceneProcessorReasoningHistory = [...this.checkpoint.sceneProcessorReasoningHistory];
    this.gameState.storyHistory = [...this.checkpoint.storyHistory];
    this.npcStateManager.restore(this.checkpoint.npcStates);
    this.gameState.turnCount = this.checkpoint.turnCount;
    this.gameState.passiveTurnCount = this.checkpoint.passiveTurnCount;
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
  private buildPipeline(ctx: TurnContext): BoundStep[] {
    if (ctx.playerAction?.type === 'observe') {
      return this.buildObservationPipeline(ctx);
    }
    const steps: BoundStep[] = [];

    // ── Player intent classification ─────────────────────────────────────────
    // Runs first so all subsequent steps can use ctx.playerIsPassive.
    const playerIntentStep = this.playerIntentStep;
    const worldForIntent = this.gameState.world;
    steps.push({
      displayName: playerIntentStep.displayName,
      execute: async () => {
        ctx.playerIsPassive = await playerIntentStep.execute({
          playerAction: ctx.playerAction,
          world: worldForIntent,
        }).then((result) => {
          ctx.normalizedPlayerAction = result.normalizedAction;
          return result.isPassive;
        });
      },
    });

    // ── NPC steps (sequential so each sees prior NPCs' actions this turn) ───
    // NPCs receive the SceneProcessor outcome from the previous turn as their
    // "recent events" context — more factual and useful than narrator prose.
    for (const npcId of this.npcStateManager.ids()) {
      const npcStep = this.npcSteps.get(npcId)!;
      steps.push({
        displayName: npcStep.displayName,
        execute: async () => {
          const innerState = this.npcStateManager.get(npcId);
          const otherNpcActions = ctx.npcOutputs.map((o) => {
            const combined = [...o.actions, ...o.speech];
            return `${o.npcName}: ${combined.join(', ')}`;
          });
          const output = await npcStep.execute({
            innerState,
            world: this.gameState.world,
            recentNarrative: ctx.lastSceneProcessorOutcome,
            playerAction: ctx.playerAction,
            otherNpcActions,
            sceneState: ctx.sceneState,
            passiveTurnCount: this.gameState.passiveTurnCount,
            playerIsPassive: ctx.playerIsPassive,
            normalizedPlayerAction: ctx.normalizedPlayerAction,
          });
          ctx.npcOutputs.push(output);
          this.debugHelper.record(
            npcId,
            output.npcName,
            this.gameState.turnCount,
            ctx.lastSceneProcessorOutcome,
            ctx.playerAction,
            output.thoughts,
            output.actions,
            output.speech,
            output.updatedMood,
            output.updatedAgenda,
          );
          this.npcStateManager.updateMind(
            npcId,
            output.thoughts,
            output.actions,
            output.updatedMood,
            output.updatedAgenda,
            output.updatedGoals,
          );
        },
      });
    }

    // ── SceneProcessor step ──────────────────────────────────────────────────
    // Resolves what actually happened from player + NPC actions.
    // ctx.npcOutputs is populated sequentially by the NPC steps above.
    const sceneProcessorStep = this.sceneProcessorStep;
    steps.push({
      displayName: sceneProcessorStep.displayName,
      execute: async () => {
        const result = await sceneProcessorStep.execute({
          worldConfig: this.gameState.world,
          sceneState: ctx.sceneState,
          playerAction: ctx.playerAction,
          npcOutputs: ctx.npcOutputs,
          passiveTurnCount: this.gameState.passiveTurnCount,
          playerIsPassive: ctx.playerIsPassive,
          normalizedPlayerAction: ctx.normalizedPlayerAction,
        });
        ctx.sceneProcessorOutcome = result.outcome;
        ctx.sceneProcessorReasoning = result.reasoning ?? '';
      },
    });

    // ── Narrator step ────────────────────────────────────────────────────────
    // Converts the SceneProcessor factual outcome into artistic prose.
    // ctx.sceneProcessorOutcome is set by the step above before this runs.
    const narrateStep = this.narrateStep;
    const worldConfig = this.gameState.world;
    const narrativeHistory = this.gameState.narrativeHistory;
    steps.push({
      displayName: narrateStep.displayName,
      execute: async () => {
        ctx.narrative = await narrateStep.execute({
          worldConfig,
          narrativeHistory,
          sceneState: ctx.sceneState,
          mode: 'event' as const,
          sceneProcessorOutcome: ctx.sceneProcessorOutcome,
          isPassiveTurn: ctx.playerIsPassive,
        });
      },
      async *executeStream() {
        for await (const token of narrateStep.narrateStream({
          worldConfig,
          narrativeHistory,
          sceneState: ctx.sceneState,
          mode: 'event' as const,
          sceneProcessorOutcome: ctx.sceneProcessorOutcome,
          isPassiveTurn: ctx.playerIsPassive,
        })) {
          ctx.narrative += token;
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
          sceneProcessorOutcome: ctx.sceneProcessorOutcome,
          narratorOutcome: ctx.narrative,
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
  private buildObservationPipeline(ctx: TurnContext): BoundStep[] {
    const steps: BoundStep[] = [];

    // ── ObserveStep ──────────────────────────────────────────────────────────
    const observeStep = this.observeStep;
    steps.push({
      displayName: observeStep.displayName,
      execute: async () => {
        ctx.sceneProcessorOutcome = await observeStep.execute({
          worldConfig: this.gameState.world,
          sceneState: ctx.sceneState,
          focusText: ctx.playerAction!.text,
        });
      },
    });

    // ── Narrator step ────────────────────────────────────────────────────────
    // ctx.sceneProcessorOutcome holds the observation result set by ObserveStep.
    const narrateStep = this.narrateStep;
    const worldConfig = this.gameState.world;
    const narrativeHistory = this.gameState.narrativeHistory;
    steps.push({
      displayName: narrateStep.displayName,
      execute: async () => {
        ctx.narrative = await narrateStep.execute({
          worldConfig,
          narrativeHistory,
          sceneState: ctx.sceneState,
          mode: 'observation' as const,
          sceneProcessorOutcome: ctx.sceneProcessorOutcome,
          isPassiveTurn: false,
        });
      },
      async *executeStream() {
        for await (const token of narrateStep.narrateStream({
          worldConfig,
          narrativeHistory,
          sceneState: ctx.sceneState,
          mode: 'observation' as const,
          sceneProcessorOutcome: ctx.sceneProcessorOutcome,
          isPassiveTurn: false,
        })) {
          ctx.narrative += token;
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
          sceneProcessorOutcome: ctx.sceneProcessorOutcome,
          narratorOutcome: ctx.narrative,
        });
      },
    });

    return steps;
  }

  private createTurnContext(playerAction: PlayerAction): TurnContext {
    return {
      sceneState: this.sceneManager.getCurrentState(),
      lastSceneProcessorOutcome:
        this.gameState.sceneProcessorHistory.at(-1) ?? this.opening,
      playerAction: playerAction.type === 'skip' ? null : playerAction,
      npcOutputs: [],
      sceneProcessorOutcome: '',
      sceneProcessorReasoning: '',
      narrative: '',
      playerIsPassive: true, // default; overwritten by PlayerIntentStep before NPCs run
      normalizedPlayerAction: '', // default; overwritten by PlayerIntentStep before NPCs run
    };
  }

  private commitTurn(playerAction: PlayerAction, ctx: TurnContext): void {
    this.gameState.narrativeHistory.push(ctx.narrative);
    if (playerAction.type === 'observe') {
      this.gameState.storyHistory.push({ kind: 'observation', turn: this.gameState.turnCount, text: ctx.sceneProcessorOutcome });
    } else {
      this.gameState.sceneProcessorHistory.push(ctx.sceneProcessorOutcome);
      this.gameState.sceneProcessorReasoningHistory.push(ctx.sceneProcessorReasoning);
      this.gameState.storyHistory.push({ kind: 'event', turn: this.gameState.turnCount, text: ctx.sceneProcessorOutcome, reasoning: ctx.sceneProcessorReasoning || undefined });
    }
    this.gameState.turnCount++;
    if (!ctx.playerIsPassive) {
      this.gameState.passiveTurnCount = 0;
    } else {
      this.gameState.passiveTurnCount++;
    }
  }

  async processTurn(playerAction: PlayerAction): Promise<TurnResult> {
    this.saveCheckpoint(playerAction);

    const ctx = this.createTurnContext(playerAction);
    const pipeline = this.buildPipeline(ctx);

    for (const step of pipeline) {
      await step.execute();
    }

    this.commitTurn(playerAction, ctx);
    return { narrative: ctx.narrative, npcOutputs: ctx.npcOutputs };
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

    const ctx = this.createTurnContext(playerAction);
    const pipeline = this.buildPipeline(ctx);

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

    this.commitTurn(playerAction, ctx);

    const doneEvent: TurnDoneEvent = {
      type: 'done',
      narrative: ctx.narrative,
      npcOutputs: ctx.npcOutputs,
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

  /** Opening narrative shown to the player as the first message. */
  getOpening(): string {
    return this.opening;
  }

  getDebugData(): NpcDebugData[] {
    return this.debugHelper.getAll();
  }

  /**
   * Export all mutable session state for persistence.
   * The Orchestrator provides data only — serialization is handled externally.
   */
  exportSaveData(): OrchestratorSaveData {
    return {
      gameState: {
        narrativeHistory: [...this.gameState.narrativeHistory],
        sceneProcessorHistory: [...this.gameState.sceneProcessorHistory],
        sceneProcessorReasoningHistory: [...this.gameState.sceneProcessorReasoningHistory],
        storyHistory: [...this.gameState.storyHistory],
        world: this.gameState.world,
        turnCount: this.gameState.turnCount,
        passiveTurnCount: this.gameState.passiveTurnCount,
      },
      sceneState: this.sceneManager.getCurrentState(),
      npcStates: Object.fromEntries(this.npcStateManager.snapshot()),
      lastPlayerAction: this.lastPlayerAction,
    };
  }

  /**
   * Restore mutable session state from previously exported data.
   * The world (WorldRuntime) is not replaced — the loaded story must match
   * the currently running one.
   */
  importSaveData(data: OrchestratorSaveData): void {
    this.gameState.narrativeHistory = [...data.gameState.narrativeHistory];
    this.gameState.sceneProcessorHistory = [...data.gameState.sceneProcessorHistory];
    this.gameState.sceneProcessorReasoningHistory = [...data.gameState.sceneProcessorReasoningHistory];
    this.gameState.storyHistory = [...data.gameState.storyHistory];
    this.gameState.turnCount = data.gameState.turnCount;
    this.sceneManager.restoreState(data.sceneState);
    this.npcStateManager.restore(new Map(Object.entries(data.npcStates)));
    this.lastPlayerAction = data.lastPlayerAction;
    // A loaded save replaces the checkpoint; clear it so retry is unavailable.
    this.checkpoint = null;
    this.debugHelper.rollbackToTurn(data.gameState.turnCount);
  }
}
