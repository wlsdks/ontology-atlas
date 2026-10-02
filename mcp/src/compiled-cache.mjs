import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

const SIGNATURE_CHUNK_CODE_UNITS = 32 * 1024;

/** Cached artifacts remain valid only while current document signatures match. */
export function createCompiledOntologyCache({ loadDocs, compile }) {
  let cached = null;
  let hits = 0;
  let misses = 0;

  function get(options = {}) {
    return getWithDocs(options).artifact;
  }

  // Current bytes are loaded even on a hit, so read-only callers can share them
  // within one request.
  function getWithDocs(options = {}) {
    const docs = options.docs ?? loadDocs();
    const signature = docsSignature(docs);
    const includeIndexes = options.includeIndexes === true;
    if (
      cached &&
      cached.signature === signature &&
      cached.includeIndexes === includeIndexes
    ) {
      hits += 1;
      return { artifact: cached.artifact, docs };
    }
    misses += 1;
    const artifact = compile(docs, { includeIndexes });
    cached = {
      artifact,
      includeIndexes,
      signature,
    };
    return { artifact, docs };
  }

  function clear() {
    cached = null;
  }

  function stats() {
    return { hits, misses, cached: Boolean(cached) };
  }

  return { clear, get, getWithDocs, stats };
}

function docsSignature(docs) {
  const fields = docs.map((doc) => [doc.slug, String(doc.mtime ?? ''), doc.raw ?? '']);
  fields.sort((left, right) => {
    for (let i = 0; i < left.length; i += 1) {
      if (left[i] < right[i]) return -1;
      if (left[i] > right[i]) return 1;
    }
    return 0;
  });
  const digest = createHash('sha256');
  const length = Buffer.allocUnsafe(4);
  for (const row of fields) {
    for (const value of row) {
      length.writeUInt32LE(value.length);
      digest.update(length);
      if (typeof value !== 'string' || value.length <= SIGNATURE_CHUNK_CODE_UNITS) {
        digest.update(value, 'utf16le');
        continue;
      }
      // O(value.length) hashing with at most 64 KiB of string encoding per update.
      for (let offset = 0; offset < value.length; offset += SIGNATURE_CHUNK_CODE_UNITS) {
        digest.update(value.slice(offset, offset + SIGNATURE_CHUNK_CODE_UNITS), 'utf16le');
      }
    }
  }
  return digest.digest('hex');
}
