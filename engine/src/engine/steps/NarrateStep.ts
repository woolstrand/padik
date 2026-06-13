import { PipelineStep, WorldConfig } from '../../types';
import { Narrator } from '../Narrator';

export interface NarrateStepInput {
  worldConfig: WorldConfig;
  narrativeHistory: string[];
  sceneState: string;
  sceneProcessorOutcome: string;
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
    );
  }

  narrateStream(input: NarrateStepInput): AsyncIterable<string> {
    return this.narrator.narrateStream(
      input.worldConfig,
      input.narrativeHistory,
      input.sceneState,
      input.sceneProcessorOutcome,
    );
  }
}
