import { ILlmClient, NpcInnerState, NpcOutput, NpcPersona, PlayerAction, WorldRuntime } from '../types';
import { npcSystemPrompt, npcUserPrompt, NPC_DEFAULT_ACTION, NPC_CONFUSED_ACTION } from '../prompts';
import {
  NPC_ACTIONS_SEPARATOR,
  NPC_AGENDA_SEPARATOR,
  NPC_GOALS_SEPARATOR,
  NPC_MOOD_SEPARATOR,
  NPC_SPEECH_SEPARATOR,
} from '../constants';

/**
 * NPC Processor — handles a single NPC turn.
 *
 * Each call builds a fresh prompt from scratch (no running conversation) to
 * keep token usage low.  The prompt includes:
 *   – the NPC's immutable persona (character, traits, goals)
 *   – world style
 *   – recent narrative context
 *   – player action (if any)
 *   – actions already taken by other NPCs this turn
 *   – the NPC's previous internal thoughts (mutable mind)
 *
 * The LLM is asked to return a JSON object with two fields:
 *   thoughts  – internal monologue / reasoning chain (stored internally)
 *   actions   – list of concrete actions (forwarded to Narrator)
 */
export class NpcProcessor {
  constructor(private readonly llmClient: ILlmClient) {}

  async process(
    inner: NpcInnerState,
    world: WorldRuntime,
    recentNarrative: string,
    playerAction: PlayerAction | null,
    otherNpcActions: string[],
    sceneState: string,
    passiveTurnCount: number,
    playerIsPassive: boolean,
    normalizedPlayerAction: string,
  ): Promise<NpcOutput> {
    const messages = [
      { role: 'system' as const, content: npcSystemPrompt() },
      {
        role: 'user' as const,
        content: npcUserPrompt(
          inner,
          world,
          recentNarrative,
          playerAction,
          otherNpcActions,
          sceneState,
          passiveTurnCount,
          playerIsPassive,
          normalizedPlayerAction,
        ),
      },
    ];

    const raw = await this.llmClient.complete(messages);
    return this.parseResponse(raw, inner.persona);
  }

  private parseResponse(raw: string, persona: NpcPersona): NpcOutput {
    const actionsSepIdx = raw.indexOf(NPC_ACTIONS_SEPARATOR);
    if (actionsSepIdx === -1) {
      // Completely malformed — treat the entire response as thoughts, signal confusion.
      return {
        npcId: persona.id,
        npcName: persona.name,
        thoughts: raw,
        actions: [NPC_CONFUSED_ACTION],
        speech: [],
        updatedMood: '',
        updatedAgenda: [],
        updatedGoals: undefined,
      };
    }

    const thoughts = raw.slice(0, actionsSepIdx).trim();
    const afterActions = raw.slice(actionsSepIdx + NPC_ACTIONS_SEPARATOR.length);

    // Split the remainder into named sections.
    const speechSepIdx   = afterActions.indexOf(NPC_SPEECH_SEPARATOR);
    const moodSepIdx     = afterActions.indexOf(NPC_MOOD_SEPARATOR);
    const agendaSepIdx   = afterActions.indexOf(NPC_AGENDA_SEPARATOR);
    const goalsSepIdx    = afterActions.indexOf(NPC_GOALS_SEPARATOR);

    const actions = this.extractLines(
      afterActions,
      0,
      speechSepIdx !== -1 ? speechSepIdx : moodSepIdx !== -1 ? moodSepIdx : agendaSepIdx !== -1 ? agendaSepIdx : goalsSepIdx !== -1 ? goalsSepIdx : afterActions.length,
    );

    const speech = speechSepIdx !== -1
      ? this.extractLines(
          afterActions,
          speechSepIdx + NPC_SPEECH_SEPARATOR.length,
          moodSepIdx !== -1 ? moodSepIdx : agendaSepIdx !== -1 ? agendaSepIdx : goalsSepIdx !== -1 ? goalsSepIdx : afterActions.length,
        )
      : [];

    const updatedMood = moodSepIdx !== -1
      ? afterActions
          .slice(
            moodSepIdx + NPC_MOOD_SEPARATOR.length,
            agendaSepIdx !== -1 ? agendaSepIdx : goalsSepIdx !== -1 ? goalsSepIdx : afterActions.length,
          )
          .trim()
      : '';

    const updatedAgenda = agendaSepIdx !== -1
      ? this.extractLines(
          afterActions,
          agendaSepIdx + NPC_AGENDA_SEPARATOR.length,
          goalsSepIdx !== -1 ? goalsSepIdx : afterActions.length,
        )
      : [];

    const updatedGoals: string[] | undefined = goalsSepIdx !== -1
      ? this.extractLines(afterActions, goalsSepIdx + NPC_GOALS_SEPARATOR.length, afterActions.length)
      : undefined;

    return {
      npcId: persona.id,
      npcName: persona.name,
      thoughts,
      actions: actions.length > 0 ? actions : [],
      speech,
      updatedMood,
      updatedAgenda,
      updatedGoals,
    };
  }

  /** Extract non-empty trimmed lines from a substring, stripping leading list markers. */
  private extractLines(text: string, start: number, end: number): string[] {
    return text
      .slice(start, end)
      .split('\n')
      .map((line) => line.replace(/^[-*•]\s*/, '').trim())
      .filter((line) => line.length > 0);
  }
}
