import { describe, expect, it } from "vitest";

import { compareDirectoryEntries, compareSources } from "../../src/lib/compare";
import { hashBytes } from "../../src/lib/hash";
import type {
  ComparisonSource,
  DirectoryEntry,
  FileSystemAdapter,
  ReadFileResult,
  SourceKind
} from "../../src/lib/types";

function source(id: string, kind: SourceKind): ComparisonSource {
  return {
    displayPath: id,
    id,
    kind,
    name: id,
    platform: "browser"
  };
}

async function readResult(name: string, contents: string): Promise<ReadFileResult> {
  const bytes = new TextEncoder().encode(contents);
  return {
    bytes,
    contentHash: await hashBytes(bytes),
    isBinary: false,
    modifiedAt: 1,
    name,
    relativePath: "",
    size: bytes.byteLength
  };
}

describe("compareSources", () => {
  it("compares two file sources through the filesystem adapter", async () => {
    const left = await readResult("note.txt", "left");
    const right = await readResult("note.txt", "right");
    const adapter: FileSystemAdapter = {
      platform: "browser",
      pickSource: async () => null,
      readFile: async (currentSource) => (currentSource.id === "left" ? left : right),
      sourcesFromDataTransfer: async () => [],
      walkDirectory: async () => []
    };

    const result = await compareSources(adapter, source("left", "file"), source("right", "file"));

    expect(result.mode).toBe("file");
    expect(result.nodes[0]?.status).toBe("modified");
    expect(result.summary.modified).toBe(1);
  });

  it("rejects mismatched source kinds", async () => {
    const adapter: FileSystemAdapter = {
      platform: "browser",
      pickSource: async () => null,
      readFile: async () => readResult("unused", ""),
      sourcesFromDataTransfer: async () => [],
      walkDirectory: async () => []
    };

    await expect(compareSources(adapter, source("left", "file"), source("right", "directory"))).rejects.toThrow(
      "Pick two files or two folders"
    );
  });
});

describe("compareDirectoryEntries", () => {
  it("classifies directory nodes and propagates changed state to parents", () => {
    const left: DirectoryEntry[] = [
      { contentHash: "a", isBinary: false, kind: "file", modifiedAt: 1, relativePath: "src/same.ts", size: 1 },
      { contentHash: "b", isBinary: false, kind: "file", modifiedAt: 1, relativePath: "src/changed.ts", size: 1 },
      { contentHash: "bin-left", isBinary: true, kind: "file", modifiedAt: 1, relativePath: "assets/logo.png", size: 2 },
      { contentHash: "left", isBinary: false, kind: "file", modifiedAt: 1, relativePath: "left-only.txt", size: 1 }
    ];
    const right: DirectoryEntry[] = [
      { contentHash: "a", isBinary: false, kind: "file", modifiedAt: 1, relativePath: "src/same.ts", size: 1 },
      { contentHash: "c", isBinary: false, kind: "file", modifiedAt: 1, relativePath: "src/changed.ts", size: 1 },
      { contentHash: "bin-right", isBinary: true, kind: "file", modifiedAt: 1, relativePath: "assets/logo.png", size: 2 },
      { contentHash: "right", isBinary: false, kind: "file", modifiedAt: 1, relativePath: "right-only.txt", size: 1 }
    ];

    const nodes = compareDirectoryEntries(left, right);
    const statusByPath = new Map(nodes.map((node) => [node.path, node.status]));

    expect(statusByPath.get("src")).toBe("modified");
    expect(statusByPath.get("src/same.ts")).toBe("equal");
    expect(statusByPath.get("src/changed.ts")).toBe("modified");
    expect(statusByPath.get("assets/logo.png")).toBe("binary");
    expect(statusByPath.get("left-only.txt")).toBe("left-only");
    expect(statusByPath.get("right-only.txt")).toBe("right-only");
  });
});
