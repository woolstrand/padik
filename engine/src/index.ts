import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { LlmClient } from './llm/LlmClient';
import { NpcProcessor } from './engine/NpcProcessor';
import { Narrator } from './engine/Narrator';
import { Orchestrator } from './engine/Orchestrator';
import {
  LLM_BASE_URL,
  LLM_MAX_TOKENS,
  LLM_MODEL,
  LLM_TEMPERATURE,
  NPC_FILES,
  SERVER_PORT,
  WORLD_FILE,
} from './constants';
import { NpcConfig, PlayerAction, WorldConfig } from './types';

function loadJson<T>(filename: string): T {
  const filepath = path.join(__dirname, 'data', filename);
  return JSON.parse(fs.readFileSync(filepath, 'utf-8')) as T;
}

function buildOrchestrator(): Orchestrator {
  const llmClient = new LlmClient({
    baseURL: LLM_BASE_URL,
    model: LLM_MODEL,
    temperature: LLM_TEMPERATURE,
    maxTokens: LLM_MAX_TOKENS,
  });

  const npcProcessor = new NpcProcessor(llmClient);
  const narrator = new Narrator(llmClient);

  const worldConfig = loadJson<WorldConfig>(WORLD_FILE);
  const npcConfigs = NPC_FILES.map((f) => loadJson<NpcConfig>(f));

  return new Orchestrator(npcProcessor, narrator, npcConfigs, worldConfig);
}

// Composition root: wire up all dependencies here
const orchestrator = buildOrchestrator();

const app = express();
app.use(cors());
app.use(express.json());

/**
 * POST /api/action
 * Body: PlayerAction { type: 'act' | 'say' | 'skip', text: string }
 * Returns: TurnResult { narrative: string, npcOutputs: NpcOutput[] }
 */
app.post('/api/action', async (req: Request, res: Response) => {
  const playerAction = req.body as PlayerAction;

  if (!playerAction?.type || !['act', 'say', 'skip'].includes(playerAction.type)) {
    res.status(400).json({ error: 'Invalid action type. Use "act", "say", or "skip".' });
    return;
  }

  if (playerAction.type !== 'skip' && typeof playerAction.text !== 'string') {
    res.status(400).json({ error: 'Missing text for "act" or "say" action.' });
    return;
  }

  try {
    const result = await orchestrator.processTurn(playerAction);
    res.json(result);
  } catch (err) {
    console.error('Error processing turn:', err);
    res.status(500).json({ error: 'Failed to process turn. Is LM Studio running?' });
  }
});

/**
 * GET /api/state
 * Returns current game state snapshot (narrative history, turn count, world config).
 */
app.get('/api/state', (_req: Request, res: Response) => {
  const state = orchestrator.getGameState();
  res.json({
    narrativeHistory: state.narrativeHistory,
    turnCount: state.turnCount,
    worldConfig: state.worldConfig,
  });
});

/**
 * GET /api/debug
 * Returns per-NPC debug data: for each NPC, the list of steps with
 * input situation, output thoughts and output actions.
 */
app.get('/api/debug', (_req: Request, res: Response) => {
  res.json(orchestrator.getDebugData());
});

app.listen(SERVER_PORT, () => {
  console.log(`Padik game engine running on http://localhost:${SERVER_PORT}`);
  console.log(`LLM endpoint: ${LLM_BASE_URL}`);
});
