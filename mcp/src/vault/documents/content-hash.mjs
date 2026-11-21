import { hash } from 'node:crypto';

/**
 * The fingerprint the document cache compares instead of holding a file's text.
 * SHA-1 over the bytes: hardware-accelerated in Node and bun (54–78 ms for the
 * 117–180 MB of a 50,000-file vault on Apple silicon, against 224 ms for a 64-bit
 * JS hash), and no collision a same-stamp edit could stumble into.
 */
export function contentHash(bytes) {
  return hash('sha1', bytes, 'base64');
}

/** The same fingerprint for text already decoded: equal to {@link contentHash} of its UTF-8 bytes. */
export function textHash(text) {
  return hash('sha1', Buffer.from(String(text), 'utf8'), 'base64');
}
