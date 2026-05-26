import { describe, expect, it } from "vitest";

import { decodeUtf8, isProbablyBinary } from "../../src/lib/binary";

describe("binary helpers", () => {
  it("detects text bytes", () => {
    expect(isProbablyBinary(new TextEncoder().encode("hello\nworld"))).toBe(false);
  });

  it("detects null-byte binary data", () => {
    expect(isProbablyBinary(new Uint8Array([80, 78, 0, 71]))).toBe(true);
  });

  it("decodes utf-8 content", () => {
    expect(decodeUtf8(new TextEncoder().encode("diff"))).toBe("diff");
  });
});
