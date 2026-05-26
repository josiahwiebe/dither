import type { DitherSession, GitActionKind } from "../lib/gitSession";

export type DesktopSourceKind = "file" | "directory";

export interface DesktopPickedSource {
  displayPath: string;
  kind: DesktopSourceKind;
  name: string;
  path: string;
  platform: "desktop";
}

export interface DesktopFilePayload {
  base64: string;
  contentHash: string;
  isBinary: boolean;
  modifiedAt: number;
  size: number;
}

export interface DesktopWalkEntry {
  contentHash?: string;
  error?: string;
  isBinary?: boolean;
  kind: DesktopSourceKind;
  modifiedAt: number | null;
  relativePath: string;
  size: number;
}

export interface DitherDesktopBridge {
  getLaunchSession(): Promise<DitherSession | null>;
  onLaunchSession(callback: (session: DitherSession) => void): () => void;
  performGitAction(request: {
    action: GitActionKind;
    filePath: string;
    hunkIndex?: number;
    session: DitherSession;
  }): Promise<DitherSession>;
  pickSource(kind?: DesktopSourceKind): Promise<DesktopPickedSource | null>;
  readGitFile(repoPath: string, relativePath: string): Promise<DesktopFilePayload>;
  readFile(source: DesktopPickedSource, relativePath?: string): Promise<DesktopFilePayload>;
  resolvePaths(paths: readonly string[]): Promise<DesktopPickedSource[]>;
  resolveDroppedSources(files: readonly File[]): Promise<DesktopPickedSource[]>;
  walkDirectory(source: DesktopPickedSource): Promise<DesktopWalkEntry[]>;
}
