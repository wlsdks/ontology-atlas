const IMAGE_EXTENSIONS = /\.(?:png|jpe?g|webp|avif)$/i;

export function resolvePlanningImage(document: string, target: string): string | null {
  const documentParts = document.split('/');
  if (
    !document.toLowerCase().endsWith('.md') ||
    documentParts.some((part) => !part || part === '.' || part === '..' || /[\\\0:]/.test(part))
  ) return null;

  const reference = target.split('#', 1)[0];
  if (!reference || reference.includes('?')) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(reference);
  } catch {
    return null;
  }
  if (decoded.startsWith('/') || /[\\\0:]/.test(decoded) || /%[0-9a-f]{2}/i.test(decoded)) return null;

  const parts = documentParts.slice(0, -1);
  for (const part of decoded.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  const path = parts.join('/');
  return IMAGE_EXTENSIONS.test(path) ? path : null;
}

export function imageMimeType(path: string, bytes: Uint8Array): string | null {
  const matches = (offset: number, signature: readonly number[]) =>
    signature.every((byte, index) => bytes[offset + index] === byte);
  if (/\.png$/i.test(path) && matches(0, [137, 80, 78, 71, 13, 10, 26, 10])) return 'image/png';
  if (/\.jpe?g$/i.test(path) && matches(0, [255, 216, 255])) return 'image/jpeg';
  if (/\.webp$/i.test(path) && matches(0, [82, 73, 70, 70]) && matches(8, [87, 69, 66, 80])) return 'image/webp';
  if (
    /\.avif$/i.test(path) && matches(4, [102, 116, 121, 112]) &&
    (matches(8, [97, 118, 105, 102]) || matches(8, [97, 118, 105, 115]))
  ) return 'image/avif';
  return null;
}

export function planningImageInfo(path: string, bytes: Uint8Array): { mime: string; pixels: number } | null {
  if (bytes.length > 16 * 1024 * 1024) return null;
  const mime = imageMimeType(path, bytes);
  const bounded = (width: number, height: number) => width > 0 && height > 0 && width <= 8192 && height <= 8192 && width * height <= 16_777_216;
  const be32 = (offset: number) => ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]);
  if (mime === 'image/png') {
    if (bytes.length < 33 || be32(8) !== 13 || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR' || !bounded(be32(16), be32(20))) return null;
    // Animation frame work is not bounded.
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = be32(offset);
      if (!Number.isSafeInteger(length) || length < 0 || offset + 12 + length > bytes.length) return null;
      const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
      if (type === 'acTL') return null;
      if (type === 'IDAT' || type === 'IEND') break;
      offset += 12 + length;
    }
    return { mime, pixels: be32(16) * be32(20) };
  }
  if (mime === 'image/jpeg') {
    let offset = 2;
    while (offset + 4 <= bytes.length && bytes[offset] === 255) {
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) return null;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const length = (bytes[offset] << 8) | bytes[offset + 1];
      if (length < 2 || offset + length > bytes.length) return null;
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        if (length < 8) return null;
        const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
        const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
        return bounded(width, height) ? { mime, pixels: width * height } : null;
      }
      offset += length;
    }
  }
  return null;
}

export function boundedPlanningImage(path: string, bytes: Uint8Array): string | null {
  return planningImageInfo(path, bytes)?.mime ?? null;
}
