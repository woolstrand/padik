import { useEffect, useRef } from 'react';
import './NarratorOutput.css';

interface NarratorOutputProps {
  entries: string[];
  /** Text currently being streamed (partial narrator response). */
  streamingEntry?: string;
  /** Progress label shown while NPC is thinking (e.g. "Vasya думает…"). */
  progressMessage?: string;
}

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
      {entries.map((text, i) => (
        <p key={i} className="narrator-entry">
          {text}
        </p>
      ))}

      {/* NPC thinking indicator */}
      {progressMessage && !streamingEntry && (
        <p className="narrator-entry narrator-progress" aria-label={progressMessage}>
          {progressMessage}
        </p>
      )}

      {/* Streaming narrator text with blinking cursor */}
      {streamingEntry !== undefined && (
        <p className="narrator-entry narrator-streaming" aria-label="Narrator is writing">
          {streamingEntry}
          <span className="narrator-cursor" aria-hidden="true">▌</span>
        </p>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
