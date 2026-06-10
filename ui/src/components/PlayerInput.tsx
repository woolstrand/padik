import { useState, KeyboardEvent } from 'react';
import './PlayerInput.css';

interface PlayerInputProps {
  onAct: (text: string) => void;
  onSay: (text: string) => void;
  onSkip: () => void;
  disabled: boolean;
}

/**
 * Player input area: a multiline textarea and three action buttons.
 *
 * – Act:  submits text as a description of the player's actions.
 * – Say:  wraps text as direct speech from the player character.
 * – Skip: advances the scene without any explicit player input.
 *
 * Ctrl+Enter submits with the last-used button (defaults to Act).
 */
export function PlayerInput({ onAct, onSay, onSkip, disabled }: PlayerInputProps) {
  const [text, setText] = useState('');

  function handleAct() {
    if (!text.trim()) return;
    onAct(text.trim());
    setText('');
  }

  function handleSay() {
    if (!text.trim()) return;
    onSay(text.trim());
    setText('');
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleAct();
    }
  }

  return (
    <div className="player-input">
      <textarea
        className="player-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Что вы делаете или говорите?  (Ctrl+Enter — действие)"
        rows={4}
        disabled={disabled}
        aria-label="Player input"
      />
      <div className="player-buttons">
        <button
          className="btn btn-act"
          onClick={handleAct}
          disabled={disabled || !text.trim()}
          title="Описать действие"
        >
          Действие
        </button>
        <button
          className="btn btn-say"
          onClick={handleSay}
          disabled={disabled || !text.trim()}
          title="Сказать вслух"
        >
          Сказать
        </button>
        <button
          className="btn btn-skip"
          onClick={onSkip}
          disabled={disabled}
          title="Пропустить ход"
        >
          Пропустить
        </button>
      </div>
    </div>
  );
}
