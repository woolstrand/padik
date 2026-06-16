import { PipelineStep, WorldRuntime } from '../../types';
import { NarratorMode } from '../../prompts';
import { Narrator } from '../Narrator';

export interface NarrateStepInput {
  worldConfig: WorldRuntime;
  narrativeHistory: string[];
  sceneState: string;
  sceneProcessorOutcome: string;
  mode: NarratorMode;
  /** True when the player did not take a physical action this turn (skip, say, observe, or null). */
  isPassiveTurn: boolean;
}

/**
 * NarrateStep — pipeline step that produces the artistic story prose.
 *
 * Delegates to Narrator. Also exposes narrateStream() for the streaming
 * pipeline variant so the Orchestrator can yield tokens as they arrive.
 */
export class NarrateStep implements PipelineStep<NarrateStepInput, string> {
  readonly displayName = 'Narrator is working';

  constructor(private readonly narrator: Narrator) {}

  execute(input: NarrateStepInput): Promise<string> {
    return this.narrator.narrate(
      input.worldConfig,
      input.narrativeHistory,
      input.sceneState,
      input.sceneProcessorOutcome,
      input.mode,
      input.isPassiveTurn,
    );
  }

  narrateStream(input: NarrateStepInput): AsyncIterable<string> {
    return this.narrator.narrateStream(
      input.worldConfig,
      input.narrativeHistory,
      input.sceneState,
      input.sceneProcessorOutcome,
      input.mode,
      input.isPassiveTurn,
    );
  }
}
