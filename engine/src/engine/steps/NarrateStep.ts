import { NpcOutput, PipelineStep, PlayerAction, WorldConfig } from '../../types';
import { Narrator } from '../Narrator';

export interface NarrateStepInput {
  worldConfig: WorldConfig;
  narrativeHistory: string[];
  playerAction: PlayerAction | null;
  npcOutputs: NpcOutput[];
  sceneState: string;
}

/**
 * NarrateStep — pipeline step that produces the story update paragraph.
 *
 * Delegates to Narrator. Also exposes narrateStream() for the streaming
 * pipeline variant so the Orchestrator can yield tokens as they arrive.
 */
export class NarrateStep implements PipelineStep<NarrateStepInput, string> {
  readonly displayName = 'Narrator is working...';

  constructor(private readonly narrator: Narrator) {}

  execute(input: NarrateStepInput): Promise<string> {
    return this.narrator.narrate(
      input.worldConfig,
      input.narrativeHistory,
      input.playerAction,
      input.npcOutputs,
      input.sceneState,
    );
  }

  narrateStream(input: NarrateStepInput): AsyncIterable<string> {
    return this.narrator.narrateStream(
      input.worldConfig,
      input.narrativeHistory,
      input.playerAction,
      input.npcOutputs,
      input.sceneState,
    );
  }
}
