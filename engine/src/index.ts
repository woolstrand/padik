import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { LlmClient } from './llm/LlmClient';
import { NpcProcessor } from './engine/NpcProcessor';
import { Narrator } from './engine/Narrator';
import { SceneProcessor } from './engine/SceneProcessor';
import { ObservationProcessor } from './engine/ObservationProcessor';
import { Orchestrator } from './engine/Orchestrator';
import {
  DEFAULT_STORY_ID,
  LLM_BASE_URL,
  LLM_MAX_TOKENS,
  LLM_MODEL,
  LLM_TEMPERATURE,
  SERVER_PORT,
  STORIES_DIR,
  STORY_SELECTION_FILE,
  USERDATA_DIR,
  WORLD_FILE,
} from './constants';
import { GameStateSnapshot, NpcConfig, PlayerAction, StoryInfo, StoryListResponse, WorldConfig } from './types';

function loadJson<T>(filepath: string): T {
  return JSON.parse(fs.readFileSync(filepath, 'utf-8')) as T;
}

const repoRoot = path.resolve(__dirname, '..', '..');
const userdataRoot = path.join(repoRoot, USERDATA_DIR);
const storiesRoot = path.join(userdataRoot, STORIES_DIR);
const selectedStoryPath = path.join(userdataRoot, STORY_SELECTION_FILE);
const storiesRootWithSeparator = `${path.resolve(storiesRoot)}${path.sep}`;

function listStories(): StoryInfo[] {
  if (!fs.existsSync(storiesRoot)) return [];

  return fs
    .readdirSync(storiesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((storyId) => isValidStoryId(storyId) && isStoryFolderValid(storyId))
    .sort()
    .map((id) => ({ id }));
}

function isValidStoryId(storyId: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(storyId);
}

function getStoryFolderPath(storyId: string): string {
  if (!isValidStoryId(storyId)) {
    throw new Error(`Invalid story id: ${storyId}`);
  }

  const resolvedStoryPath = path.resolve(storiesRoot, storyId);
  if (!resolvedStoryPath.startsWith(storiesRootWithSeparator)) {
    throw new Error(`Invalid story path for id: ${storyId}`);
  }

  return resolvedStoryPath;
}

function isStoryFolderValid(storyId: string): boolean {
  const folderPath = getStoryFolderPath(storyId);
  if (!fs.existsSync(path.join(folderPath, WORLD_FILE))) return false;
  const npcFiles = fs
    .readdirSync(folderPath)
    .filter((filename) => filename.startsWith('npc_') && filename.endsWith('.json'));
  return npcFiles.length > 0;
}

function getNpcFiles(storyId: string): string[] {
  const storyFolder = getStoryFolderPath(storyId);
  return fs
    .readdirSync(storyFolder)
    .filter((filename) => filename.startsWith('npc_') && filename.endsWith('.json'))
    .sort();
}

function readSelectedStoryId(availableStories: StoryInfo[]): string {
  if (availableStories.length === 0) {
    throw new Error(`No valid stories found in ${storiesRoot}`);
  }

  const storyIds = new Set(availableStories.map((story) => story.id));

  if (fs.existsSync(selectedStoryPath)) {
    try {
      const raw = loadJson<{ storyId?: string }>(selectedStoryPath);
      if (raw.storyId && storyIds.has(raw.storyId)) {
        return raw.storyId;
      }
    } catch (err) {
      console.warn(`Ignoring invalid selected story file at ${selectedStoryPath}:`, err);
    }
  }

  if (storyIds.has(DEFAULT_STORY_ID)) {
    return DEFAULT_STORY_ID;
  }

  return availableStories[0].id;
}

function writeSelectedStoryId(storyId: string): void {
  fs.mkdirSync(userdataRoot, { recursive: true });
  fs.writeFileSync(selectedStoryPath, JSON.stringify({ storyId }, null, 2));
}

function buildOrchestrator(storyId: string): Orchestrator {
  const llmClient = new LlmClient({
    baseURL: LLM_BASE_URL,
    model: LLM_MODEL,
    temperature: LLM_TEMPERATURE,
    maxTokens: LLM_MAX_TOKENS,
  });

  const npcProcessor = new NpcProcessor(llmClient);
  const narrator = new Narrator(llmClient);
  const sceneProcessor = new SceneProcessor(llmClient);
  const observationProcessor = new ObservationProcessor(llmClient);

  const storyFolder = getStoryFolderPath(storyId);
  const worldConfig = loadJson<WorldConfig>(path.join(storyFolder, WORLD_FILE));
  const npcConfigs = getNpcFiles(storyId).map((filename) =>
    loadJson<NpcConfig>(path.join(storyFolder, filename)),
  );

  return new Orchestrator(npcProcessor, narrator, sceneProcessor, observationProcessor, npcConfigs, worldConfig, llmClient);
}

// Composition root: wire up all dependencies here
fs.mkdirSync(storiesRoot, { recursive: true });
const initialStories = listStories();
let currentStoryId = readSelectedStoryId(initialStories);
writeSelectedStoryId(currentStoryId);
let orchestrator = buildOrchestrator(currentStoryId);

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

  if (!playerAction?.type || !['act', 'say', 'skip', 'observe'].includes(playerAction.type)) {
    res.status(400).json({ error: 'Invalid action type. Use "act", "say", "skip", or "observe".' });
    return;
  }

  if (playerAction.type !== 'skip' && typeof playerAction.text !== 'string') {
    res.status(400).json({ error: 'Missing text for "act", "say", or "observe" action.' });
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
 * POST /api/action/stream
 * Body: PlayerAction { type: 'act' | 'say' | 'skip', text: string }
 * Returns: Server-Sent Events stream of TurnStreamEvent objects.
 *   - {"type":"npc:start","npcId":"...","npcName":"..."}
 *   - {"type":"npc:done","npcId":"...","npcName":"...","npcOutput":{...}}
 *   - {"type":"narrator:token","token":"..."}
 *   - {"type":"done","narrative":"...","npcOutputs":[...]}
 *   - {"type":"error","message":"..."}
 */
app.post('/api/action/stream', async (req: Request, res: Response) => {
  const playerAction = req.body as PlayerAction;

  if (!playerAction?.type || !['act', 'say', 'skip', 'observe'].includes(playerAction.type)) {
    res.status(400).json({ error: 'Invalid action type. Use "act", "say", "skip", or "observe".' });
    return;
  }

  if (playerAction.type !== 'skip' && typeof playerAction.text !== 'string') {
    res.status(400).json({ error: 'Missing text for "act", "say", or "observe" action.' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (event: object) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    for await (const event of orchestrator.processTurnStream(playerAction)) {
      sendEvent(event);
    }
  } catch (err) {
    console.error('Error processing turn stream:', err);
    sendEvent({ type: 'error', message: 'Failed to process turn. Is LM Studio running?' });
  } finally {
    res.end();
  }
});

/**
 * POST /api/action/retry/stream
 * Rolls back the last turn and re-processes it with fresh LLM calls.
 * Returns the same Server-Sent Events stream as /api/action/stream.
 */
app.post('/api/action/retry/stream', async (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (event: object) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    for await (const event of orchestrator.retryLastTurnStream()) {
      sendEvent(event);
    }
  } catch (err) {
    console.error('Error retrying turn stream:', err);
    sendEvent({ type: 'error', message: 'Failed to retry turn. Is LM Studio running?' });
  } finally {
    res.end();
  }
});


/**
 * POST /api/turn/cancel
 * Cancels the turn currently in progress and restores the pre-turn checkpoint.
 */
app.post('/api/turn/cancel', (_req: Request, res: Response) => {
  orchestrator.cancelTurn();
  res.json({ ok: true });
});

app.get('/api/state', (_req: Request, res: Response) => {
  const state = orchestrator.getGameState();
  const snapshot: GameStateSnapshot = {
    narrativeHistory: state.narrativeHistory,
    turnCount: state.turnCount,
    worldConfig: state.worldConfig,
    storyId: currentStoryId,
    sceneState: orchestrator.getSceneState(),
    storyHistory: state.storyHistory,
  };
  res.json(snapshot);
});

app.get('/api/stories', (_req: Request, res: Response) => {
  const stories = listStories();
  const response: StoryListResponse = { stories, selectedStoryId: currentStoryId };
  res.json(response);
});

app.post('/api/session/start', (req: Request, res: Response) => {
  const storyId = req.body?.storyId;

  if (typeof storyId !== 'string' || !isValidStoryId(storyId)) {
    res.status(400).json({ error: 'Invalid story id.' });
    return;
  }

  const stories = listStories();
  if (!stories.some((story) => story.id === storyId)) {
    res.status(404).json({ error: `Story "${storyId}" not found.` });
    return;
  }

  try {
    orchestrator = buildOrchestrator(storyId);
    currentStoryId = storyId;
    writeSelectedStoryId(storyId);
    const state = orchestrator.getGameState();
    const snapshot: GameStateSnapshot = {
      narrativeHistory: state.narrativeHistory,
      turnCount: state.turnCount,
      worldConfig: state.worldConfig,
      storyId: currentStoryId,
      sceneState: orchestrator.getSceneState(),
      storyHistory: state.storyHistory,
    };
    res.json(snapshot);
  } catch (err) {
    console.error('Error starting session:', err);
    res.status(500).json({ error: 'Failed to start a new session.' });
  }
});

/**
 * GET /api/debug
 * Returns per-NPC debug data: for each NPC, the list of steps with
 * input situation, output thoughts and output actions.
 */
app.get('/api/debug', (_req: Request, res: Response) => {
  res.json(orchestrator.getDebugData());
});

app.listen(SERVER_PORT, '0.0.0.0', () => {
  console.log(`Padik game engine running on http://0.0.0.0:${SERVER_PORT}`);
  console.log(`LLM endpoint: ${LLM_BASE_URL}`);
  console.log(`Selected story: ${currentStoryId}`);
});
