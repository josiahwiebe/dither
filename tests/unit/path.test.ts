import { describe, expect, it } from "vitest";

import { getParentPaths, joinRelativePath, normalizeRelativePath, sortTreePaths } from "../../src/lib/path";

describe("path helpers", () => {
  it("normalizes path separators and redundant slashes", () => {
    expect(normalizeRelativePath("./src\\components//App.tsx/")).toBe("src/components/App.tsx");
  });

  it("joins relative tree paths", () => {
    expect(joinRelativePath("src/components", "App.tsx")).toBe("src/components/App.tsx");
    expect(joinRelativePath("", "README.md")).toBe("README.md");
  });

  it("returns ancestor paths without including the leaf", () => {
    expect(getParentPaths("src/components/App.tsx")).toEqual(["src", "src/components"]);
  });

  it("sorts paths naturally by tree segment", () => {
    expect(["src/file10.ts", "src", "src/file2.ts"].sort(sortTreePaths)).toEqual([
      "src",
      "src/file2.ts",
      "src/file10.ts"
    ]);
  });
});
