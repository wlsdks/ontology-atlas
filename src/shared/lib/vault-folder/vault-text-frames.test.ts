import { describe, expect, it } from 'vitest';
import fixture from '../../../../tests/fixtures/vault-text-frames.json';
import { encodeVaultTextFrames } from '../../../../tests/helpers/vault-text-frames';
import { decodeVaultTextFrames, type NativeVaultTextRead } from './vault-text-frames';

function framesFromHex(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes.buffer;
}

/** What the page held when the command answered JSON: the reads after a serialize and parse. */
function throughJson(reads: readonly NativeVaultTextRead[]): NativeVaultTextRead[] {
  return JSON.parse(JSON.stringify(reads)) as NativeVaultTextRead[];
}

const fixtureFrames = () => framesFromHex(fixture.framesHex);

describe('decodeVaultTextFrames', () => {
  it('decodes the bytes read.rs writes into what the JSON answer parsed to', () => {
    const decoded = decodeVaultTextFrames(fixtureFrames());

    expect(decoded).toStrictEqual(throughJson(fixture.reads));
    expect(decoded.find((read) => read.relativePath === 'bom.md')?.text?.charCodeAt(0)).toBe(0xfeff);
  });

  it('decodes a batch of 256 files with a large multibyte one exactly as JSON did', () => {
    const large = '가나다 frontmatter 🧾\n'.repeat(150_000);
    const reads: NativeVaultTextRead[] = Array.from({ length: 256 }, (_, index) => ({
      relativePath: `notes/${index}.md`,
      text: index === 7 ? large : `# note ${index}`,
      lastModified: 1_763_600_000_000 + index,
      error: null,
    }));
    reads[200] = { relativePath: 'notes/200.md', text: null, lastModified: null, error: 'gone' };

    expect(decodeVaultTextFrames(encodeVaultTextFrames(reads))).toStrictEqual(throughJson(reads));
  });

  it('throws on every truncation and on bytes past the last frame', () => {
    const frames = new Uint8Array(fixtureFrames());
    for (let end = 0; end < frames.length; end += 1) {
      expect(() => decodeVaultTextFrames(frames.slice(0, end).buffer), `${end} bytes`).toThrow();
    }
    const padded = new Uint8Array(frames.length + 1);
    padded.set(frames);
    expect(() => decodeVaultTextFrames(padded.buffer)).toThrow(/follow the last/);
  });

  it('throws on a length past the buffer, an unknown kind or invalid UTF-8', () => {
    const hugeCount = new Uint8Array(fixtureFrames());
    new DataView(hugeCount.buffer).setUint32(0, 0xffff_ffff, true);
    expect(() => decodeVaultTextFrames(hugeCount.buffer)).toThrow(/short/);

    const hugePath = new Uint8Array(fixtureFrames());
    new DataView(hugePath.buffer).setUint32(5, 0xffff_ffff, true);
    expect(() => decodeVaultTextFrames(hugePath.buffer)).toThrow(/short/);

    const unknownKind = new Uint8Array(fixtureFrames());
    unknownKind[4] = 9;
    expect(() => decodeVaultTextFrames(unknownKind.buffer)).toThrow(/unknown kind 9/);

    const invalidText = new Uint8Array(
      encodeVaultTextFrames([{ relativePath: 'a.md', text: 'xy', lastModified: 1, error: null }]),
    );
    invalidText[invalidText.length - 1] = 0xff;
    expect(() => decodeVaultTextFrames(invalidText.buffer)).toThrow();
  });
});
