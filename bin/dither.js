#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const builtCli = resolve(root, "out/cli/dither.js");

if (existsSync(builtCli)) {
  await import(pathToFileURL(builtCli).href);
} else {
  const sourceCli = resolve(root, "src/cli/main.ts");
  const result = spawnSync("bun", ["run", sourceCli, ...process.argv.slice(2)], {
    env: process.env,
    stdio: "inherit"
  });

  process.exit(result.status ?? 1);
}
