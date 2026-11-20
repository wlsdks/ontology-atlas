export interface NativeVaultTextRead {
  relativePath: string;
  text: string | null;
  lastModified: number | null;
  error: string | null;
}

export const VAULT_TEXT_FRAME_TEXT = 0;
export const VAULT_TEXT_FRAME_ERROR = 1;
const LENGTH_BYTES = 4;
const MTIME_BYTES = 8;

/** `ignoreBOM` keeps a leading U+FEFF in the text, as the JSON answer did. */
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/**
 * Decodes `read_vault_text_files`' little-endian framing in one O(bytes) pass: a `u32` count, then
 * per read a kind byte and a `u32`-length-prefixed path, then an `f64` mtime and the text, or the
 * error. Every length is checked against the bytes left before it is used.
 */
export function decodeVaultTextFrames(frames: ArrayBuffer): NativeVaultTextRead[] {
  const bytes = new Uint8Array(frames);
  const view = new DataView(frames);
  let offset = 0;

  const claim = (length: number): number => {
    if (length > bytes.length - offset) {
      throw new Error(`vault text frames end ${length - (bytes.length - offset)} bytes short at ${offset}`);
    }
    const start = offset;
    offset += length;
    return start;
  };
  const readLength = (): number => view.getUint32(claim(LENGTH_BYTES), true);
  const readText = (): string => {
    const length = readLength();
    const start = claim(length);
    return utf8.decode(bytes.subarray(start, start + length));
  };

  const count = readLength();
  const reads: NativeVaultTextRead[] = [];
  for (let index = 0; index < count; index += 1) {
    const kind = bytes[claim(1)];
    const relativePath = readText();
    if (kind === VAULT_TEXT_FRAME_TEXT) {
      const lastModified = view.getFloat64(claim(MTIME_BYTES), true);
      reads.push({ relativePath, text: readText(), lastModified, error: null });
    } else if (kind === VAULT_TEXT_FRAME_ERROR) {
      reads.push({ relativePath, text: null, lastModified: null, error: readText() });
    } else {
      throw new Error(`vault text frames hold an unknown kind ${kind} at ${offset - 1}`);
    }
  }
  if (offset !== bytes.length) {
    throw new Error(`${bytes.length - offset} bytes follow the last vault text frame`);
  }
  return reads;
}
