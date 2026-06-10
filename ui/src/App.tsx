import { useState, useEffect } from 'react';
import { NarratorOutput } from './components/NarratorOutput';
import { PlayerInput } from './components/PlayerInput';
import { DebugPanel } from './components/DebugPanel';
import { fetchInitialState, sendActionStream, fetchDebugData } from './api';
import { NpcDebugData } from './types';
import './App.css';

export function App() {
  const [narratives, setNarratives] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugData, setDebugData] = useState<NpcDebugData[]>([]);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  /** Label shown while an NPC is being processed ("Vasya думает…"). */
  const [progressMessage, setProgressMessage] = useState<string | undefined>(undefined);
  /** Partially received narrator text during streaming. */
  const [streamingEntry, setStreamingEntry] = useState<string | undefined>(undefined);

  // Load initial game state on mount
  useEffect(() => {
    fetchInitialState()
      .then((state) => {
        const entries =
          state.narrativeHistory.length > 0
            ? state.narrativeHistory
            : [state.worldConfig.initialScene];
        setNarratives(entries);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Не удалось подключиться к игровому движку: ${msg}`);
      })
      .finally(() => setIsLoading(false));
  }, []);

  async function processAction(type: 'act' | 'say' | 'skip', text: string) {
    setIsLoading(true);
    setError(null);
    setProgressMessage(undefined);
    setStreamingEntry(undefined);

    try {
      for await (const event of sendActionStream({ type, text })) {
        if (event.type === 'npc:start') {
          setProgressMessage(`${event.npcName} думает…`);
        } else if (event.type === 'npc:done') {
          setProgressMessage(undefined);
        } else if (event.type === 'narrator:token') {
          setStreamingEntry((prev) => (prev ?? '') + event.token);
        } else if (event.type === 'done') {
          setNarratives((prev) => [...prev, event.narrative]);
          setStreamingEntry(undefined);
          setProgressMessage(undefined);
          // Refresh debug data after each turn
          const debug = await fetchDebugData();
          setDebugData(debug);
        } else if (event.type === 'error') {
          throw new Error(event.message);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Ошибка: ${msg}`);
      setStreamingEntry(undefined);
      setProgressMessage(undefined);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className={`app-root${isDebugOpen ? ' app-root--debug-open' : ''}`}>
      <div className="app-layout">
        <header className="app-header">
          <span className="app-title">ПАДИК</span>
          <span className="app-subtitle">текстовая ролевая игра</span>
        </header>

        <main className="app-main">
          <NarratorOutput
            entries={narratives}
            streamingEntry={streamingEntry}
            progressMessage={progressMessage}
          />
        </main>

        {error && (
          <div className="app-error" role="alert">
            {error}
          </div>
        )}

        <footer className="app-footer">
          <PlayerInput
            onAct={(text) => processAction('act', text)}
            onSay={(text) => processAction('say', text)}
            onSkip={() => processAction('skip', '')}
            disabled={isLoading}
          />
        </footer>
      </div>

      <DebugPanel
        data={debugData}
        isOpen={isDebugOpen}
        onToggle={() => setIsDebugOpen((v) => !v)}
      />
    </div>
  );
}

