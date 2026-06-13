import { useState, useEffect, useRef } from 'react';
import { NarratorOutput } from './components/NarratorOutput';
import { PlayerInput } from './components/PlayerInput';
import { DebugPanel } from './components/DebugPanel';
import { fetchInitialState, fetchStories, sendActionStream, fetchDebugData, startSession, retryActionStream, cancelTurn } from './api';
import { NpcDebugData, StoryInfo, ChatEntry } from './types';
import './App.css';

export function App() {
  const [chatEntries, setChatEntries] = useState<ChatEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugData, setDebugData] = useState<NpcDebugData[]>([]);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [stories, setStories] = useState<StoryInfo[]>([]);
  const [selectedStoryId, setSelectedStoryId] = useState<string>('');
  const [pendingStoryId, setPendingStoryId] = useState<string>('');
  /** Label shown while an NPC is being processed ("Vasya думает…"). */
  const [progressMessage, setProgressMessage] = useState<string | undefined>(undefined);
  /** Partially received narrator text during streaming. */
  const [streamingEntry, setStreamingEntry] = useState<string | undefined>(undefined);
  /** Whether there is a retryable last turn. */
  const [hasLastTurn, setHasLastTurn] = useState(false);
  /** Current factual scene state from SceneManager. */
  const [sceneState, setSceneState] = useState<string>('');
  /** History of SceneProcessor factual outcomes. */
  const [sceneProcessorHistory, setSceneProcessorHistory] = useState<string[]>([]);
  /** History of SceneProcessor reasoning (parallel to sceneProcessorHistory). */
  const [sceneProcessorReasoningHistory, setSceneProcessorReasoningHistory] = useState<string[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Load initial game state on mount
  useEffect(() => {
    Promise.all([fetchStories(), fetchInitialState()])
      .then(([storyList, state]) => {
        setStories(storyList.stories);
        const activeStoryId = state.storyId || storyList.selectedStoryId;
        setSelectedStoryId(activeStoryId);
        setPendingStoryId(activeStoryId);
        const entries: ChatEntry[] =
          state.narrativeHistory.length > 0
            ? state.narrativeHistory.map((text) => ({ type: 'narrative' as const, text }))
            : [{ type: 'narrative' as const, text: state.worldConfig.initialScene }];
        setChatEntries(entries);
        setSceneState(state.sceneState ?? '');
        setSceneProcessorHistory(state.sceneProcessorHistory ?? []);
        setSceneProcessorReasoningHistory(state.sceneProcessorReasoningHistory ?? []);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Не удалось подключиться к игровому движку: ${msg}`);
      })
      .finally(() => setIsLoading(false));
  }, []);

  async function handleStartSession() {
    if (!pendingStoryId) return;

    setIsLoading(true);
    setError(null);
    setProgressMessage(undefined);
    setStreamingEntry(undefined);

    try {
      const state = await startSession(pendingStoryId);
      setSelectedStoryId(state.storyId);
      setPendingStoryId(state.storyId);
      setChatEntries([{ type: 'narrative', text: state.worldConfig.initialScene }]);
      setDebugData([]);
      setHasLastTurn(false);
      setSceneState(state.sceneState ?? '');
      setSceneProcessorHistory(state.sceneProcessorHistory ?? []);
      setSceneProcessorReasoningHistory(state.sceneProcessorReasoningHistory ?? []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Не удалось запустить новую сессию: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  }

  async function processAction(type: 'act' | 'say' | 'skip', text: string) {
    // Record player input in chat history immediately
    const playerEntryType = `player-${type}` as ChatEntry['type'];
    setChatEntries((prev) => [...prev, { type: playerEntryType, text }]);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setIsLoading(true);
    setError(null);
    setProgressMessage(undefined);
    setStreamingEntry(undefined);

    try {
      for await (const event of sendActionStream({ type, text }, abortController.signal)) {
        if (event.type === 'step:start') {
          setProgressMessage(`${event.displayName}…`);
        } else if (event.type === 'step:done') {
          setProgressMessage(undefined);
        } else if (event.type === 'narrator:token') {
          setStreamingEntry((prev) => (prev ?? '') + event.token);
        } else if (event.type === 'done') {
          setChatEntries((prev) => [...prev, { type: 'narrative', text: event.narrative }]);
          setHasLastTurn(true);
          setSceneState(event.sceneState);
          setSceneProcessorHistory(event.sceneProcessorHistory ?? []);
          setSceneProcessorReasoningHistory(event.sceneProcessorReasoningHistory ?? []);
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
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Cancelled by user — remove the player entry we just added, restore server state
        setChatEntries((prev) => prev.slice(0, -1));
        try { await cancelTurn(); } catch { /* ignore */ }
        setStreamingEntry(undefined);
        setProgressMessage(undefined);
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Ошибка: ${msg}`);
      setStreamingEntry(undefined);
      setProgressMessage(undefined);
    } finally {
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }

  async function handleRetry() {
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setIsLoading(true);
    setError(null);
    setProgressMessage(undefined);
    setStreamingEntry(undefined);
    // Remove the last narrative entry (keep the player entry)
    setChatEntries((prev) => {
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].type === 'narrative') {
          return [...prev.slice(0, i), ...prev.slice(i + 1)];
        }
      }
      return prev;
    });

    try {
      for await (const event of retryActionStream(abortController.signal)) {
        if (event.type === 'step:start') {
          setProgressMessage(`${event.displayName}…`);
        } else if (event.type === 'step:done') {
          setProgressMessage(undefined);
        } else if (event.type === 'narrator:token') {
          setStreamingEntry((prev) => (prev ?? '') + event.token);
        } else if (event.type === 'done') {
          setChatEntries((prev) => [...prev, { type: 'narrative', text: event.narrative }]);
          setSceneState(event.sceneState);
          setSceneProcessorHistory(event.sceneProcessorHistory ?? []);
          setSceneProcessorReasoningHistory(event.sceneProcessorReasoningHistory ?? []);
          setStreamingEntry(undefined);
          setProgressMessage(undefined);
          const debug = await fetchDebugData();
          setDebugData(debug);
        } else if (event.type === 'error') {
          throw new Error(event.message);
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        try { await cancelTurn(); } catch { /* ignore */ }
        setStreamingEntry(undefined);
        setProgressMessage(undefined);
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Ошибка: ${msg}`);
      setStreamingEntry(undefined);
      setProgressMessage(undefined);
    } finally {
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }

  function handleCancel() {
    abortControllerRef.current?.abort();
  }

  return (
    <div className={`app-root${isDebugOpen ? ' app-root--debug-open' : ''}`}>
      <div className="app-layout">
        <header className="app-header">
          <div className="app-header-left">
            <span className="app-title">ПАДИК</span>
            <span className="app-subtitle">текстовая ролевая игра</span>
          </div>
          <div className="app-story-controls">
            <select
              className="app-story-select"
              value={pendingStoryId}
              onChange={(e) => setPendingStoryId(e.target.value)}
              disabled={isLoading || stories.length === 0}
              aria-label="Выбор истории"
            >
              {stories.map((story) => (
                <option key={story.id} value={story.id}>
                  {story.id}
                </option>
              ))}
            </select>
            <button
              className="app-story-confirm"
              onClick={() => void handleStartSession()}
              disabled={isLoading || !pendingStoryId}
              title={`Текущая история: ${selectedStoryId || 'не выбрана'}`}
            >
              Начать сессию
            </button>
          </div>
        </header>

        <main className="app-main">
          <NarratorOutput
            entries={chatEntries}
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
            onRetry={() => void handleRetry()}
            onCancel={handleCancel}
            canRetry={hasLastTurn && !isLoading}
            disabled={isLoading}
          />
        </footer>
      </div>

      <DebugPanel
        data={debugData}
        sceneState={sceneState}
        sceneProcessorHistory={sceneProcessorHistory}
        sceneProcessorReasoningHistory={sceneProcessorReasoningHistory}
        isOpen={isDebugOpen}
        onToggle={() => setIsDebugOpen((v) => !v)}
      />
    </div>
  );
}
