import { inflateRaw } from './inflate-raw';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
/** Bytes one read unpacks across a zip's entries, each entry once; as in `mcp/src/library/source-zip.mjs`. */
const SOURCE_UNPACK_MAX_BYTES = 64 * 1024 * 1024;

const utf8 = new TextDecoder('utf-8');

let crcTable: Uint32Array | null = null;

/**
 * CRC-32 of a decompressed entry checked against the zip's stored value: the passage is shown as the
 * document's own words, so a damaged entry is refused, never quoted.
 */
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      crcTable[index] = value >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = crcTable[(crc ^ bytes[index]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** The MCP module's walk: end-of-central-directory, central directory, local header, inflate. */
export function readZipEntries(bytes: Uint8Array): Map<string, () => Uint8Array> {
  if (bytes.length < 22) throw new Error('not a zip file: too short');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  const floor = Math.max(0, bytes.length - 22 - 0xffff);
  for (let index = bytes.length - 22; index >= floor; index -= 1) {
    if (view.getUint32(index, true) === EOCD_SIGNATURE) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip file: no end-of-central-directory record');
  const entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  let unpackBudget = SOURCE_UNPACK_MAX_BYTES;
  let compressedBudget = bytes.length;
  const entries = new Map<string, () => Uint8Array>();
  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      throw new Error('zip central directory is damaged');
    }
    const method = view.getUint16(offset + 10, true);
    const declaredCrc = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = utf8.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    const unpack = (): Uint8Array => {
      if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) {
        throw new Error(`zip entry ${name} is damaged`);
      }
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const raw = bytes.subarray(start, start + compressedSize);
      if (raw.length > compressedBudget) {
        throw new Error(
          `zip entry ${name} would take this read past the file's ${bytes.length} bytes: its data overlaps an entry already read`,
        );
      }
      compressedBudget -= raw.length;
      const verified = (out: Uint8Array): Uint8Array => {
        if (uncompressedSize !== 0xffffffff && out.length !== uncompressedSize) {
          throw new Error(
            `zip entry ${name} inflated to ${out.length} bytes, expected ${uncompressedSize}`,
          );
        }
        // A zip with no CRC recorded (a streamed entry) cannot be checked; one that
        // records a CRC is checked, and a mismatch is refused rather than quoted.
        if (declaredCrc !== 0 && crc32(out) !== declaredCrc) {
          throw new Error(`zip entry ${name} failed its CRC-32 check; its text is not trustworthy`);
        }
        return out;
      };
      if (method === 0) return verified(raw.slice());
      if (method === 8) {
        if (uncompressedSize !== 0xffffffff && uncompressedSize > unpackBudget) {
          throw new Error(`zip entry ${name} declares ${uncompressedSize} bytes, more than one read unpacks`);
        }
        return verified(
          inflateRaw(raw, uncompressedSize === 0xffffffff ? undefined : uncompressedSize),
        );
      }
      throw new Error(`zip entry ${name} uses compression method ${method}, which is not supported`);
    };
    let unpacked: Uint8Array | undefined;
    entries.set(name, () => {
      unpacked ??= unpack();
      if (unpacked.length > unpackBudget) {
        throw new Error(
          `zip entry ${name} would take this read past ${SOURCE_UNPACK_MAX_BYTES} unpacked bytes, the most one read unpacks`,
        );
      }
      unpackBudget -= unpacked.length;
      return unpacked;
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
