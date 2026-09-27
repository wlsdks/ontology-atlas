import { deflateRawSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { inflateRaw } from './inflate-raw';

const zeros = (size: number) => new Uint8Array(deflateRawSync(Buffer.alloc(size)));

describe('inflating a zip entry', () => {
  it('stops at the size the entry declares instead of following a bomb', () => {
    expect(() => inflateRaw(zeros(1 << 20), 1_000)).toThrow(/past 1000 bytes/);
  });

  it('stops an entry that declares no size at the absolute cap', () => {
    expect(() => inflateRaw(zeros(1 << 20), undefined, 64 * 1024)).toThrow(/past 65536 bytes/);
  });

  it('inflates an entry exactly as large as it declares', () => {
    expect(inflateRaw(zeros(4096), 4096)).toHaveLength(4096);
  });
});
