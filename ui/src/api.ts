import {
  GameStateSnapshot,
  NpcDebugData,
  PlayerAction,
  StoryListResponse,
  TurnResult,
  TurnStreamEvent,
} from './types';

// The Vite dev server proxies /api to http://localhost:3001, so we use a
// relative path here.  This works for both dev and a production build
// served by the engine.
const API_BASE = '/api';

export async function fetchInitialState(): Promise<GameStateSnapshot> {
  const res = await fetch(`${API_BASE}/state`);
  if (!res.ok) throw new Error(`GET /api/state failed: ${res.status}`);
  return res.json() as Promise<GameStateSnapshot>;
}

export async function sendAction(action: PlayerAction): Promise<TurnResult> {
  const res = await fetch(`${API_BASE}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`POST /api/action failed (${res.status}): ${body}`);
  }
  return res.json() as Promise<TurnResult>;
}

/**
 * Streaming variant of sendAction.
 * Yields TurnStreamEvent objects as the engine emits them via SSE.
 * Throws on HTTP error or if the stream emits a TurnErrorEvent.
 */
export async function* sendActionStream(action: PlayerAction): AsyncGenerator<TurnStreamEvent> {
  const res = await fetch(`${API_BASE}/action/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action),
  });

  if (!res.ok || !res.body) {
    const body = await res.text();
    throw new Error(`POST /api/action/stream failed (${res.status}): ${body}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE lines are separated by double newlines; each line is "data: {...}"
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      for (const line of part.split('\n')) {
        if (line.startsWith('data: ')) {
          const event = JSON.parse(line.slice(6)) as TurnStreamEvent;
          yield event;
        }
      }
    }
  }
}

export async function fetchDebugData(): Promise<NpcDebugData[]> {
  const res = await fetch(`${API_BASE}/debug`);
  if (!res.ok) throw new Error(`GET /api/debug failed: ${res.status}`);
  return res.json() as Promise<NpcDebugData[]>;
}

export async function fetchStories(): Promise<StoryListResponse> {
  const res = await fetch(`${API_BASE}/stories`);
  if (!res.ok) throw new Error(`GET /api/stories failed: ${res.status}`);
  return res.json() as Promise<StoryListResponse>;
}

export async function startSession(storyId: string): Promise<GameStateSnapshot> {
  const res = await fetch(`${API_BASE}/session/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storyId }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`POST /api/session/start failed (${res.status}): ${body}`);
  }
  return res.json() as Promise<GameStateSnapshot>;
}
