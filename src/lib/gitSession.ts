import type { DiffNode, DiffStatus, DiffSummary } from "./types";
import { getBasename, getParentPaths, normalizeRelativePath, sortTreePaths } from "./path";
import { summarizeNodes } from "./compare";

export const ditherSessionSchema = "dither.session.v1" as const;

export type GitSessionMode = "worktree" | "staged" | "range" | "merge-base" | "patch" | "conflicts" | "file-pair";
export type GitReviewSessionMode = Exclude<GitSessionMode, "file-pair">;

export type GitFileStatus = "added" | "deleted" | "modified" | "renamed" | "copied" | "binary" | "conflicted";

export type GitActionKind = "stage" | "unstage" | "discard" | "apply";

export interface GitSessionHunk {
  capabilities: GitActionKind[];
  header: string;
  index: number;
  newLines: number;
  newStart: number;
  oldLines: number;
  oldStart: number;
  patch: string;
}

export interface GitSessionFile {
  additions: number;
  capabilities: GitActionKind[];
  conflict: boolean;
  deletions: number;
  hunks: GitSessionHunk[];
  isBinary: boolean;
  oldPath?: string;
  path: string;
  patch: string;
  status: GitFileStatus;
}

export interface GitSessionMetadata {
  branch?: string;
  head?: string;
  mergeHead?: string;
  repoPath?: string;
}

export interface DitherSessionBase {
  createdAt: string;
  files: GitSessionFile[];
  git?: GitSessionMetadata;
  id: string;
  mode: GitReviewSessionMode;
  patch: string;
  schema: typeof ditherSessionSchema;
  selectedPath?: string;
  title: string;
  warnings: string[];
}

export interface FilePairSession extends Omit<DitherSessionBase, "mode"> {
  leftPath: string;
  mode: "file-pair";
  rightPath: string;
}

export type DitherSession = DitherSessionBase | FilePairSession;

export interface SessionProjection {
  nodes: DiffNode[];
  selectedPath: string | null;
  summary: DiffSummary;
}

interface ParsedFilePatch {
  headerLines: string[];
  hunkLines: string[][];
  lines: string[];
}

const diffHeaderPattern = /^diff --git ("?a\/.+?"?) ("?b\/.+?"?)$/;
const hunkHeaderPattern = /^@@ -(?<oldStart>\d+)(?:,(?<oldLines>\d+))? \+(?<newStart>\d+)(?:,(?<newLines>\d+))? @@/;

export function createSessionId() {
  return `dither-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function stripGitPath(path: string) {
  const unquoted = path.startsWith("\"") && path.endsWith("\"") ? path.slice(1, -1) : path;
  return normalizeRelativePath(unquoted.replace(/^[ab]\//, ""));
}

function splitLinesWithEndings(value: string) {
  if (!value) return [];
  return value.match(/[^\n]*(?:\n|$)/g)?.filter((line) => line.length > 0) ?? [];
}

function joinPatchLines(lines: string[]) {
  const patch = lines.join("");
  return patch.endsWith("\n") ? patch : `${patch}\n`;
}

function splitFilePatches(patch: string): ParsedFilePatch[] {
  const lines = splitLinesWithEndings(patch);
  const files: ParsedFilePatch[] = [];
  let current: ParsedFilePatch | null = null;
  let currentHunk: string[] | null = null;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      current = { headerLines: [], hunkLines: [], lines: [] };
      currentHunk = null;
      files.push(current);
    }

    if (!current) continue;

    current.lines.push(line);

    if (line.startsWith("@@ ")) {
      currentHunk = [];
      current.hunkLines.push(currentHunk);
    }

    if (currentHunk) {
      currentHunk.push(line);
    } else {
      current.headerLines.push(line);
    }
  }

  return files;
}

function getPatchPath(lines: string[], marker: "---" | "+++") {
  const line = lines.find((candidate) => candidate.startsWith(`${marker} `));
  if (!line) return undefined;
  const rawPath = line.slice(4).trim();
  return rawPath === "/dev/null" ? undefined : stripGitPath(rawPath);
}

function getDiffHeaderPaths(lines: string[]) {
  const line = lines.find((candidate) => candidate.startsWith("diff --git "));
  const match = line?.trimEnd().match(diffHeaderPattern);
  if (!match) return {};

  return {
    oldPath: stripGitPath(match[1] ?? ""),
    path: stripGitPath(match[2] ?? "")
  };
}

function countChangedLines(hunkLines: string[]) {
  let additions = 0;
  let deletions = 0;

  for (const line of hunkLines) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) additions += 1;
    else if (line.startsWith("-")) deletions += 1;
  }

  return { additions, deletions };
}

function parseHunk(lines: string[], index: number, headerLines: string[], capabilities: GitActionKind[]): GitSessionHunk | null {
  const header = lines[0]?.trimEnd();
  if (!header) return null;
  const match = header.match(hunkHeaderPattern);
  if (!match?.groups) return null;

  return {
    capabilities,
    header,
    index,
    newLines: Number(match.groups.newLines ?? "1"),
    newStart: Number(match.groups.newStart),
    oldLines: Number(match.groups.oldLines ?? "1"),
    oldStart: Number(match.groups.oldStart),
    patch: joinPatchLines([...headerLines, ...lines])
  };
}

function inferStatus(headerLines: string[], path: string, oldPath: string | undefined): GitFileStatus {
  if (headerLines.some((line) => line.startsWith("Binary files ") || line.startsWith("GIT binary patch"))) return "binary";
  if (headerLines.some((line) => line.startsWith("new file mode"))) return "added";
  if (headerLines.some((line) => line.startsWith("deleted file mode"))) return "deleted";
  if (headerLines.some((line) => line.startsWith("copy from "))) return "copied";
  if (headerLines.some((line) => line.startsWith("rename from ")) || (oldPath && oldPath !== path)) return "renamed";
  return "modified";
}

export function getCapabilitiesForMode(mode: GitSessionMode, isBinary = false): GitActionKind[] {
  if (isBinary || mode === "conflicts" || mode === "file-pair" || mode === "merge-base") return [];
  if (mode === "worktree") return ["stage", "discard"];
  if (mode === "staged") return ["unstage"];
  if (mode === "patch" || mode === "range") return ["apply"];
  return [];
}

export function parseGitPatch(patch: string, mode: GitSessionMode): GitSessionFile[] {
  return splitFilePatches(patch).map((filePatch) => {
    const oldPath = getPatchPath(filePatch.headerLines, "---") ?? getDiffHeaderPaths(filePatch.headerLines).oldPath;
    const path = getPatchPath(filePatch.headerLines, "+++") ?? getDiffHeaderPaths(filePatch.headerLines).path ?? oldPath ?? "unknown";
    const isBinary = filePatch.headerLines.some((line) => line.startsWith("Binary files ") || line.startsWith("GIT binary patch"));
    const capabilities = getCapabilitiesForMode(mode, isBinary);
    const hunks = filePatch.hunkLines
      .map((lines, index) => parseHunk(lines, index, filePatch.headerLines, capabilities))
      .filter((hunk): hunk is GitSessionHunk => Boolean(hunk));
    const totals = filePatch.hunkLines.reduce(
      (total, lines) => {
        const next = countChangedLines(lines);
        total.additions += next.additions;
        total.deletions += next.deletions;
        return total;
      },
      { additions: 0, deletions: 0 }
    );

    return {
      additions: totals.additions,
      capabilities,
      conflict: false,
      deletions: totals.deletions,
      hunks,
      isBinary,
      oldPath: oldPath && oldPath !== path ? oldPath : undefined,
      path,
      patch: joinPatchLines(filePatch.lines),
      status: inferStatus(filePatch.headerLines, path, oldPath)
    };
  });
}

export function createPatchSession(input: {
  files?: GitSessionFile[];
  git?: GitSessionMetadata;
  id?: string;
  mode: GitReviewSessionMode;
  patch: string;
  title: string;
  warnings?: string[];
}): DitherSession {
  const files = input.files ?? parseGitPatch(input.patch, input.mode);

  return {
    createdAt: new Date().toISOString(),
    files,
    git: input.git,
    id: input.id ?? createSessionId(),
    mode: input.mode,
    patch: input.patch,
    schema: ditherSessionSchema,
    selectedPath: files[0]?.path,
    title: input.title,
    warnings: input.warnings ?? []
  };
}

function statusToDiffStatus(status: GitFileStatus): DiffStatus {
  if (status === "added" || status === "copied") return "right-only";
  if (status === "deleted") return "left-only";
  if (status === "binary") return "binary";
  if (status === "conflicted") return "error";
  return "modified";
}

function createMetadata(file: GitSessionFile, side: "left" | "right") {
  if (file.status === "added" && side === "left") return undefined;
  if (file.status === "deleted" && side === "right") return undefined;
  return {
    isBinary: file.isBinary,
    modifiedAt: null,
    size: 0
  };
}

export function projectGitSession(session: DitherSession): SessionProjection {
  const paths = new Set<string>();
  const fileByPath = new Map(session.files.map((file) => [normalizeRelativePath(file.path), file]));

  for (const file of session.files) {
    const path = normalizeRelativePath(file.path);
    paths.add(path);
    for (const parent of getParentPaths(path)) paths.add(parent);
  }

  const nodes = [...paths].sort(sortTreePaths).map<DiffNode>((path) => {
    const file = fileByPath.get(path);

    if (!file) {
      return {
        kind: "directory",
        name: getBasename(path),
        path,
        status: "modified"
      };
    }

    return {
      kind: "file",
      left: createMetadata(file, "left"),
      name: getBasename(path),
      path,
      right: createMetadata(file, "right"),
      status: statusToDiffStatus(file.status)
    };
  });

  return {
    nodes,
    selectedPath: session.selectedPath ?? nodes.find((node) => node.kind === "file")?.path ?? null,
    summary: summarizeNodes(nodes)
  };
}

export function isDitherSession(value: unknown): value is DitherSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<DitherSession>;
  return (
    session.schema === ditherSessionSchema &&
    typeof session.id === "string" &&
    typeof session.mode === "string" &&
    Array.isArray(session.files) &&
    typeof session.patch === "string" &&
    typeof session.title === "string" &&
    Array.isArray(session.warnings)
  );
}
