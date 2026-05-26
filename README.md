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

## Notes

- File contents stay local. The web app uses local file inputs; the desktop app uses a narrow Electron preload bridge.
- Text diffs render through `@pierre/diffs`; folder trees render through `@pierre/trees`.
- `.docx` files are compared by extracted WordprocessingML text. Legacy binary `.doc` files are not supported in v1.
- Desktop packaging intentionally skips code signing and notarization for v1.
