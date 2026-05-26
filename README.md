# Dither

Local-first file and directory diffing for the web and macOS.

## Commands

- `bun run dev:web` starts the browser app.
- `bun run dev` starts the Electron app.
- `bun run typecheck` runs TypeScript checks.
- `bun test` runs the pure unit tests with Bun.
- `bun run test` runs Vitest, including React component tests.
- `bun run test:e2e` runs the Playwright shell smoke.
- `bun run build:web` builds the web app.
- `bun run build:cli` builds the `dither` / `dt` CLI entrypoint.
- `bun run build:desktop` builds an unsigned macOS app into `release/mac-arm64/Dither.app`.

## CLI

`dither` and `dt` are aliases for the same app-first CLI. The CLI writes a local session file, opens Dither, and can print launch metadata for tools with `--json`.

```bash
dt diff --json
dt diff --staged
dt diff --range main...HEAD
dt diff --merge-base main --path src/App.tsx
dt merge
dt open --left old.txt --right new.txt
dt apply --patch changes.patch
```

Git sessions support worktree, staged, range, merge-base, imported patch, and unresolved-conflict inspection. Mutating actions are exposed in the desktop app and run through checked git patches before applying.

## Prior Art

- [@pierre/diffs](https://diffs.com)
- [Kaleidoscope](https://kaleidoscope.app/)
- [Hunk](https://github.com/modem-dev/hunk)
