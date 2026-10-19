import type { KnowledgeGraphEdge, KnowledgeGraphNode } from '@/entities/knowledge-graph';
import type { AnalysisClaim, buildAnalysisModel } from './analysis-model';

type AnalysisModel = ReturnType<typeof buildAnalysisModel>;

export interface BoardLane { id: string; domain: KnowledgeGraphNode | null; claims: AnalysisClaim[] }
export interface BoardLink { edge: KnowledgeGraphEdge; pairId: string; from: string; to: string; fromLane: number; toLane: number }
export interface AnalysisBoard { lanes: BoardLane[]; links: BoardLink[] }

export const UNASSIGNED_LANE = 'lane:unassigned';
export const laneAnchor = (domainId: string) => `lane:${domainId}`;
const EXACT_LANE_SEARCH = 8;

function* lexicographicPermutations(size: number): Generator<number[]> {
  const order = Array.from({ length: size }, (_, index) => index);
  while (true) {
    yield [...order];
    let pivot = size - 2;
    while (pivot >= 0 && order[pivot]! >= order[pivot + 1]!) pivot--;
    if (pivot < 0) return;
    let swap = size - 1;
    while (order[swap]! <= order[pivot]!) swap--;
    [order[pivot], order[swap]] = [order[swap]!, order[pivot]!];
    order.splice(pivot + 1, size, ...order.slice(pivot + 1).reverse());
  }
}

interface LanePair { a: number; b: number; weight: number }
const flowCost = (order: readonly number[], pairs: readonly LanePair[]) => {
  const position = new Array<number>(order.length);
  order.forEach((lane, slot) => { position[lane] = slot; });
  return pairs.reduce((sum, { a, b, weight }) => sum + weight * (Math.abs(position[a]! - position[b]!) + (position[a]! > position[b]! ? 0.5 : 0)), 0);
};

/** Lane order with the least weighted lane distance, a backward line costing half a lane more: exact over all D! orders for D ≤ 8, else single-lane moves and segment reversals until none improves, O(passes × D² × (D + P)). */
export function orderLanesByFlow(domainIds: readonly string[], weights: ReadonlyMap<string, ReadonlyMap<string, number>>): string[] {
  const pairs = domainIds.flatMap((from, a) => domainIds.flatMap((to, b) => { const weight = weights.get(from)?.get(to) ?? 0; return weight ? [{ a, b, weight }] : []; }));
  let best = domainIds.map((_, index) => index), bestCost = flowCost(best, pairs);
  if (domainIds.length <= EXACT_LANE_SEARCH) {
    for (const order of lexicographicPermutations(domainIds.length)) {
      const cost = flowCost(order, pairs);
      if (cost < bestCost) { bestCost = cost; best = order; }
    }
  } else {
    for (let improved = true; improved;) {
      improved = false;
      for (let from = 0; from < best.length; from++) for (let to = 0; to < best.length; to++) {
        if (from === to) continue;
        const moved = [...best];
        moved.splice(to, 0, ...moved.splice(from, 1));
        const reversed = from < to ? [...best.slice(0, from), ...best.slice(from, to + 1).reverse(), ...best.slice(to + 1)] : moved;
        for (const order of [moved, reversed]) {
          const cost = flowCost(order, pairs);
          if (cost < bestCost) { bestCost = cost; best = order; improved = true; }
        }
      }
    }
  }
  return best.map(index => domainIds[index]!);
}

export function buildAnalysisBoard(model: AnalysisModel): AnalysisBoard {
  const claimById = new Map(model.claims.map(claim => [claim.node.id, claim]));
  const laneClaims = new Map<string, AnalysisClaim[]>(model.domains.map(domain => [domain.id, []]));
  const unassigned: AnalysisClaim[] = [];
  for (const claim of model.claims) {
    const domains = model.domainsOf.get(claim.node.id);
    const only = domains?.size === 1 ? [...domains][0]! : null;
    (only && laneClaims.get(only) || unassigned).push(claim);
  }
  const ownerIn = (nodeId: string, domainId: string) => {
    if (claimById.has(nodeId)) return nodeId;
    return laneClaims.get(domainId)?.find(claim => claim.roles.some(role => role.id === nodeId))?.node.id ?? laneAnchor(domainId);
  };
  const weights = new Map<string, Map<string, number>>();
  const raw = model.pairs.flatMap(pair => {
    const row = weights.get(pair.from.id) ?? new Map<string, number>();
    row.set(pair.to.id, pair.edges.length); weights.set(pair.from.id, row);
    return pair.edges.map(edge => ({ edge, pairId: pair.id, from: ownerIn(edge.from, pair.from.id), to: ownerIn(edge.to, pair.to.id), fromDomain: pair.from.id, toDomain: pair.to.id }));
  });
  const linkCount = new Map<string, number>();
  for (const link of raw) for (const id of [link.from, link.to]) linkCount.set(id, (linkCount.get(id) ?? 0) + 1);
  const connectedFirst = (claims: AnalysisClaim[]) => claims.map((claim, index) => ({ claim, index })).sort((a, b) => (linkCount.get(b.claim.node.id) ?? 0) - (linkCount.get(a.claim.node.id) ?? 0) || a.index - b.index).map(row => row.claim);
  const laneIds = orderLanesByFlow(model.domains.map(domain => domain.id), weights);
  const lanes: BoardLane[] = laneIds.map(id => ({ id: laneAnchor(id), domain: model.byId.get(id) ?? null, claims: connectedFirst(laneClaims.get(id)!) }));
  if (unassigned.length) lanes.push({ id: UNASSIGNED_LANE, domain: null, claims: unassigned });
  const laneIndex = new Map(laneIds.map((id, index) => [id, index]));
  const cardIndex = new Map(lanes.flatMap(lane => lane.claims.map((claim, index) => [claim.node.id, index] as const)));
  const links = raw.map(({ fromDomain, toDomain, ...link }) => ({ ...link, fromLane: laneIndex.get(fromDomain)!, toLane: laneIndex.get(toDomain)! }));
  const rank = (id: string) => cardIndex.get(id) ?? -1;
  const upper = (link: BoardLink) => Math.min(link.fromLane, link.toLane), lower = (link: BoardLink) => Math.max(link.fromLane, link.toLane);
  links.sort((a, b) => upper(a) - upper(b) || lower(a) - lower(b) || a.fromLane - b.fromLane || rank(a.from) - rank(b.from) || rank(a.to) - rank(b.to) || a.edge.id.localeCompare(b.edge.id, 'en'));
  return { lanes, links };
}
