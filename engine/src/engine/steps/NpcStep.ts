import { NpcConfig, NpcOutput, NpcState, PipelineStep, PlayerAction, WorldConfig } from '../../types';
import { NpcProcessor } from '../NpcProcessor';

export interface NpcStepInput {
  npcConfig: NpcConfig;
  npcState: NpcState;
  worldConfig: WorldConfig;
  recentNarrative: string;
  playerAction: PlayerAction | null;
  otherNpcActions: string[];
  sceneState: string;
}

/**
 * NpcStep — pipeline step that processes a single NPC for one turn.
 *
 * Each instance is bound to one NPC (its name becomes the displayName).
 * The step delegates to NpcProcessor and is unaware of other steps.
 */
export class NpcStep implements PipelineStep<NpcStepInput, NpcOutput> {
  constructor(
    private readonly processor: NpcProcessor,
    readonly displayName: string,
  ) {}

  execute(input: NpcStepInput): Promise<NpcOutput> {
    return this.processor.process(
      input.npcConfig,
      input.npcState,
      input.worldConfig,
      input.recentNarrative,
      input.playerAction,
      input.otherNpcActions,
      input.sceneState,
    );
  }
}
