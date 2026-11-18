import { vaultDocsVersion } from '../vault/documents.mjs';

/** Compile options that shape the artifact; anything else is ignored by the key. */
const VIEW_KEYS = ['includeIndexes', 'summary', 'nodesLimit', 'nodesOffset', 'edgesLimit', 'edgesOffset'];

/**
 * Views kept per version: the graph queries' artifact, `compile_ontology`'s summary,
 * and a page or two. Each extra view is a full compile, so the cap bounds memory.
 */
const MAX_VIEWS = 4;

function viewOf(options) {
  const view = { includeIndexes: options.includeIndexes === true };
  for (const key of VIEW_KEYS.slice(1)) {
    if (options[key] !== undefined) view[key] = options[key];
  }
  return view;
}

/**
 * Compiled artifacts, reused while the vault's stamp set is unchanged.
 *
 * The key is the version {@link vaultDocsVersion} attaches to each array the vault
 * document cache returns: equal versions mean no file was added, removed or changed,
 * so an artifact compiled from one array holds for the other. A hit costs the stamp
 * pass inside `loadDocs` and a `Map` lookup by the view's JSON, not a hash of every
 * byte. Up to {@link MAX_VIEWS} views live per version in insertion (recency) order;
 * a new version drops them all. An array that did not come from that cache (a
 * caller-built list) has no version and is compiled on every call, so it can never be
 * served a stale artifact.
 */
export function createCompiledOntologyCache({ loadDocs, compile, versionOf = vaultDocsVersion }) {
  let cachedVersion;
  const views = new Map();
  let hits = 0;
  let misses = 0;

  function get(options = {}) {
    return getWithDocs(options).artifact;
  }

  // The docs are returned with the artifact so read-only callers share one stamp
  // pass within a request.
  function getWithDocs(options = {}) {
    const docs = options.docs ?? loadDocs();
    const version = versionOf(docs);
    const view = viewOf(options);
    const key = JSON.stringify(view);
    if (version !== undefined && version === cachedVersion && views.has(key)) {
      const artifact = views.get(key);
      views.delete(key);
      views.set(key, artifact);
      hits += 1;
      return { artifact, docs };
    }
    misses += 1;
    const artifact = compile(docs, view);
    if (version === undefined) return { artifact, docs };
    if (version !== cachedVersion) {
      views.clear();
      cachedVersion = version;
    }
    views.set(key, artifact);
    while (views.size > MAX_VIEWS) views.delete(views.keys().next().value);
    return { artifact, docs };
  }

  function clear() {
    views.clear();
    cachedVersion = undefined;
  }

  function stats() {
    return { hits, misses, cached: views.size > 0 };
  }

  return { clear, get, getWithDocs, stats };
}
