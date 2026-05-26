import { describe, expect, it } from "vitest";

import { filterTreeNodes, searchNodes } from "../../src/lib/filters";
import type { DiffNode } from "../../src/lib/types";

const nodes: DiffNode[] = [
  { kind: "directory", name: "src", path: "src", status: "modified" },
  { kind: "file", name: "same.ts", path: "src/same.ts", status: "equal" },
  { kind: "file", name: "changed.ts", path: "src/changed.ts", status: "modified" },
  { kind: "file", name: "old.ts", path: "old.ts", status: "left-only" }
];

describe("filter helpers", () => {
  it("keeps parents when filtering tree nodes", () => {
    expect(filterTreeNodes(nodes, "left-only").map((node) => node.path)).toEqual(["old.ts"]);
    expect(filterTreeNodes(nodes, "changed").map((node) => node.path)).toContain("src");
  });

  it("keeps parents when searching paths", () => {
    expect(searchNodes(nodes, "changed").map((node) => node.path)).toEqual(["src", "src/changed.ts"]);
  });
});
