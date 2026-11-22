import { inflateRawSync } from 'node:zlib';

/** Bytes one read may unpack across a zip's entries, each entry unpacked once. */
const SOURCE_UNPACK_MAX_BYTES = 64 * 1024 * 1024;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

/**
 * @param {Buffer} buffer
 * @returns {Map<string, () => Buffer>} every entry by name, decompressed on demand
 */
export function readZipEntries(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) throw new Error('not a zip file: too short');
  // The end-of-central-directory record sits at the tail, before a comment of up to 64 KiB.
  let eocd = -1;
  const floor = Math.max(0, buffer.length - 22 - 0xffff);
  for (let index = buffer.length - 22; index >= floor; index -= 1) {
    if (buffer.readUInt32LE(index) === EOCD_SIGNATURE) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip file: no end-of-central-directory record');
  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  let unpackBudget = SOURCE_UNPACK_MAX_BYTES;
  let compressedBudget = buffer.length;
  const entries = new Map();
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) throw new Error('zip central directory is damaged');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    const unpack = () => {
      if (buffer.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) throw new Error(`zip entry ${name} is damaged`);
      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const raw = buffer.subarray(start, start + compressedSize);
      if (raw.length > compressedBudget) {
        throw new Error(`zip entry ${name} would take this read past the file's ${buffer.length} bytes: its data overlaps an entry already read`);
      }
      compressedBudget -= raw.length;
      if (method === 0) return Buffer.from(raw);
      if (method === 8) {
        const limit = Math.max(1, Math.min(uncompressedSize === 0xffffffff ? Infinity : uncompressedSize, unpackBudget));
        let out;
        try {
          out = inflateRawSync(raw, { maxOutputLength: limit });
        } catch (error) {
          if (error?.code !== 'ERR_BUFFER_TOO_LARGE') throw error;
          throw new Error(`zip entry ${name} inflates past ${limit} bytes, more than it declares or than one read unpacks`);
        }
        if (uncompressedSize !== 0xffffffff && out.length !== uncompressedSize) {
          throw new Error(`zip entry ${name} inflated to ${out.length} bytes, expected ${uncompressedSize}`);
        }
        return out;
      }
      throw new Error(`zip entry ${name} uses compression method ${method}, which is not supported`);
    };
    let unpacked;
    entries.set(name, () => {
      unpacked ??= unpack();
      if (unpacked.length > unpackBudget) {
        throw new Error(`zip entry ${name} would take this read past ${SOURCE_UNPACK_MAX_BYTES} unpacked bytes, the most one read unpacks`);
      }
      unpackBudget -= unpacked.length;
      return unpacked;
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
