/**
 * The pixel size a WebP file declares, read from its first chunk: `VP8 ` (lossy), `VP8L`
 * (lossless) or `VP8X` (extended). Throws on anything that is not a WebP file.
 */
export function webpSize(buffer: Buffer): { width: number; height: number } {
  if (buffer.subarray(0, 4).toString('latin1') !== 'RIFF' || buffer.subarray(8, 12).toString('latin1') !== 'WEBP') {
    throw new Error('not a WebP file');
  }
  const chunk = buffer.subarray(12, 16).toString('latin1');
  if (chunk === 'VP8 ') {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    return { width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1 };
  }
  throw new Error(`unknown WebP chunk ${chunk}`);
}
