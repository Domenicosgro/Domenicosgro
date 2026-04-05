import chokidar, { FSWatcher } from 'chokidar';
import path from 'path';

// ─── Supported file types for auto-import ────────────────────────────────────
const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.tif']);

// ─── Watcher registry ─────────────────────────────────────────────────────────
const watchers = new Map<string, FSWatcher>();

export function startFolderWatcher(
  folderPath: string,
  onFileAdded: (filePath: string) => void,
): void {
  if (watchers.has(folderPath)) {
    console.log(`[FolderWatcher] Already watching: ${folderPath}`);
    return;
  }

  const watcher = chokidar.watch(folderPath, {
    persistent: true,
    ignoreInitial: true,       // Don't emit events for files that already exist
    depth: 1,                  // Watch immediate children only (not recursive)
    awaitWriteFinish: {
      stabilityThreshold: 1000, // Wait 1s after write finishes before firing
      pollInterval: 200,
    },
    ignored: /(^|[/\\])\../, // Ignore dot-files
  });

  watcher.on('add', (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (SUPPORTED_EXTENSIONS.has(ext)) {
      console.log(`[FolderWatcher] New file detected: ${filePath}`);
      onFileAdded(filePath);
    }
  });

  watcher.on('error', (error) => {
    console.error(`[FolderWatcher] Error watching ${folderPath}:`, error);
  });

  watchers.set(folderPath, watcher);
  console.log(`[FolderWatcher] Started watching: ${folderPath}`);
}

export function stopFolderWatcher(folderPath?: string): void {
  if (folderPath) {
    const watcher = watchers.get(folderPath);
    if (watcher) {
      watcher.close();
      watchers.delete(folderPath);
      console.log(`[FolderWatcher] Stopped watching: ${folderPath}`);
    }
  } else {
    // Stop all
    for (const [folder, watcher] of watchers) {
      watcher.close();
      console.log(`[FolderWatcher] Stopped watching: ${folder}`);
    }
    watchers.clear();
  }
}
