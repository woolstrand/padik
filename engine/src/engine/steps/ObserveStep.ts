import { PipelineStep, WorldRuntime } from '../../types';
import { ObservationProcessor } from '../ObservationProcessor';

export interface ObserveStepInput {
  worldConfig: WorldRuntime;
  sceneState: string;
  /** The player's description of where their attention is directed. */
  focusText: string;
}

/**
 * ObserveStep — pipeline step for the observation action.
 *
 * Replaces the entire NpcStep + SceneProcessorStep block when the player
 * action type is 'observe'.  Delegates to ObservationProcessor to produce
 * a detailed factual description of the player's focus area.
 */
export class ObserveStep implements PipelineStep<ObserveStepInput, string> {
  readonly displayName = 'Observing';

  constructor(private readonly processor: ObservationProcessor) {}

  execute(input: ObserveStepInput): Promise<string> {
    return this.processor.process(input.worldConfig, input.sceneState, input.focusText);
  }
}
