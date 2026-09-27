/**
 * In-process compiled graph cache for one MCP session's repeated query_ontology
 * calls. The vault stays the truth: the artifact is reused only while the docs
 * keep the same slug, mtime and content signature.
 */
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
    const docs = loadDocs();
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
  return docs
    .map((doc) => `${doc.slug}\0${doc.mtime ?? ''}\0${hashString(doc.raw ?? '')}`)
    .sort()
    .join('\0');
}

function hashString(value) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return hash >>> 0;
}
