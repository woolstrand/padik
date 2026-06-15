import { NpcOutput, PipelineStep, PlayerAction, WorldRuntime } from '../../types';
import { SceneProcessor, SceneProcessorResult } from '../SceneProcessor';

export interface SceneProcessorStepInput {
  worldConfig: WorldRuntime;
  sceneState: string;
  playerAction: PlayerAction | null;
  npcOutputs: NpcOutput[];
}

/**
 * SceneProcessorStep — pipeline step that resolves what actually happened.
 *
 * Runs after all NPC steps and before the Narrator step.  Delegates to
 * SceneProcessor and is unaware of other steps.
 */
export class SceneProcessorStep implements PipelineStep<SceneProcessorStepInput, SceneProcessorResult> {
  readonly displayName = 'Processing scene';

  constructor(private readonly sceneProcessor: SceneProcessor) {}

  execute(input: SceneProcessorStepInput): Promise<SceneProcessorResult> {
    return this.sceneProcessor.process(
      input.worldConfig,
      input.sceneState,
      input.playerAction,
      input.npcOutputs,
    );
  }
}
