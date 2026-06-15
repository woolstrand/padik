import { useState } from 'react';
import { NpcDebugData, StoryHistoryEntry } from '../types';
import './DebugPanel.css';

interface DebugPanelProps {
  data: NpcDebugData[];
  sceneState: string;
  storyHistory: StoryHistoryEntry[];
  isOpen: boolean;
  onToggle: () => void;
}

/**
 * Collapsible debug panel showing per-NPC processing steps.
 *
 * For each NPC the panel shows a scrollable list of turns; each turn entry
 * contains the input situation description, internal thoughts and output
 * actions.
 *
 * The world state section has two tabs:
 *   - "Состояние" — current SceneManager state
 *   - "История" — chronological SceneProcessor factual outcomes
 */
export function DebugPanel({ data, sceneState, storyHistory, isOpen, onToggle }: DebugPanelProps) {
  const [selectedNpcId, setSelectedNpcId] = useState<string | null>(null);
  const [sceneTab, setSceneTab] = useState<'state' | 'history'>('state');

  const selectedNpc = data.find((d) => d.npcId === selectedNpcId) ?? data[0] ?? null;

  return (
    <>
      <button
        className={`debug-toggle${isOpen ? ' debug-toggle--open' : ''}`}
        onClick={onToggle}
        title={isOpen ? 'Скрыть отладку' : 'Показать отладку'}
        aria-expanded={isOpen}
      >
        {isOpen ? '▶ DEBUG' : '◀ DEBUG'}
      </button>

      {isOpen && (
        <aside className="debug-panel" aria-label="NPC debug panel">
          <div className="debug-panel__header">ОТЛАДКА НПС</div>

          {data.length === 0 ? (
            <p className="debug-panel__empty">Ходов пока нет.</p>
          ) : (
            <div className="debug-panel__body">
              <ul className="debug-npc-list" role="listbox" aria-label="NPC list">
                {data.map((npc) => (
                  <li
                    key={npc.npcId}
                    className={`debug-npc-item${selectedNpc?.npcId === npc.npcId ? ' debug-npc-item--selected' : ''}`}
                    role="option"
                    aria-selected={selectedNpc?.npcId === npc.npcId}
                    onClick={() => setSelectedNpcId(npc.npcId)}
                  >
                    {npc.npcName}
                    <span className="debug-npc-count">{npc.steps.length}</span>
                  </li>
                ))}
              </ul>

              {selectedNpc && (
                <div className="debug-steps" aria-label={`Steps for ${selectedNpc.npcName}`}>
                  {[...selectedNpc.steps].reverse().map((step, i) => (
                    <div key={i} className="debug-step">
                      <div className="debug-step__turn">Ход {step.turn + 1}</div>

                      <div className="debug-step__section-label">Ситуация</div>
                      <pre className="debug-step__text">{step.situation}</pre>

                      <div className="debug-step__section-label">Мысли</div>
                      <pre className="debug-step__text">{step.thoughts}</pre>

                      <div className="debug-step__section-label">Действия</div>
                      <ul className="debug-step__actions">
                        {step.actions.map((a, j) => (
                          <li key={j}>{a}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="debug-scene">
            <div className="debug-scene__tabs">
              <button
                className={`debug-scene__tab${sceneTab === 'state' ? ' debug-scene__tab--active' : ''}`}
                onClick={() => setSceneTab('state')}
              >
                СОСТОЯНИЕ
              </button>
              <button
                className={`debug-scene__tab${sceneTab === 'history' ? ' debug-scene__tab--active' : ''}`}
                onClick={() => setSceneTab('history')}
              >
                ИСТОРИЯ
              </button>
            </div>

            {sceneTab === 'state' ? (
              <textarea
                className="debug-scene__text"
                readOnly
                value={sceneState || 'Сцена ещё не инициализирована…'}
                aria-label="Current scene state"
              />
            ) : (
              <div className="debug-scene__history">
                {storyHistory.length === 0 ? (
                  <p className="debug-scene__history-empty">Ходов пока нет.</p>
                ) : (
                  [...storyHistory].reverse().map((entry, i) => (
                    <div key={i} className="debug-scene__history-entry">
                      <div className="debug-scene__history-turn">
                        Ход {entry.turn + 1}
                        {entry.kind === 'observation' && (
                          <span className="debug-scene__history-tag debug-scene__history-tag--observation">наблюдение</span>
                        )}
                      </div>
                      {entry.kind === 'event' && entry.reasoning && (
                        <>
                          <div className="debug-step__section-label">Рассуждение</div>
                          <pre className="debug-step__text debug-step__text--muted">{entry.reasoning}</pre>
                          <div className="debug-step__section-label">Итог</div>
                        </>
                      )}
                      <pre className="debug-step__text">{entry.text}</pre>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </aside>
      )}
    </>
  );
}

