#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

import {
  createDiffSession,
  createFilePairSession,
  createLaunchResult,
  createMergeSession,
  createPatchSessionFromFile,
  readSessionFile,
  resolveSessionPath,
  type DiffSessionOptions,
  type LaunchResult
} from "../node/gitWorkbench";

interface ParsedCommand {
  command: string;
  values: Record<string, boolean | string | string[] | undefined>;
}

const help = `Dither git workbench

Usage:
  dt diff [--repo <path>] [--worktree] [--staged] [--range <rev>] [--merge-base <rev>] [--path <path>...] [--json]
  dt merge [--repo <path>] [--json]
  dt open --left <path> --right <path> [--json]
  dt open --session <path> [--json]
  dt apply --patch <path|-> [--repo <path>] [--json]
`;

function parseCommand(argv: string[]): ParsedCommand {
  const [command = "help", ...rest] = argv;
  const parsed = parseArgs({
    allowPositionals: true,
    args: rest,
    options: {
      help: { short: "h", type: "boolean" },
      json: { type: "boolean" },
      left: { type: "string" },
      "merge-base": { type: "string" },
      patch: { type: "string" },
      path: { multiple: true, type: "string" },
      range: { type: "string" },
      repo: { type: "string" },
      right: { type: "string" },
      session: { type: "string" },
      staged: { type: "boolean" },
      worktree: { type: "boolean" }
    },
    strict: true
  });

  if (parsed.values.help) return { command: "help", values: parsed.values };
  return { command, values: parsed.values };
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function asStringArray(value: unknown) {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return typeof value === "string" ? [value] : undefined;
}

function assertSingleDiffMode(options: DiffSessionOptions) {
  const modes = [options.staged, Boolean(options.range), Boolean(options.mergeBase)].filter(Boolean);
  if (modes.length > 1) {
    throw new Error("Choose only one diff mode: --staged, --range, or --merge-base.");
  }
}

function maybeOpen(url: string) {
  if (process.env.DITHER_CLI_NO_OPEN === "1") return;

  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args =
    process.platform === "darwin"
      ? [url]
      : process.platform === "win32"
        ? ["/c", "start", "", url]
        : [url];

  spawnSync(command, args, { stdio: "ignore" });
}

function printResult(result: LaunchResult, json: boolean) {
  maybeOpen(result.openUrl);

  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  process.stdout.write(`Opened Dither session ${result.sessionId}\n${result.openUrl}\n`);
  for (const warning of result.warnings) {
    process.stderr.write(`Warning: ${warning}\n`);
  }
}

async function run() {
  const { command, values } = parseCommand(process.argv.slice(2));
  const json = values.json === true;

  if (command === "help") {
    process.stdout.write(help);
    return;
  }

  if (command === "diff") {
    const options: DiffSessionOptions = {
      mergeBase: asString(values["merge-base"]),
      paths: asStringArray(values.path),
      range: asString(values.range),
      repo: asString(values.repo),
      staged: values.staged === true,
      worktree: values.worktree === true
    };
    assertSingleDiffMode(options);
    printResult(await createLaunchResult(await createDiffSession(options)), json);
    return;
  }

  if (command === "merge") {
    printResult(await createLaunchResult(await createMergeSession(asString(values.repo))), json);
    return;
  }

  if (command === "open") {
    const sessionPath = asString(values.session);
    if (sessionPath) {
      const resolvedSessionPath = resolveSessionPath(sessionPath);
      printResult(await createLaunchResult(await readSessionFile(resolvedSessionPath), resolvedSessionPath), json);
      return;
    }

    const left = asString(values.left);
    const right = asString(values.right);
    if (!left || !right) throw new Error("dt open requires either --session or both --left and --right.");
    printResult(await createLaunchResult(await createFilePairSession(left, right)), json);
    return;
  }

  if (command === "apply") {
    const patchPath = asString(values.patch);
    if (!patchPath) throw new Error("dt apply requires --patch <path|->.");
    printResult(await createLaunchResult(await createPatchSessionFromFile({ patchPath, repo: asString(values.repo) })), json);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

run().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Dither CLI failed."}\n`);
  process.exitCode = 1;
});
