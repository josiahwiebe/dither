import { isProbablyBinary } from "../lib/binary";
import { isDocxPath } from "../lib/fileKind";
import { hashBytes } from "../lib/hash";
import { joinRelativePath, normalizeRelativePath } from "../lib/path";
import type {
  BrowserComparisonSource,
  BrowserDirectorySource,
  BrowserFileSource,
  ComparisonSource,
  DirectoryEntry,
  FileSystemAdapter,
  ReadFileResult,
  SourceKind
} from "../lib/types";

const webkitRelativePathKey = "webkitRelativePath";

function createId(kind: SourceKind, name: string) {
  return `browser:${kind}:${name}:${crypto.randomUUID()}`;
}

function isBrowserFileSource(source: ComparisonSource): source is BrowserFileSource {
  return source.platform === "browser" && source.kind === "file";
}

function isBrowserDirectorySource(source: ComparisonSource): source is BrowserDirectorySource {
  return source.platform === "browser" && source.kind === "directory";
}

async function pickFileFallback(): Promise<BrowserFileSource | null> {
  const input = document.createElement("input");
  input.type = "file";

  const files = await readInputFiles(input);
  const file = files[0];
  if (!file) return null;

  return {
    displayPath: file.name,
    file,
    id: createId("file", file.name),
    kind: "file",
    name: file.name,
    platform: "browser"
  };
}

async function pickDirectoryFallback(): Promise<BrowserDirectorySource | null> {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.setAttribute("webkitdirectory", "");

  const files = await readInputFiles(input);
  if (files.length === 0) return null;

  const firstPath = getFileRelativePath(files[0]);
  const rootName = firstPath.split("/").filter(Boolean)[0] ?? "Folder";

  return {
    displayPath: rootName,
    files,
    id: createId("directory", rootName),
    kind: "directory",
    name: rootName,
    platform: "browser"
  };
}

function readInputFiles(input: HTMLInputElement) {
  return new Promise<File[]>((resolve) => {
    input.addEventListener(
      "change",
      () => {
        resolve(Array.from(input.files ?? []));
        input.remove();
      },
      { once: true }
    );
    input.click();
  });
}

function toDroppedFileSource(file: File): BrowserFileSource {
  return {
    displayPath: file.name,
    file,
    id: createId("file", file.name),
    kind: "file",
    name: file.name,
    platform: "browser"
  };
}

async function readFileToResult(file: File, relativePath = ""): Promise<ReadFileResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return {
    bytes,
    contentHash: await hashBytes(bytes),
    isBinary: !isDocxPath(file.name) && isProbablyBinary(bytes),
    modifiedAt: file.lastModified,
    name: file.name,
    relativePath,
    size: file.size
  };
}

function getFileRelativePath(file: File) {
  const raw = typeof file[webkitRelativePathKey] === "string" ? file[webkitRelativePathKey] : file.name;
  return normalizeRelativePath(raw);
}

function removeRootSegment(path: string, rootName: string) {
  const normalized = normalizeRelativePath(path);
  return normalized.startsWith(`${rootName}/`) ? normalized.slice(rootName.length + 1) : normalized;
}

async function findFileHandle(
  directory: FileSystemDirectoryHandle,
  relativePath: string
): Promise<FileSystemFileHandle | null> {
  const segments = normalizeRelativePath(relativePath).split("/").filter(Boolean);
  let current: FileSystemDirectoryHandle = directory;

  for (let index = 0; index < segments.length; index += 1) {
    for await (const [name, child] of current.entries()) {
      if (name !== segments[index]) continue;
      if (index === segments.length - 1 && child.kind === "file") {
        return child as FileSystemFileHandle;
      }
      if (child.kind === "directory") {
        current = child as FileSystemDirectoryHandle;
        break;
      }
    }
  }

  return null;
}

export function createWebFileSystemAdapter(): FileSystemAdapter {
  const directoryFiles = new Map<string, Map<string, FileSystemFileHandle>>();

  async function walkHandleDirectory(
    source: BrowserDirectorySource,
    handle: FileSystemDirectoryHandle,
    options?: Parameters<FileSystemAdapter["walkDirectory"]>[1]
  ) {
    const entries: DirectoryEntry[] = [];
    const files = new Map<string, FileSystemFileHandle>();

    async function visit(directory: FileSystemDirectoryHandle, relativeDirectory: string) {
      options?.signal?.throwIfAborted();

      for await (const [name, child] of directory.entries()) {
        if (name === ".DS_Store") continue;

        const relativePath = joinRelativePath(relativeDirectory, name);

        if (child.kind === "directory") {
          entries.push({
            kind: "directory",
            modifiedAt: null,
            relativePath,
            size: 0
          });
          options?.onProgress?.(entries.length);
          await visit(child as FileSystemDirectoryHandle, relativePath);
          continue;
        }

        const fileHandle = child as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        const result = await readFileToResult(file, relativePath);
        files.set(relativePath, fileHandle);
        entries.push({
          contentHash: result.contentHash,
          isBinary: result.isBinary,
          kind: "file",
          modifiedAt: result.modifiedAt,
          relativePath,
          size: result.size
        });
        options?.onProgress?.(entries.length);
      }
    }

    await visit(handle, "");
    directoryFiles.set(source.id, files);
    return entries;
  }

  async function walkFallbackDirectory(
    source: BrowserDirectorySource,
    files: readonly File[],
    options?: Parameters<FileSystemAdapter["walkDirectory"]>[1]
  ) {
    const entries: DirectoryEntry[] = [];
    const rootName = source.name;
    const directoryPaths = new Set<string>();

    for (const file of files) {
      options?.signal?.throwIfAborted();

      const relativePath = removeRootSegment(getFileRelativePath(file), rootName);
      if (!relativePath) continue;

      const segments = relativePath.split("/");
      for (let index = 1; index < segments.length; index += 1) {
        directoryPaths.add(segments.slice(0, index).join("/"));
      }

      const result = await readFileToResult(file, relativePath);
      entries.push({
        contentHash: result.contentHash,
        isBinary: result.isBinary,
        kind: "file",
        modifiedAt: result.modifiedAt,
        relativePath,
        size: result.size
      });
      options?.onProgress?.(entries.length);
    }

    return [
      ...Array.from(directoryPaths, (relativePath): DirectoryEntry => ({
        kind: "directory",
        modifiedAt: null,
        relativePath,
        size: 0
      })),
      ...entries
    ];
  }

  return {
    platform: "browser",
    async pickSource(kind?: SourceKind): Promise<BrowserComparisonSource | null> {
      if (kind !== "directory") return pickFileFallback();
      return pickDirectoryFallback();
    },
    async sourcesFromDataTransfer(dataTransfer: DataTransfer) {
      return Array.from(dataTransfer.files, toDroppedFileSource);
    },
    async readFile(source: ComparisonSource, relativePath = "") {
      if (isBrowserFileSource(source)) {
        const file = source.file ?? (await source.handle?.getFile());
        if (!file) throw new Error("Unable to read selected file.");
        return readFileToResult(file, relativePath);
      }

      if (!isBrowserDirectorySource(source)) {
        throw new Error("Browser source required.");
      }

      if (source.handle) {
        const handle =
          directoryFiles.get(source.id)?.get(normalizeRelativePath(relativePath)) ??
          (await findFileHandle(source.handle, relativePath));
        if (!handle) throw new Error(`Unable to read ${relativePath}.`);
        return readFileToResult(await handle.getFile(), relativePath);
      }

      const file = source.files?.find(
        (candidate) => removeRootSegment(getFileRelativePath(candidate), source.name) === relativePath
      );
      if (!file) throw new Error(`Unable to read ${relativePath}.`);
      return readFileToResult(file, relativePath);
    },
    async walkDirectory(source: ComparisonSource, options) {
      if (!isBrowserDirectorySource(source)) {
        throw new Error("Directory source required.");
      }

      if (source.handle) return walkHandleDirectory(source, source.handle, options);
      if (source.files) return walkFallbackDirectory(source, source.files, options);

      return [];
    }
  };
}
