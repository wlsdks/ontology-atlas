/**
 * Translates a `/ontology/?node=<id>` deep-link id — or any other raw vault slug form,
 * such as an agent heartbeat's `focus.ontologySlug` — into the `?p=` value `/topology`
 * already understands (`/ontology` is now a thin redirect to `/topology`).
 *
 * Ported from the retired `resolveOntologyDeeplinkNode`'s id normalization,
 * specifically the plural vault-folder prefix mapping (`capabilities/foo` →
 * `capability:foo`). `/topology`'s own resolver
 * (`resolveTopologySelectedOntologyNode`) already handles canonical `kind:slug` ids
 * and bare slugs through its `endsWith(':'+tail)` fallback, so this function's only
 * job is closing the ONE gap that resolver does not cover. It stays pure and
 * synchronous and needs no node list, so callers can act without waiting for
 * ontology data to load.
 *
 * It lives at the entity layer because two views share it: `views/ontology-redirect`
 * (the deep-link redirect) and `views/home` (agent-focus node resolution). FSD forbids
 * view→view imports, so the shared piece moved down a layer rather than duplicating
 * the vault-folder→kind map.
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
