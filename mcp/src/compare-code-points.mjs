/**
 * Orders two strings by code point, which is the order of their UTF-8 bytes. A plain `<`
 * compares UTF-16 code units, which puts a character outside the basic plane (a
 * surrogate pair) before U+E000 to U+FFFF; this puts it after, as bytes do.
 */
export function compareCodePoints(left, right) {
  if (left === right) return 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left.charCodeAt(index);
    const b = right.charCodeAt(index);
    if (a === b) continue;
    const aSurrogate = a >= 0xd800 && a <= 0xdfff;
    const bSurrogate = b >= 0xd800 && b <= 0xdfff;
    if (aSurrogate !== bSurrogate) return aSurrogate ? 1 : -1;
    return a - b;
  }
  return left.length - right.length;
}
