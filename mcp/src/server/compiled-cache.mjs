import { vaultDocsVersion } from '../vault/documents/document-cache.mjs';

/** Compile options that shape the artifact; anything else is ignored by the key. */
const VIEW_KEYS = ['includeIndexes', 'summary', 'nodesLimit', 'nodesOffset', 'edgesLimit', 'edgesOffset'];

/**
 * Views kept per version: the graph queries' artifact, `compile_ontology`'s summary,
 * and a page or two. Each extra view is a full compile, so the cap bounds memory.
 */
const MAX_VIEWS = 4;

/**
 * A compile's garbage follows its node count. Measured under Bun 1.4.4, a compile
 * of 1,000 / 10,000 / 50,000 nodes leaves 11 / 96 / 435 MB that one full collection
 * returns in 1.5 / 7 / 31 ms, so below 5,000 nodes the collector's own schedule is
 * soon enough.
 */
const COLLECT_AFTER_NODES = 5000;

/**
 * Bun leaves a large compile's garbage in the physical footprint until its next
 * full collection; one synchronous collection returns it. Only a miss on a graph
 * of {@link COLLECT_AFTER_NODES} or more pays it, before and after the compile. Node has no collector hook
 * without a flag; its own collection runs.
 */
function collectAfterCompile() {
  globalThis.Bun?.gc(true);
}

/** Whether `docs` hold `count` nodes (documents with a `kind`): O(F) at most, on a miss only. */
function nodeCountAtLeast(docs, count) {
  let nodes = 0;
  for (const doc of docs) {
    const kind = doc?.frontmatter?.kind;
    if (typeof kind === 'string' && kind.trim() !== '' && ++nodes >= count) return true;
  }
  return false;
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
    const large = nodeCountAtLeast(docs, COLLECT_AFTER_NODES);
    // Before as well: whatever earlier calls left uncollected would otherwise sit
    // under the compile's own peak (measured at 50,000 nodes: 395-487 MB peak
    // without it, 362-374 MB with it).
    if (large) collectGarbage();
    const artifact = compile(docs, view);
    if (large) collectGarbage();
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
