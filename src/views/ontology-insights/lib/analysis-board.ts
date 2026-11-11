import type { KnowledgeGraphEdge, KnowledgeGraphNode } from '@/entities/knowledge-graph';
import type { AnalysisClaim, AnalysisPair, buildAnalysisModel } from './analysis-model';

type AnalysisModel = ReturnType<typeof buildAnalysisModel>;

export interface BoardLane { id: string; domain: KnowledgeGraphNode | null; claims: AnalysisClaim[] }
export interface BoardLink { edge: KnowledgeGraphEdge; pairId: string; from: string; to: string }
export interface BoardPair { pair: AnalysisPair; links: BoardLink[] }
export type PairGrouping = 'needs' | 'provides';
export interface BoardPairGroup { anchor: KnowledgeGraphNode; declarations: number; pairs: BoardPair[] }
export interface AnalysisBoard { lanes: BoardLane[]; groups: Record<PairGrouping, BoardPairGroup[]>; links: BoardLink[] }

export const UNASSIGNED_LANE = 'lane:unassigned';
export const laneAnchor = (domainId: string) => `lane:${domainId}`;

const byTitle = (a: KnowledgeGraphNode, b: KnowledgeGraphNode) => a.title.localeCompare(b.title, 'en') || a.id.localeCompare(b.id, 'en');

// O(C·R + E log E)
export function buildAnalysisBoard(model: AnalysisModel): AnalysisBoard {
  const claimIndex = new Map(model.claims.map((claim, index) => [claim.node.id, index]));
  const laneClaims = new Map<string, AnalysisClaim[]>(model.domains.map(domain => [domain.id, []]));
  const unassigned: AnalysisClaim[] = [];
  for (const claim of model.claims) {
    const domains = model.domainsOf.get(claim.node.id);
    const only = domains?.size === 1 ? [...domains][0]! : null;
    (only && laneClaims.get(only) || unassigned).push(claim);
  }
  const roleOwners = new Map([...laneClaims].map(([domainId, claims]) => {
    const owners = new Map<string, string>();
    for (const claim of claims) for (const role of claim.roles) if (!owners.has(role.id)) owners.set(role.id, claim.node.id);
    return [domainId, owners] as const;
  }));
  const ownerIn = (nodeId: string, domainId: string) => claimIndex.has(nodeId) ? nodeId : roleOwners.get(domainId)?.get(nodeId) ?? laneAnchor(domainId);
  const rank = (id: string) => claimIndex.get(id) ?? -1;

  const pairs: BoardPair[] = model.pairs.map(pair => ({
    pair,
    links: pair.edges
      .map(edge => ({ edge, pairId: pair.id, from: ownerIn(edge.from, pair.from.id), to: ownerIn(edge.to, pair.to.id) }))
      .sort((a, b) => rank(a.from) - rank(b.from) || rank(a.to) - rank(b.to) || a.edge.id.localeCompare(b.edge.id, 'en')),
  }));
  const groupBy = (anchorOf: (pair: AnalysisPair) => KnowledgeGraphNode, otherOf: (pair: AnalysisPair) => KnowledgeGraphNode) => {
    const byAnchor = new Map<string, BoardPairGroup>();
    for (const entry of pairs) {
      const anchor = anchorOf(entry.pair);
      const group = byAnchor.get(anchor.id) ?? { anchor, declarations: 0, pairs: [] };
      group.pairs.push(entry);
      group.declarations += entry.links.length;
      byAnchor.set(anchor.id, group);
    }
    const groups = [...byAnchor.values()].sort((a, b) => b.declarations - a.declarations || byTitle(a.anchor, b.anchor));
    for (const group of groups) group.pairs.sort((a, b) => b.links.length - a.links.length || byTitle(otherOf(a.pair), otherOf(b.pair)));
    return groups;
  };
  const needs = groupBy(pair => pair.from, pair => pair.to);

  const lanes: BoardLane[] = model.domains.map(domain => ({ id: laneAnchor(domain.id), domain, claims: laneClaims.get(domain.id)! }));
  if (unassigned.length) lanes.push({ id: UNASSIGNED_LANE, domain: null, claims: unassigned });
  return { lanes, groups: { needs, provides: groupBy(pair => pair.to, pair => pair.from) }, links: needs.flatMap(group => group.pairs.flatMap(pair => pair.links)) };
}
