import { vaultDocsVersion } from '../vault/documents.mjs';

/** Compile options that shape the artifact; anything else is ignored by the key. */
const VIEW_KEYS = ['includeIndexes', 'summary', 'nodesLimit', 'nodesOffset', 'edgesLimit', 'edgesOffset'];

/**
 * Views kept per version: the graph queries' artifact, `compile_ontology`'s summary,
 * and a page or two. Each extra view is a full compile, so the cap bounds memory.
 */
const MAX_VIEWS = 4;

/**
 * Below this many documents a compile's garbage is a few megabytes and the
 * collector's own schedule is soon enough.
 */
const COLLECT_AFTER_DOCS = 2000;

/**
 * A compile of 50,000 files allocates about 450 MB that is garbage once the
 * artifact exists. Bun leaves it resident until its next full collection, so the
 * server kept about 1 GB after the first compile; one synchronous collection
 * (about 30 ms at that size, beside a 500 ms compile) returns it. Only a miss
 * pays it. Node has no collector hook without a flag; its own collection runs.
 */
function collectAfterCompile() {
  globalThis.Bun?.gc(true);
}

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
export function createCompiledOntologyCache({
  loadDocs,
  compile,
  versionOf = vaultDocsVersion,
  collectGarbage = collectAfterCompile,
}) {
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
    if (docs.length >= COLLECT_AFTER_DOCS) collectGarbage();
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
