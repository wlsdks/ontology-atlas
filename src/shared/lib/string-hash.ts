/** Two 32-bit lanes (FNV-1a and a Murmur-style multiply) over UTF-16 units: O(n), 64 bits, base 36. */
export function stringHash(text: string): string {
  let fnv = 0x811c9dc5;
  let mix = 0x9747b28c;
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    fnv = Math.imul(fnv ^ unit, 0x01000193);
    mix = Math.imul(mix ^ unit, 0x5bd1e995);
    mix ^= mix >>> 15;
  }
  return `${(fnv >>> 0).toString(36)}.${(mix >>> 0).toString(36)}`;
}
