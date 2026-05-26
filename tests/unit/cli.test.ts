import { describe, expect, it } from "vitest";

import packageJson from "../../package.json";

describe("CLI package contract", () => {
  it("exposes dither and dt as aliases for the same entrypoint", () => {
    expect(packageJson.bin).toMatchObject({
      dither: "./bin/dither.js",
      dt: "./bin/dither.js"
    });
  });
});
