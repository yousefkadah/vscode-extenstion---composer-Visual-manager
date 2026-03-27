import * as vscode from "vscode";
import * as crypto from "crypto";

interface CacheEntry {
  data: any;
  timestamp: number;
}

interface CacheStore {
  [key: string]: CacheEntry;
}

const MAX_ENTRIES = 500;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export class CacheService {
  private cache: CacheStore = {};
  private storageUri: vscode.Uri;

  constructor(private context: vscode.ExtensionContext, projectPath: string) {
    const hash = crypto.createHash("md5").update(projectPath).digest("hex").slice(0, 8);
    this.storageUri = vscode.Uri.joinPath(
      context.globalStorageUri,
      `cache-${hash}.json`
    );
    this.loadFromDisk();
  }

  private async loadFromDisk(): Promise<void> {
    try {
      const data = await vscode.workspace.fs.readFile(this.storageUri);
      this.cache = JSON.parse(Buffer.from(data).toString("utf-8"));
    } catch {
      this.cache = {};
    }
  }

  private async saveToDisk(): Promise<void> {
    try {
      await vscode.workspace.fs.createDirectory(
        vscode.Uri.joinPath(this.context.globalStorageUri)
      );
      const data = Buffer.from(JSON.stringify(this.cache), "utf-8");
      await vscode.workspace.fs.writeFile(this.storageUri, data);
    } catch {
      // Silently fail on cache write errors
    }
  }

  get<T>(key: string): T | null {
    const entry = this.cache[key];
    if (!entry) {
      return null;
    }

    if (Date.now() - entry.timestamp > TTL_MS) {
      delete this.cache[key];
      return null;
    }

    return entry.data as T;
  }

  async set(key: string, data: any): Promise<void> {
    // LRU eviction
    const keys = Object.keys(this.cache);
    if (keys.length >= MAX_ENTRIES) {
      const oldest = keys.sort(
        (a, b) => this.cache[a].timestamp - this.cache[b].timestamp
      );
      for (let i = 0; i < keys.length - MAX_ENTRIES + 1; i++) {
        delete this.cache[oldest[i]];
      }
    }

    this.cache[key] = { data, timestamp: Date.now() };
    await this.saveToDisk();
  }

  async clear(): Promise<void> {
    this.cache = {};
    await this.saveToDisk();
  }
}
