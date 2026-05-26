import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { createDiffSession, performGitAction } from "../../src/node/gitWorkbench";

function git(cwd: string, args: string[], input?: string) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    input
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }

  return result.stdout;
}

async function createRepo() {
  const repo = await mkdtemp(join(tmpdir(), "dither-git-"));
  git(repo, ["init"]);
  git(repo, ["config", "user.email", "dither@example.com"]);
  git(repo, ["config", "user.name", "Dither Test"]);
  git(repo, ["config", "commit.gpgsign", "false"]);
  await writeFile(
    join(repo, "demo.txt"),
    Array.from({ length: 24 }, (_, index) => `line ${index + 1}`).join("\n") + "\n"
  );
  git(repo, ["add", "demo.txt"]);
  git(repo, ["commit", "-m", "initial"]);
  return repo;
}

describe("git workbench actions", () => {
  it("stages and unstages a single hunk through checked git apply commands", async () => {
    const repo = await createRepo();
    const lines = Array.from({ length: 24 }, (_, index) => `line ${index + 1}`);
    lines[1] = "line 2 changed";
    lines[21] = "line 22 changed";
    await writeFile(join(repo, "demo.txt"), `${lines.join("\n")}\n`);

    const worktree = await createDiffSession({ repo });
    expect(worktree.files[0]?.hunks).toHaveLength(2);

    await performGitAction({
      action: "stage",
      filePath: "demo.txt",
      hunkIndex: 0,
      session: worktree
    });

    const stagedPatch = git(repo, ["diff", "--cached", "--", "demo.txt"]);
    const unstagedPatch = git(repo, ["diff", "--", "demo.txt"]);
    expect(stagedPatch).toContain("line 2 changed");
    expect(stagedPatch).not.toContain("line 22 changed");
    expect(unstagedPatch).toContain("line 22 changed");

    const staged = await createDiffSession({ repo, staged: true });
    await performGitAction({
      action: "unstage",
      filePath: "demo.txt",
      hunkIndex: 0,
      session: staged
    });

    expect(git(repo, ["diff", "--cached", "--", "demo.txt"]).trim()).toBe("");
  });
});
