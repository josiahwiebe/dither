import { FileTree } from "@pierre/trees";
import { describe, expect, it } from "vitest";

import { createTreeProjection } from "../../src/components/DirectoryTree";
import type { DiffNode } from "../../src/lib/types";

const metadata = {
  contentHash: "hash",
  isBinary: false,
  modifiedAt: 1,
  size: 1
};

describe("createTreeProjection", () => {
  it("marks directory nodes with trailing slashes for @pierre/trees", () => {
    const nodes: DiffNode[] = [
      {
        kind: "directory",
        left: metadata,
        name: "icon.iconset",
        path: "icon.iconset",
        right: metadata,
        status: "modified"
      },
      {
        kind: "file",
        left: metadata,
        name: "icon_16x16.png",
        path: "icon.iconset/icon_16x16.png",
        right: metadata,
        status: "equal"
      }
    ];

    const projection = createTreeProjection(nodes);

    expect(projection.paths).toEqual(["icon.iconset/", "icon.iconset/icon_16x16.png"]);
    expect(() => new FileTree({ paths: projection.paths })).not.toThrow();
  });

  it("renders type-changed file-directory paths as expandable directories", () => {
    const nodes: DiffNode[] = [
      {
        kind: "file",
        left: metadata,
        name: "icon.iconset",
        path: "icon.iconset",
        right: { modifiedAt: 1, size: 0 },
        status: "type-changed"
      },
      {
        kind: "file",
        name: "icon_16x16.png",
        path: "icon.iconset/icon_16x16.png",
        right: metadata,
        status: "right-only"
      }
    ];

    const projection = createTreeProjection(nodes);

    expect(projection.paths).toEqual(["icon.iconset/", "icon.iconset/icon_16x16.png"]);
    expect(projection.diffPathByTreePath.get("icon.iconset/")).toBe("icon.iconset");
    expect(projection.gitStatus).toContainEqual({ path: "icon.iconset/", status: "modified" });
    expect(() => new FileTree({ paths: projection.paths })).not.toThrow();
  });
});
