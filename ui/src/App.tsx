import { useState, useEffect } from 'react';
import { NarratorOutput } from './components/NarratorOutput';
import { PlayerInput } from './components/PlayerInput';
import { fetchInitialState, sendAction } from './api';
import './App.css';

export function App() {
  const [narratives, setNarratives] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    try {
      const result = await sendAction({ type, text });
      setNarratives((prev) => [...prev, result.narrative]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Ошибка: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="app-layout">
      <header className="app-header">
        <span className="app-title">ПАДИК</span>
        <span className="app-subtitle">текстовая ролевая игра</span>
      </header>

      <main className="app-main">
        <NarratorOutput entries={narratives} isLoading={isLoading} />
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
  );
}
