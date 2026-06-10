import { useState } from 'react';
import { NpcDebugData } from '../types';
import './DebugPanel.css';

interface DebugPanelProps {
  data: NpcDebugData[];
  isOpen: boolean;
  onToggle: () => void;
}

/**
 * Collapsible debug panel showing per-NPC processing steps.
 *
 * For each NPC the panel shows a scrollable list of turns; each turn entry
 * contains the input situation description, internal thoughts and output
 * actions.
 */
export function DebugPanel({ data, isOpen, onToggle }: DebugPanelProps) {
  const [selectedNpcId, setSelectedNpcId] = useState<string | null>(null);

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
        </aside>
      )}
    </>
  );
}
