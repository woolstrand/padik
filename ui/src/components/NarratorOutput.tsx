import { useEffect, useRef } from 'react';
import './NarratorOutput.css';

interface NarratorOutputProps {
  entries: string[];
  isLoading: boolean;
}

/**
 * Scrollable narrative log.  Automatically scrolls to the bottom when a new
 * entry is appended or while the loading indicator is visible.
 */
export function NarratorOutput({ entries, isLoading }: NarratorOutputProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries, isLoading]);

  return (
    <div className="narrator-output" role="log" aria-live="polite" aria-label="Narrative log">
      {entries.map((text, i) => (
        <p key={i} className="narrator-entry">
          {text}
        </p>
      ))}
      {isLoading && (
        <p className="narrator-entry narrator-loading" aria-label="Loading">
          ▌
        </p>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
