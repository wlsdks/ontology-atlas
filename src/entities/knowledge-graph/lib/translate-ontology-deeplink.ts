/**
 * Translates a `/ontology/?node=<id>` deep-link id (or any other raw vault
 * slug form — e.g. an agent heartbeat's `focus.ontologySlug`) into the `?p=`
 * value `/topology` already understands (B3 허브가 곧 지도 — `/ontology`
 * converges into a thin redirect to `/topology`).
 *
 * Ported from the retired `resolveOntologyDeeplinkNode`'s id-form
 * normalization (`src/views/ontology-view/lib/resolve-deeplink-node.ts`,
 * deleted with the rest of the tree page) — specifically the vault
 * plural-slash prefix mapping (`capabilities/foo` → `capability:foo`).
 * `/topology`'s own resolver (`resolveTopologySelectedOntologyNode`,
 * `src/views/home/lib/resolve-topology-selected-node.ts`) already handles
 * canonical `kind:slug` ids and bare slugs via its `endsWith(':'+tail)`
 * fallback — this function's only job is closing the ONE gap that resolver
 * doesn't cover: the plural vault-folder prefix form. Kept as a pure,
 * synchronous, no-node-list-needed function so callers can act immediately
 * without waiting on ontology data to load.
 *
 * Lives at the entity layer (not under a single view) because two views now
 * share it: `views/ontology-redirect` (deep-link redirect) and
 * `views/home` (W6 agent-focus node resolution, `lib/resolve-agent-focus-
 * node.ts`) — FSD forbids view→view imports, so the shared piece moved down
 * one layer instead of duplicating the vault-folder→kind map.
 */

const VAULT_FOLDER_TO_KIND: Record<string, string> = {
  domains: "domain",
  capabilities: "capability",
  elements: "element",
};

export function translateOntologyDeeplinkToTopologyParam(nodeId: string): string {
  const normalized = nodeId.trim().replace(/^\/+/, "").replace(/^ontology\//, "");
  if (!normalized) return normalized;

  const slashIndex = normalized.indexOf("/");
  if (slashIndex > 0 && slashIndex < normalized.length - 1) {
    const prefix = normalized.slice(0, slashIndex);
    const mappedKind = VAULT_FOLDER_TO_KIND[prefix];
    if (mappedKind) {
      return `${mappedKind}:${normalized.slice(slashIndex + 1)}`;
    }
  }

  // Already canonical (`capability:foo`), already bare (`foo`), or a nested
  // evidence-style path (`cli/src/commands/foo.mjs`) — pass through
  // unchanged; the topology resolver's own fallback chain covers those.
  return normalized;
}
