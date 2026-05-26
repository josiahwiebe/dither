const allowedControlBytes = new Set([7, 8, 9, 10, 12, 13, 27]);

/** Detects obvious binary content from a bounded byte sample. */
export function isProbablyBinary(bytes: Uint8Array) {
  const sample = bytes.subarray(0, Math.min(bytes.byteLength, 8192));
  if (sample.includes(0)) return true;

  let suspicious = 0;
  for (const byte of sample) {
    if (byte < 32 && !allowedControlBytes.has(byte)) suspicious += 1;
  }

  return sample.byteLength > 0 && suspicious / sample.byteLength > 0.08;
}

export function decodeUtf8(bytes: Uint8Array) {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}
