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
- `bun run build:desktop` builds an unsigned macOS app into `release/mac-arm64/Dither.app`.

## Prior Art

- [@pierre/diffs](https://diffs.com)
- [Kaleidoscope](https://kaleidoscope.app/)
- [Hunk](https://github.com/modem-dev/hunk)
