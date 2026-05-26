import type { DesktopFilePayload, DesktopPickedSource, DesktopWalkEntry } from "../electron/bridge";
import { bytesFromBase64 } from "./base64";
import type {
  ComparisonSource,
  DirectoryEntry,
  FileSystemAdapter,
  ReadFileResult,
  SourceKind
} from "../lib/types";

function ensureDesktopBridge() {
  if (!window.dither) {
    throw new Error("Desktop filesystem bridge is unavailable.");
  }

  return window.dither;
}

function toSource(source: DesktopPickedSource): ComparisonSource {
  return {
    ...source,
    id: `desktop:${source.kind}:${source.path}`
  };
}

function toReadResult(source: ComparisonSource, payload: DesktopFilePayload, relativePath = ""): ReadFileResult {
  const bytes = bytesFromBase64(payload.base64);
  return {
    bytes,
    contentHash: payload.contentHash,
    isBinary: payload.isBinary,
    modifiedAt: payload.modifiedAt,
    name: relativePath || source.name,
    relativePath,
    size: payload.size
  };
}

function toDirectoryEntry(entry: DesktopWalkEntry): DirectoryEntry {
  return {
    contentHash: entry.contentHash,
    error: entry.error,
    isBinary: entry.isBinary,
    kind: entry.kind,
    modifiedAt: entry.modifiedAt,
    relativePath: entry.relativePath,
    size: entry.size
  };
}

export function createElectronFileSystemAdapter(): FileSystemAdapter {
  return {
    platform: "desktop",
    async pickSource(kind?: SourceKind) {
      const source = await ensureDesktopBridge().pickSource(kind);
      return source ? toSource(source) : null;
    },
    async sourcesFromDataTransfer(dataTransfer: DataTransfer) {
      return (await ensureDesktopBridge().resolveDroppedSources(Array.from(dataTransfer.files))).map(toSource);
    },
    async readFile(source: ComparisonSource, relativePath?: string) {
      if (source.platform !== "desktop") {
        throw new Error("Desktop source required.");
      }

      const payload = await ensureDesktopBridge().readFile(source, relativePath);
      return toReadResult(source, payload, relativePath);
    },
    async walkDirectory(source: ComparisonSource, options) {
      if (source.platform !== "desktop") {
        throw new Error("Desktop source required.");
      }

      const entries = await ensureDesktopBridge().walkDirectory(source);
      options?.signal?.throwIfAborted();
      options?.onProgress?.(entries.length);
      return entries.map(toDirectoryEntry);
    }
  };
}
