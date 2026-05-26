import { describe, expect, it } from "vitest";

import { createPatchSession, parseGitPatch, projectGitSession } from "../../src/lib/gitSession";

const samplePatch = `diff --git a/src/demo.ts b/src/demo.ts
index 1111111..2222222 100644
--- a/src/demo.ts
+++ b/src/demo.ts
@@ -1,4 +1,4 @@
 export const one = 1;
-export const two = 2;
+export const two = 22;
 export const three = 3;
 export const four = 4;
@@ -10,4 +10,4 @@ export const nine = 9;
 export const ten = 10;
-export const eleven = 11;
+export const eleven = 111;
 export const twelve = 12;
 export const thirteen = 13;
`;

describe("parseGitPatch", () => {
  it("parses file and hunk capabilities for worktree sessions", () => {
    const files = parseGitPatch(samplePatch, "worktree");

    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      additions: 2,
      capabilities: ["stage", "discard"],
      deletions: 2,
      path: "src/demo.ts",
      status: "modified"
    });
    expect(files[0]?.hunks).toHaveLength(2);
    expect(files[0]?.hunks[0]?.patch).toContain("diff --git a/src/demo.ts b/src/demo.ts");
    expect(files[0]?.hunks[0]?.capabilities).toEqual(["stage", "discard"]);
  });

  it("projects parsed files into the existing directory tree model", () => {
    const session = createPatchSession({
      mode: "worktree",
      patch: samplePatch,
      title: "Working tree"
    });

    const projection = projectGitSession(session);

    expect(projection.selectedPath).toBe("src/demo.ts");
    expect(projection.summary.modified).toBe(2);
    expect(projection.nodes.map((node) => node.path)).toEqual(["src", "src/demo.ts"]);
  });
});
