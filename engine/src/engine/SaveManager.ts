import fs from 'fs';
import path from 'path';
import { OrchestratorSaveData, SaveSnapshot } from '../types';

/**
 * SaveManager — reads and writes per-story save files.
 *
 * Each story has a single save slot: `{savesDir}/{storyId}.json`.
 * Serialization is plain JSON; all state types are already JSON-safe.
 */
export class SaveManager {
  private readonly savesDir: string;

  constructor(savesDir: string) {
    this.savesDir = savesDir;
  }

  hasSave(storyId: string): boolean {
    return fs.existsSync(this.savePath(storyId));
  }

  save(storyId: string, data: OrchestratorSaveData): void {
    const snapshot: SaveSnapshot = { ...data, storyId, savedAt: new Date().toISOString() };
    fs.mkdirSync(this.savesDir, { recursive: true });
    fs.writeFileSync(this.savePath(storyId), JSON.stringify(snapshot, null, 2), 'utf-8');
  }

  load(storyId: string): SaveSnapshot {
    const filePath = this.savePath(storyId);
    if (!fs.existsSync(filePath)) {
      throw new Error(`No save found for story "${storyId}".`);
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as SaveSnapshot;
  }

  private savePath(storyId: string): string {
    return path.join(this.savesDir, `${storyId}.json`);
  }
}
