import { resolveNodeDocument, type KnowledgeGraphNode, type KnowledgeGraphEdge } from '@/entities/knowledge-graph';
import type { VaultDoc } from '@/entities/docs-vault';

export interface AnalysisPair {
  id: string;
  from: KnowledgeGraphNode;
  to: KnowledgeGraphNode;
  edges: KnowledgeGraphEdge[];
}
export interface AnalysisClaim {
  node: KnowledgeGraphNode;
  document: VaultDoc | null;
  roles: KnowledgeGraphNode[];
  paths: string[];
  gaps: ('document' | 'anchor' | 'definition' | 'boundary' | 'uncertainty')[];
  inspected: boolean;
}
const order = (a: KnowledgeGraphNode, b: KnowledgeGraphNode) => a.title.localeCompare(b.title, 'en') || a.id.localeCompare(b.id, 'en');

/** A read projection: edge counts are declarations, never execution, risk or accepted meaning. */
export function buildAnalysisModel(nodes: readonly KnowledgeGraphNode[], edges: readonly KnowledgeGraphEdge[], docs: readonly VaultDoc[]) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const bySlug = new Map(docs.map(doc => [doc.slug, doc]));
  const documentOf = (node: KnowledgeGraphNode) => bySlug.get(resolveNodeDocument(node).ownSlug ?? '') ?? null;
  const children = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (edge.type !== 'contains' && edge.type !== 'belongs_to') continue;
    const [parent, child] = edge.type === 'contains' ? [edge.from, edge.to] : [edge.to, edge.from];
    if (!byId.has(parent) || !byId.has(child) || parent === child) continue;
    if (!children.has(parent)) children.set(parent, new Set());
    children.get(parent)!.add(child);
  }
  const domainsOf = new Map(nodes.map(node => [node.id, new Set<string>()]));
  // O(D × (V + E)); stop at another domain, preserving nearest recorded responsibilities.
  for (const domain of nodes.filter(node => node.kind === 'domain')) {
    const seen = new Set<string>(); const queue = [domain.id];
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i]; if (seen.has(id)) continue; seen.add(id);
      if (id !== domain.id && byId.get(id)?.kind === 'domain') continue;
      domainsOf.get(id)!.add(domain.id);
      queue.push(...children.get(id) ?? []);
    }
  }
  const pairsById = new Map<string, AnalysisPair>();
  const dependencyIds = new Set<string>();
  let internal = 0; let unassigned = 0;
  for (const edge of edges) {
    if (edge.type !== 'depends_on' || dependencyIds.has(edge.id)) continue;
    dependencyIds.add(edge.id);
    const a = domainsOf.get(edge.from), b = domainsOf.get(edge.to);
    if (a?.size !== 1 || b?.size !== 1) { unassigned++; continue; }
    const from = [...a][0], to = [...b][0];
    if (from === to) { internal++; continue; }
    const id = `${from}\0${to}`;
    const pair = pairsById.get(id) ?? { id, from: byId.get(from)!, to: byId.get(to)!, edges: [] };
    pair.edges.push(edge); pairsById.set(id, pair);
  }
  const pairs = [...pairsById.values()].sort((a, b) => b.edges.length - a.edges.length || order(a.from, b.from) || order(a.to, b.to));
  const claims = nodes.filter(node => node.kind === 'capability').map((node): AnalysisClaim => {
    const document = documentOf(node);
    const roles = [...children.get(node.id) ?? []].flatMap(id => {
      const role = byId.get(id); return role?.kind === 'element' && documentOf(role) ? [role] : [];
    }).sort(order);
    const paths = [...new Set([document, ...roles.map(documentOf)].flatMap(doc => typeof doc?.frontmatter.path === 'string' && doc.frontmatter.path.trim() ? [doc.frontmatter.path.trim()] : []))];
    const gaps: AnalysisClaim['gaps'] = [];
    if (!document) gaps.push('document');
    if (!paths.length && !roles.length) gaps.push('anchor');
    if (document?.meaningFindings?.includes('definition-missing')) gaps.push('definition');
    if (document?.meaningFindings?.includes('boundary-missing')) gaps.push('boundary');
    if (document?.meaningFindings?.includes('uncertainty-missing')) gaps.push('uncertainty');
    return { node, document, roles, paths, gaps, inspected: Array.isArray(document?.meaningFindings) };
  }).sort((a, b) => order(a.node, b.node));
  return {
    byId, documentOf, domainsOf, pairs, claims,
    domains: nodes.filter(node => node.kind === 'domain').sort(order),
    projects: nodes.filter(node => node.kind === 'project').sort(order),
    dependencyCount: dependencyIds.size, crossCount: pairs.reduce((sum, pair) => sum + pair.edges.length, 0), internal, unassigned,
    anchored: claims.filter(claim => claim.paths.length || claim.roles.length).length,
    inspected: claims.filter(claim => claim.inspected).length,
    gaps: claims.filter(claim => claim.gaps.length),
  };
}
