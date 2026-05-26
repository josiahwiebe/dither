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
  pickSource(kind?: DesktopSourceKind): Promise<DesktopPickedSource | null>;
  readFile(source: DesktopPickedSource, relativePath?: string): Promise<DesktopFilePayload>;
  resolveDroppedSources(files: readonly File[]): Promise<DesktopPickedSource[]>;
  walkDirectory(source: DesktopPickedSource): Promise<DesktopWalkEntry[]>;
}
