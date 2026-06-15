import { useEffect, useRef } from 'react';
import { ChatEntry } from '../types';
import './NarratorOutput.css';

interface NarratorOutputProps {
  entries: ChatEntry[];
  /** Text currently being streamed (partial narrator response). */
  streamingEntry?: string;
  /** Progress label shown while a step is running (e.g. "Vasya думает…"). */
  progressMessage?: string;
}

const PLAYER_LABELS: Record<string, string> = {
  'player-act': 'Действие',
  'player-say': 'Речь',
  'player-skip': 'Пропуск',
  'player-observe': 'Наблюдение',
};

/**
 * Scrollable narrative log.  Automatically scrolls to the bottom when a new
 * entry is appended, while a streaming entry is updating, or while the
 * progress indicator is visible.
 */
export function NarratorOutput({ entries, streamingEntry, progressMessage }: NarratorOutputProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries, streamingEntry, progressMessage]);

  return (
    <div className="narrator-output" role="log" aria-live="polite" aria-label="Narrative log">
      {entries.map((entry, i) => {
        if (entry.type === 'narrative') {
          return (
            <p key={i} className="narrator-entry">
              {entry.text}
            </p>
          );
        }
        return (
          <p key={i} className="narrator-entry narrator-player-entry">
            <span className="narrator-player-label">[{PLAYER_LABELS[entry.type]}]</span>{' '}
            {entry.text}
          </p>
        );
      })}

      {/* Streaming narrator text with blinking cursor */}
      {streamingEntry !== undefined && (
        <p className="narrator-entry narrator-streaming" aria-label="Narrator is writing">
          {streamingEntry}
          {!progressMessage && <span className="narrator-cursor" aria-hidden="true">▌</span>}
        </p>
      )}

      {/* Step progress indicator */}
      {progressMessage && (
        <p className="narrator-entry narrator-progress" aria-label={progressMessage}>
          {progressMessage}
        </p>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
