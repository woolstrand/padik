import { GameStateSnapshot, NpcDebugData, PlayerAction, TurnResult } from './types';

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

export async function fetchDebugData(): Promise<NpcDebugData[]> {
  const res = await fetch(`${API_BASE}/debug`);
  if (!res.ok) throw new Error(`GET /api/debug failed: ${res.status}`);
  return res.json() as Promise<NpcDebugData[]>;
}
