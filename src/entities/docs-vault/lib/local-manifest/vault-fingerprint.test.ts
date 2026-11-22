import { describe, expect, it } from 'vitest';
import {
  addStamp,
  fingerprintFromEntries,
  fingerprintText,
  parseFingerprint,
  type FingerprintSum,
} from './vault-fingerprint';

const stamps = [
  { relativePath: 'a.md', lastModified: 1 },
  { relativePath: 'notes/b.md', lastModified: 2 },
  { relativePath: 'notes/c.md', lastModified: 3 },
];

describe('fingerprint of stamps', () => {
  it('does not depend on the order the stamps are added in', () => {
    expect(fingerprintFromEntries([...stamps].reverse())).toBe(fingerprintFromEntries(stamps));
  });

  it('changes when a file path or a modified time changes', () => {
    const base = fingerprintFromEntries(stamps);
    expect(fingerprintFromEntries([{ ...stamps[0], lastModified: 9 }, ...stamps.slice(1)])).not.toBe(base);
    expect(fingerprintFromEntries([{ ...stamps[0], relativePath: 'z.md' }, ...stamps.slice(1)])).not.toBe(base);
  });

  it('returns to the earlier sum when a stamp is removed after it was added', () => {
    const sum: FingerprintSum = { count: 0, a: 0, b: 0 };
    for (const stamp of stamps) addStamp(sum, stamp.relativePath, stamp.lastModified, 1);
    const withThree = fingerprintText(sum);
    addStamp(sum, 'extra.md', 7, 1);
    expect(fingerprintText(sum)).not.toBe(withThree);
    addStamp(sum, 'extra.md', 7, -1);
    expect(fingerprintText(sum)).toBe(withThree);
  });

  it('reads a native decomposed name and its precomposed form as the same file', () => {
    expect(fingerprintFromEntries([{ relativePath: '한글.md'.normalize('NFD'), lastModified: 1 }])).toBe(
      fingerprintFromEntries([{ relativePath: '한글.md'.normalize('NFC'), lastModified: 1 }]),
    );
  });

  it('is the empty text for no files', () => {
    expect(fingerprintFromEntries([])).toBe('');
  });
});

describe('parseFingerprint', () => {
  it('round-trips the text of a sum', () => {
    const text = fingerprintFromEntries(stamps);
    const sum = parseFingerprint(text);
    expect(sum).not.toBeNull();
    expect(fingerprintText(sum!)).toBe(text);
  });

  it('reads the empty text as the sum of no files', () => {
    expect(parseFingerprint('')).toEqual({ count: 0, a: 0, b: 0 });
  });

  it('refuses text that is not three numbers', () => {
    expect(parseFingerprint('not-a-fingerprint')).toBeNull();
    expect(parseFingerprint('3.zz')).toBeNull();
  });
});
