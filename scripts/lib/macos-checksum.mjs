export function parseSha256Checksum(content, { expectedFilename } = {}) {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length !== 1) {
    throw new Error(`checksum file must contain exactly one non-empty line, got ${lines.length}`);
  }

  const match = /^([a-fA-F0-9]{64})\s+(\*?)(.+)$/.exec(lines[0]);
  if (!match) {
    throw new Error("checksum file must use '<64 hex sha256>  <filename>' format");
  }

  const checksum = match[1].toLowerCase();
  const filename = match[3].trim();
  if (!filename) {
    throw new Error("checksum file must name the DMG file");
  }
  if (expectedFilename && filename !== expectedFilename) {
    throw new Error(`checksum file names ${filename}, expected ${expectedFilename}`);
  }

  return { checksum, filename };
}
