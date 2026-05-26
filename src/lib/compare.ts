import type {
  ComparisonSource,
  DiffNode,
  DiffStatus,
  DiffSummary,
  DirectoryEntry,
  FileMetadata,
  FileSystemAdapter,
  ReadyComparison,
  ReadFileResult
} from "./types";
import { getBasename, getParentPaths, normalizeRelativePath, sortTreePaths } from "./path";

const emptySummary: DiffSummary = {
  binary: 0,
  equal: 0,
  error: 0,
  leftOnly: 0,
  modified: 0,
  rightOnly: 0,
  skipped: 0,
  total: 0,
  typeChanged: 0
};

/** Compares two selected sources and returns a render-ready diff graph. */
export async function compareSources(
  adapter: FileSystemAdapter,
  left: ComparisonSource,
  right: ComparisonSource,
  options?: {
    onProgress?: (message: string, progress: number | null) => void;
    signal?: AbortSignal;
  }
): Promise<ReadyComparison> {
  if (left.kind !== right.kind) {
    throw new Error("Pick two files or two folders before comparing.");
  }

  if (left.kind === "file") {
    options?.onProgress?.("Reading files", null);
    const [leftFile, rightFile] = await Promise.all([
      adapter.readFile(left),
      adapter.readFile(right)
    ]);
    options?.signal?.throwIfAborted();

    const status = classifyFileStatus(leftFile, rightFile);
    const nodes: DiffNode[] = [
      {
        kind: "file",
        left: metadataFromReadResult(leftFile),
        name: left.name === right.name ? left.name : `${left.name} <-> ${right.name}`,
        path: left.name === right.name ? left.name : `${left.name} / ${right.name}`,
        right: metadataFromReadResult(rightFile),
        status
      }
    ];

    return {
      left,
      mode: "file",
      nodes,
      right,
      summary: summarizeNodes(nodes)
    };
  }

  options?.onProgress?.("Scanning folders", null);
  let scannedEntries = 0;
  const onEntryProgress = () => {
    scannedEntries += 1;
    if (scannedEntries % 20 === 0) {
      options?.onProgress?.(`Scanned ${scannedEntries.toLocaleString()} items`, null);
    }
  };

  const [leftEntries, rightEntries] = await Promise.all([
    adapter.walkDirectory(left, { onProgress: onEntryProgress, signal: options?.signal }),
    adapter.walkDirectory(right, { onProgress: onEntryProgress, signal: options?.signal })
  ]);
  options?.signal?.throwIfAborted();
  options?.onProgress?.("Building tree", null);

  const nodes = compareDirectoryEntries(leftEntries, rightEntries);
  return {
    left,
    mode: "directory",
    nodes,
    right,
    summary: summarizeNodes(nodes)
  };
}

export function compareDirectoryEntries(leftEntries: DirectoryEntry[], rightEntries: DirectoryEntry[]) {
  const leftMap = createEntryMap(leftEntries);
  const rightMap = createEntryMap(rightEntries);
  const paths = new Set([...leftMap.keys(), ...rightMap.keys()]);

  for (const path of [...paths]) {
    for (const parentPath of getParentPaths(path)) {
      paths.add(parentPath);
    }
  }

  const nodes = [...paths].sort(sortTreePaths).map<DiffNode>((path) => {
    const left = leftMap.get(path);
    const right = rightMap.get(path);
    const kind = left?.kind ?? right?.kind ?? "file";

    return {
      kind,
      left: left ? metadataFromEntry(left) : undefined,
      name: getBasename(path),
      path,
      right: right ? metadataFromEntry(right) : undefined,
      status: classifyDirectoryStatus(left, right)
    };
  });

  return propagateDirectoryStatus(nodes);
}

function createEntryMap(entries: DirectoryEntry[]) {
  const map = new Map<string, DirectoryEntry>();

  for (const entry of entries) {
    const relativePath = normalizeRelativePath(entry.relativePath);
    if (relativePath === "") continue;
    map.set(relativePath, { ...entry, relativePath });

    for (const parentPath of getParentPaths(relativePath)) {
      if (!map.has(parentPath)) {
        map.set(parentPath, {
          kind: "directory",
          modifiedAt: null,
          relativePath: parentPath,
          size: 0
        });
      }
    }
  }

  return map;
}

function classifyDirectoryStatus(left?: DirectoryEntry, right?: DirectoryEntry): DiffStatus {
  if (left?.error || right?.error) return "error";
  if (left == null) return "right-only";
  if (right == null) return "left-only";
  if (left.kind !== right.kind) return "type-changed";
  if (left.kind === "directory") return "equal";
  if (left.isBinary || right.isBinary) return left.contentHash === right.contentHash ? "equal" : "binary";
  return left.contentHash === right.contentHash && left.size === right.size ? "equal" : "modified";
}

function classifyFileStatus(left: ReadFileResult, right: ReadFileResult): DiffStatus {
  if (left.error || right.error) return "error";
  if (left.isBinary || right.isBinary) return left.contentHash === right.contentHash ? "equal" : "binary";
  return left.contentHash === right.contentHash && left.size === right.size ? "equal" : "modified";
}

function propagateDirectoryStatus(nodes: DiffNode[]) {
  const nodeMap = new Map(nodes.map((node) => [node.path, node]));

  for (const node of [...nodes].sort((left, right) => right.path.length - left.path.length)) {
    if (node.kind !== "directory" || node.status !== "equal") continue;

    const hasChangedChild = nodes.some((candidate) => {
      if (candidate.path === node.path) return false;
      if (!candidate.path.startsWith(`${node.path}/`)) return false;
      return candidate.status !== "equal";
    });

    if (hasChangedChild) {
      const mapped = nodeMap.get(node.path);
      if (mapped) mapped.status = "modified";
    }
  }

  return nodes;
}

function metadataFromReadResult(result: ReadFileResult): FileMetadata {
  return {
    contentHash: result.contentHash,
    error: result.error,
    isBinary: result.isBinary,
    modifiedAt: result.modifiedAt,
    size: result.size
  };
}

function metadataFromEntry(entry: DirectoryEntry): FileMetadata {
  return {
    contentHash: entry.contentHash,
    error: entry.error,
    isBinary: entry.isBinary,
    modifiedAt: entry.modifiedAt,
    size: entry.size
  };
}

export function summarizeNodes(nodes: DiffNode[]): DiffSummary {
  return nodes.reduce(
    (summary, node) => {
      summary.total += 1;

      if (node.status === "left-only") summary.leftOnly += 1;
      else if (node.status === "right-only") summary.rightOnly += 1;
      else if (node.status === "type-changed") summary.typeChanged += 1;
      else summary[node.status] += 1;

      return summary;
    },
    { ...emptySummary }
  );
}
