import { PipelineStep, PlayerAction, WorldRuntime } from '../../types';
import { PlayerActionInterpreter, PlayerActionClassification } from '../PlayerActionInterpreter';

export interface PlayerIntentStepInput {
  playerAction: PlayerAction | null;
  world: WorldRuntime;
}

/**
 * PlayerIntentStep — classifies the player's action and normalises it to
 * English past-tense third-person in a single LLM call.
 *
 * Runs as the first step in each turn pipeline.  Its output is written into
 * TurnContext and consumed by NPC and SceneProcessor steps.
 */
export class PlayerIntentStep implements PipelineStep<PlayerIntentStepInput, PlayerActionClassification> {
  readonly displayName = 'Reading player action';

  constructor(private readonly interpreter: PlayerActionInterpreter) {}

  execute(input: PlayerIntentStepInput): Promise<PlayerActionClassification> {
    return this.interpreter.classify(input.playerAction, input.world);
  }
}
