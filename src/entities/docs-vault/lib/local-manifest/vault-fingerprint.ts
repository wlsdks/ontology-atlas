/** The multiset hash of `path@mtime` stamps that tells whether a vault changed, kept without sorting. */

export interface FingerprintSum {
  count: number;
  a: number;
  b: number;
}

/** Murmur3's finalizer: spreads every input bit over the word. */
function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export function addStamp(sum: FingerprintSum, relativePath: string, lastModified: number, sign: 1 | -1): void {
  // NFC here too, or native NFD names would report a change on every focus.
  const stamp = `${relativePath.normalize('NFC')}@${lastModified}`;
  let a = 0x811c9dc5;
  let b = 0x9747b28c;
  for (let at = 0; at < stamp.length; at += 1) {
    const code = stamp.charCodeAt(at);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b ^ code, 0x5bd1e995);
    b ^= b >>> 15;
  }
  sum.count += sign;
  sum.a = (sum.a + sign * fmix32(a)) >>> 0;
  sum.b = (sum.b + sign * fmix32(b ^ stamp.length)) >>> 0;
}

export function fingerprintText(sum: FingerprintSum): string {
  return sum.count === 0 ? '' : `${sum.count}.${sum.a.toString(16)}.${sum.b.toString(16)}`;
}

export function parseFingerprint(text: string): FingerprintSum | null {
  if (text === '') return { count: 0, a: 0, b: 0 };
  const [count, a, b] = text.split('.');
  const sum = { count: Number(count), a: parseInt(a, 16), b: parseInt(b, 16) };
  return Number.isInteger(sum.count) && Number.isInteger(sum.a) && Number.isInteger(sum.b) ? sum : null;
}

/**
 * Order-free, so neither a build nor a path delta sorts 50,000 stamps: a delta adds and removes
 * only the stamps it touched. Two different stamp sets collide with probability about 2^-64,
 * and the next change or focus check repairs a collision.
 */
export function fingerprintFromEntries(
  entries: ReadonlyArray<{ relativePath: string; lastModified: number }>,
): string {
  const sum: FingerprintSum = { count: 0, a: 0, b: 0 };
  for (const entry of entries) addStamp(sum, entry.relativePath, entry.lastModified, 1);
  return fingerprintText(sum);
}
