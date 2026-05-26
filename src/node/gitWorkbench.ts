import { spawnSync } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";

import {
  createPatchSession,
  createSessionId,
  ditherSessionSchema,
  getCapabilitiesForMode,
  isDitherSession,
  type DitherSession,
  type GitActionKind,
  type GitSessionFile,
  type GitSessionMode
} from "../lib/gitSession";
import { normalizeRelativePath } from "../lib/path";

export interface LaunchResult {
  capabilities: GitActionKind[];
  files: string[];
  mode: GitSessionMode;
  openUrl: string;
  repoPath?: string;
  sessionId: string;
  sessionPath: string;
  warnings: string[];
}

export interface DiffSessionOptions {
  mergeBase?: string;
  paths?: string[];
  range?: string;
  repo?: string;
  staged?: boolean;
  worktree?: boolean;
}

export interface GitActionRequest {
  action: GitActionKind;
  filePath: string;
  hunkIndex?: number;
  session: DitherSession;
}

interface GitResult {
  stderr: string;
  stdout: string;
}

const sessionDirectory = resolve(tmpdir(), "dither", "sessions");

function ensureString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function runGit(cwd: string, args: string[], input?: string): GitResult {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    input,
    maxBuffer: 1024 * 1024 * 64
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(ensureString(result.stderr) || `git ${args.join(" ")} failed.`);
  }

  return {
    stderr: ensureString(result.stderr),
    stdout: ensureString(result.stdout)
  };
}

export function resolveRepoRoot(repo = process.cwd()) {
  const cwd = resolve(repo);
  return runGit(cwd, ["rev-parse", "--show-toplevel"]).stdout.trim();
}

function maybeGit(cwd: string, args: string[]) {
  try {
    return runGit(cwd, args).stdout.trim();
  } catch {
    return undefined;
  }
}

function getGitMetadata(repoPath: string) {
  return {
    branch: maybeGit(repoPath, ["branch", "--show-current"]),
    head: maybeGit(repoPath, ["rev-parse", "--short", "HEAD"]),
    mergeHead: maybeGit(repoPath, ["rev-parse", "--verify", "--short", "MERGE_HEAD"]),
    repoPath
  };
}

function pathArgs(paths: string[] | undefined) {
  return paths && paths.length > 0 ? ["--", ...paths] : [];
}

function getUntrackedWarnings(repoPath: string) {
  const untracked = maybeGit(repoPath, ["ls-files", "--others", "--exclude-standard"]);
  if (!untracked) return [];
  const count = untracked.split("\n").filter(Boolean).length;
  return count > 0 ? [`${count.toLocaleString()} untracked file${count === 1 ? "" : "s"} not included in this diff.`] : [];
}

function getSessionCapabilities(files: GitSessionFile[]) {
  return [...new Set(files.flatMap((file) => file.capabilities))].sort();
}

export function createSessionUrl(sessionPath: string) {
  return `dither://session?path=${encodeURIComponent(sessionPath)}`;
}

export async function writeSessionFile(session: DitherSession) {
  await mkdir(sessionDirectory, { recursive: true });
  const sessionPath = resolve(sessionDirectory, `${session.id}.json`);
  await writeFile(sessionPath, `${JSON.stringify(session, null, 2)}\n`);
  return sessionPath;
}

export async function readSessionFile(sessionPath: string) {
  const value = JSON.parse(await readFile(sessionPath, "utf8")) as unknown;
  if (!isDitherSession(value)) {
    throw new Error("Invalid Dither session file.");
  }

  return value;
}

export async function createLaunchResult(session: DitherSession, sessionPath = ""): Promise<LaunchResult> {
  const resolvedSessionPath = sessionPath || (await writeSessionFile(session));

  return {
    capabilities: getSessionCapabilities(session.files),
    files: session.files.map((file) => file.path),
    mode: session.mode,
    openUrl: createSessionUrl(resolvedSessionPath),
    repoPath: session.git?.repoPath,
    sessionId: session.id,
    sessionPath: resolvedSessionPath,
    warnings: session.warnings
  };
}

export async function createDiffSession(options: DiffSessionOptions) {
  const repoPath = resolveRepoRoot(options.repo);
  const warnings = getUntrackedWarnings(repoPath);
  let mode: GitSessionMode = "worktree";
  let title = "Working tree";
  let diffArgs = ["diff", "--patch", "--find-renames", "--binary", ...pathArgs(options.paths)];

  if (options.staged) {
    mode = "staged";
    title = "Staged changes";
    diffArgs = ["diff", "--cached", "--patch", "--find-renames", "--binary", ...pathArgs(options.paths)];
  } else if (options.range) {
    mode = "range";
    title = options.range;
    diffArgs = ["diff", "--patch", "--find-renames", "--binary", options.range, ...pathArgs(options.paths)];
  } else if (options.mergeBase) {
    mode = "merge-base";
    const base = runGit(repoPath, ["merge-base", "HEAD", options.mergeBase]).stdout.trim();
    title = `Merge base ${options.mergeBase}`;
    diffArgs = ["diff", "--patch", "--find-renames", "--binary", base, "HEAD", ...pathArgs(options.paths)];
  }

  const patch = runGit(repoPath, diffArgs).stdout;
  return createPatchSession({
    git: getGitMetadata(repoPath),
    mode,
    patch,
    title,
    warnings
  });
}

export async function createMergeSession(repo?: string) {
  const repoPath = resolveRepoRoot(repo);
  const paths = maybeGit(repoPath, ["diff", "--name-only", "--diff-filter=U"])
    ?.split("\n")
    .map(normalizeRelativePath)
    .filter(Boolean) ?? [];

  const files: GitSessionFile[] = paths.map((path) => ({
    additions: 0,
    capabilities: getCapabilitiesForMode("conflicts"),
    conflict: true,
    deletions: 0,
    hunks: [],
    isBinary: false,
    path,
    patch: "",
    status: "conflicted"
  }));

  return createPatchSession({
    files,
    git: getGitMetadata(repoPath),
    mode: "conflicts",
    patch: "",
    title: "Merge conflicts",
    warnings: paths.length === 0 ? ["No unresolved merge conflicts found."] : []
  });
}

export async function createPatchSessionFromFile(input: { patchPath: string; repo?: string }) {
  let repoPath: string | undefined;
  try {
    repoPath = resolveRepoRoot(input.repo ?? process.cwd());
  } catch (error) {
    if (input.repo) throw error;
  }
  const patch =
    input.patchPath === "-"
      ? await new Promise<string>((resolvePromise, rejectPromise) => {
          let value = "";
          process.stdin.setEncoding("utf8");
          process.stdin.on("data", (chunk) => {
            value += chunk;
          });
          process.stdin.on("end", () => resolvePromise(value));
          process.stdin.on("error", rejectPromise);
        })
      : await readFile(resolve(input.patchPath), "utf8");

  const session = createPatchSession({
    git: repoPath ? getGitMetadata(repoPath) : undefined,
    mode: "patch",
    patch,
    title: input.patchPath === "-" ? "Imported patch" : input.patchPath,
    warnings: repoPath ? [] : ["No git repository found. Patch actions are disabled."]
  });

  if (repoPath) return session;

  return {
    ...session,
    files: session.files.map((file) => ({
      ...file,
      capabilities: [],
      hunks: file.hunks.map((hunk) => ({ ...hunk, capabilities: [] }))
    }))
  };
}

export async function createFilePairSession(leftPath: string, rightPath: string): Promise<DitherSession> {
  const [left, right] = await Promise.all([stat(resolve(leftPath)), stat(resolve(rightPath))]);
  const leftKind = left.isDirectory() ? "directory" : left.isFile() ? "file" : null;
  const rightKind = right.isDirectory() ? "directory" : right.isFile() ? "file" : null;

  if (!leftKind || !rightKind || leftKind !== rightKind) {
    throw new Error("Pick two files or two folders before comparing.");
  }

  return {
    createdAt: new Date().toISOString(),
    files: [],
    id: createSessionId(),
    leftPath: resolve(leftPath),
    mode: "file-pair",
    patch: "",
    rightPath: resolve(rightPath),
    schema: ditherSessionSchema,
    title: "File comparison",
    warnings: []
  };
}

function getActionPatch(request: GitActionRequest) {
  const file = request.session.files.find((candidate) => normalizeRelativePath(candidate.path) === normalizeRelativePath(request.filePath));
  if (!file) throw new Error("File is not part of this Dither session.");
  if (!file.capabilities.includes(request.action)) {
    throw new Error(`This session does not support ${request.action} for ${file.path}.`);
  }

  if (request.hunkIndex != null) {
    const hunk = file.hunks.find((candidate) => candidate.index === request.hunkIndex);
    if (!hunk) throw new Error("Hunk is not part of this Dither session.");
    if (!hunk.capabilities.includes(request.action)) {
      throw new Error(`This session does not support ${request.action} for that hunk.`);
    }
    return hunk.patch;
  }

  return file.patch;
}

function getActionArgs(action: GitActionKind) {
  if (action === "stage") return ["apply", "--cached"];
  if (action === "unstage") return ["apply", "--cached", "--reverse"];
  if (action === "discard") return ["apply", "--reverse"];
  return ["apply"];
}

export async function performGitAction(request: GitActionRequest) {
  const repoPath = request.session.git?.repoPath;
  if (!repoPath) throw new Error("Git action requires a repository-backed session.");
  const resolvedRepoPath = resolveRepoRoot(repoPath);
  if (resolvedRepoPath !== repoPath) throw new Error("Repository root has changed since this session was created.");

  const patch = getActionPatch(request);
  const args = getActionArgs(request.action);
  runGit(repoPath, [...args, "--check"], patch);
  runGit(repoPath, args, patch);

  if (request.session.mode === "staged") {
    return createDiffSession({ repo: repoPath, staged: true });
  }

  return createDiffSession({ repo: repoPath, worktree: true });
}

export function resolveSessionPath(path: string) {
  return isAbsolute(path) ? path : resolve(path);
}

export async function ensureParentDirectory(path: string) {
  await mkdir(dirname(path), { recursive: true });
}
