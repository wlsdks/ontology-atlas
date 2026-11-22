import { describe, expect, it } from 'vitest';

import { zipFile } from '../../../../tests/fixtures/source-passage-cases.mjs';
import { readZipEntries } from './source-zip';

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('readZipEntries', () => {
  it('unpacks a stored entry and an inflated entry by name, each on demand', () => {
    const entries = readZipEntries(
      zipFile([
        { name: 'a.txt', text: 'stored text', store: true },
        { name: 'dir/b.txt', text: 'inflated text '.repeat(20) },
      ]),
    );
    expect([...entries.keys()]).toEqual(['a.txt', 'dir/b.txt']);
    expect(decode(entries.get('a.txt')!())).toBe('stored text');
    expect(decode(entries.get('dir/b.txt')!())).toBe('inflated text '.repeat(20));
  });

  it('refuses an entry whose bytes no longer match the CRC-32 the zip recorded', () => {
    const bytes = zipFile([{ name: 'a.txt', text: 'quoted exactly', store: true }]);
    const at = decode(bytes).indexOf('quoted exactly');
    bytes[at] = bytes[at]! ^ 0xff;
    const entries = readZipEntries(bytes);
    expect(() => entries.get('a.txt')!()).toThrow(/failed its CRC-32 check/);
  });

  it('refuses input that is not a zip before reading any entry', () => {
    expect(() => readZipEntries(new Uint8Array(10))).toThrow('not a zip file: too short');
    expect(() => readZipEntries(new Uint8Array(64))).toThrow('no end-of-central-directory record');
  });

  it('refuses a compression method it cannot inflate instead of guessing', () => {
    const bytes = zipFile([{ name: 'a.txt', text: 'text', store: true }]);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const centralStart = bytes.length - 22 - (46 + 'a.txt'.length);
    view.setUint16(centralStart + 10, 9, true);
    expect(() => readZipEntries(bytes).get('a.txt')!()).toThrow('uses compression method 9');
  });
});
