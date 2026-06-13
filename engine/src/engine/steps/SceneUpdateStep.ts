import { PipelineStep } from '../../types';
import { SceneManager } from '../SceneManager';

export interface SceneUpdateStepInput {
  narrative: string;
}

/**
 * SceneUpdateStep — pipeline step that merges new narrative events into the
 * factual scene state after each turn.
 *
 * Delegates to SceneManager and is unaware of other steps.
 */
export class SceneUpdateStep implements PipelineStep<SceneUpdateStepInput, void> {
  readonly displayName = 'Updating scene...';

  constructor(private readonly sceneManager: SceneManager) {}

  execute(input: SceneUpdateStepInput): Promise<void> {
    return this.sceneManager.update(input.narrative);
  }
}
