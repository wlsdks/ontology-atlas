/**
 * Tiny in-process compiled graph cache for MCP read sessions.
 *
 * Claude Code / Codex often call query_ontology several times in one run order
 * (workspace_brief -> health -> node_profile -> path). The vault is still the
 * source of truth; this cache only reuses the compiled artifact while the loaded
 * docs have the same slug/mtime/content signature.
 */
export function createCompiledOntologyCache({ loadDocs, compile }) {
  let cached = null;
  let hits = 0;
  let misses = 0;

  function get(options = {}) {
    return getWithDocs(options).artifact;
  }

  // Always load current bytes, including on a cache hit. Read-only callers can
  // share these documents through one request without walking the vault again.
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
