/**
 * A raw vault slug (`capabilities/foo`) → the topology `?p=` value (`capability:foo`); canonical and
 * bare ids already resolve there. Pure, so callers need no node list.
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

  // Canonical, bare or evidence-path ids pass through; the topology resolver covers them.
  return normalized;
}
