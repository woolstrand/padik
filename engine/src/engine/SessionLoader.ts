import {
  EngineInitialState,
  ILlmClient,
  NpcConfig,
  NpcInnerState,
  WorldConfig,
  WorldRuntime,
} from '../types';
import {
  NpcAppearance,
  initialSceneStateSystemPrompt,
  initialSceneStateUserPrompt,
} from '../loaderPrompts';

/**
 * SessionLoader — the intermediate component between story configuration and
 * the live engine.
 *
 * It reads the raw story config (`WorldConfig` + `NpcConfig[]` parsed from the
 * userdata JSON files) and produces the `EngineInitialState` that the engine
 * runs on. After this point, no engine component references the raw config:
 * world facts are baked into `WorldRuntime`, character identity/personality
 * into immutable `NpcPersona`, the character's mental seed into the mutable
 * `NpcMind`, and physical appearance into the initial factual scene state.
 *
 * The loader is the only place (besides the composition root) that touches the
 * config shapes, and the only load-time consumer of the LLM — used here to
 * synthesise the starting scene state from the world setting, the player, and
 * the NPC appearances.
 */
export class SessionLoader {
  constructor(private readonly llmClient: ILlmClient) {}

  async load(worldConfig: WorldConfig, npcConfigs: NpcConfig[]): Promise<EngineInitialState> {
    const world: WorldRuntime = {
      setting: worldConfig.setting,
      style: worldConfig.style,
      playerDescription: worldConfig.playerDescription,
    };

    const npcInnerStates: NpcInnerState[] = npcConfigs.map((npc) => ({
      persona: {
        id: npc.id,
        name: npc.name,
        character: npc.character,
        traits: [...npc.traits],
      },
      mind: {
        thoughts: npc.initialMindset,
        mood: '',
        goals: [...npc.goals],
        agenda: [],
        lastActions: [],
      },
    }));

    const appearances: NpcAppearance[] = npcConfigs.map((npc) => ({
      name: npc.name,
      appearance: npc.appearance,
    }));

    const initialSceneState = await this.buildInitialSceneState(
      world,
      worldConfig.playerDescription,
      appearances,
    );

    return {
      world,
      npcInnerStates,
      initialSceneState,
      opening: worldConfig.opening,
    };
  }

  private async buildInitialSceneState(
    world: WorldRuntime,
    playerDescription: string,
    npcs: NpcAppearance[],
  ): Promise<string> {
    const messages = [
      { role: 'system' as const, content: initialSceneStateSystemPrompt() },
      { role: 'user' as const, content: initialSceneStateUserPrompt(world, playerDescription, npcs) },
    ];
    return (await this.llmClient.complete(messages)).trim();
  }
}
