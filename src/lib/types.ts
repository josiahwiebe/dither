import type { DesktopPickedSource } from "../electron/bridge";

export type SourceKind = "file" | "directory";
export type SourcePlatform = "browser" | "desktop";

interface BrowserSourceBase {
  displayPath: string;
  id: string;
  name: string;
  platform: "browser";
}

export interface BrowserFileSource extends BrowserSourceBase {
  file?: File;
  handle?: FileSystemFileHandle;
  kind: "file";
}

export interface BrowserDirectorySource extends BrowserSourceBase {
  files?: readonly File[];
  handle?: FileSystemDirectoryHandle;
  kind: "directory";
}

export type BrowserComparisonSource = BrowserFileSource | BrowserDirectorySource;
export type DesktopComparisonSource = DesktopPickedSource & { id: string };
export type ComparisonSource = BrowserComparisonSource | DesktopComparisonSource;

export interface FileMetadata {
  contentHash?: string;
  error?: string;
  isBinary?: boolean;
  modifiedAt: number | null;
  size: number;
}

export interface DirectoryEntry extends FileMetadata {
  kind: SourceKind;
  relativePath: string;
}

export interface ReadFileResult extends FileMetadata {
  bytes: Uint8Array;
  name: string;
  relativePath: string;
}

export type DiffStatus =
  | "equal"
  | "modified"
  | "left-only"
  | "right-only"
  | "type-changed"
  | "binary"
  | "skipped"
  | "error";

export interface DiffNode {
  kind: SourceKind;
  left?: FileMetadata;
  name: string;
  path: string;
  right?: FileMetadata;
  status: DiffStatus;
}

export interface DiffSummary {
  binary: number;
  equal: number;
  error: number;
  leftOnly: number;
  modified: number;
  rightOnly: number;
  skipped: number;
  total: number;
  typeChanged: number;
}

export type ComparisonMode = "file" | "directory";

export interface ReadyComparison {
  left: ComparisonSource;
  mode: ComparisonMode;
  nodes: DiffNode[];
  right: ComparisonSource;
  summary: DiffSummary;
}

export type ComparisonSession =
  | { type: "idle" }
  | { message: string; type: "loading" }
  | { message: string; progress: number | null; type: "scanning" }
  | ({ type: "ready" } & ReadyComparison)
  | { error: string; type: "failed" };

export type StatusFilter = "all" | "changed" | "equal" | "left-only" | "right-only" | "issues";

export interface FileSystemAdapter {
  platform: SourcePlatform;
  pickSource(kind?: SourceKind): Promise<ComparisonSource | null>;
  readFile(source: ComparisonSource, relativePath?: string): Promise<ReadFileResult>;
  sourcesFromDataTransfer(dataTransfer: DataTransfer): Promise<ComparisonSource[]>;
  walkDirectory(
    source: ComparisonSource,
    options?: {
      onProgress?: (entriesRead: number) => void;
      signal?: AbortSignal;
    }
  ): Promise<DirectoryEntry[]>;
}
