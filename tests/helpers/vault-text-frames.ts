import {
  VAULT_TEXT_FRAME_ERROR,
  VAULT_TEXT_FRAME_TEXT,
  type NativeVaultTextRead,
} from '@/shared/lib/vault-folder/vault-text-frames';

/** What a bridge stand-in answers for `read_vault_text_files`: the framing `read.rs` writes. */
export function encodeVaultTextFrames(reads: readonly NativeVaultTextRead[]): ArrayBuffer {
  const utf8 = new TextEncoder();
  const parts: Uint8Array[] = [];
  const pushLength = (length: number) => {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, length, true);
    parts.push(bytes);
  };
  const pushText = (text: string) => {
    const bytes = utf8.encode(text);
    pushLength(bytes.length);
    parts.push(bytes);
  };

  pushLength(reads.length);
  for (const read of reads) {
    const isText = read.text !== null && read.lastModified !== null;
    parts.push(Uint8Array.of(isText ? VAULT_TEXT_FRAME_TEXT : VAULT_TEXT_FRAME_ERROR));
    pushText(read.relativePath);
    if (isText) {
      const mtime = new Uint8Array(8);
      new DataView(mtime.buffer).setFloat64(0, read.lastModified ?? 0, true);
      parts.push(mtime);
      pushText(read.text ?? '');
    } else {
      pushText(read.error ?? '');
    }
  }

  const frames = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    frames.set(part, offset);
    offset += part.length;
  }
  return frames.buffer;
}
