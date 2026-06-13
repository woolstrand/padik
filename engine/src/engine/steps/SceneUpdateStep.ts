import { PipelineStep } from '../../types';
import { SceneManager } from '../SceneManager';

export interface SceneUpdateStepInput {
  sceneProcessorOutcome: string;
  narratorOutcome: string;
}

/**
 * SceneUpdateStep — pipeline step that merges new events into the factual
 * scene state after each turn.
 *
 * Takes both the SceneProcessor outcome (primary source of truth) and the
 * Narrator outcome (additional context) and delegates to SceneManager.
 */
export class SceneUpdateStep implements PipelineStep<SceneUpdateStepInput, void> {
  readonly displayName = 'Updating scene memory';

  constructor(private readonly sceneManager: SceneManager) {}

  execute(input: SceneUpdateStepInput): Promise<void> {
    return this.sceneManager.update(input.sceneProcessorOutcome, input.narratorOutcome);
  }
}
