import type { KnowledgeGraphEdge, KnowledgeGraphNode } from '@/entities/knowledge-graph';
import type { AnalysisClaim, buildAnalysisModel } from './analysis-model';

type AnalysisModel = ReturnType<typeof buildAnalysisModel>;

export interface BoardPass { before: number; edges: string[] }
export interface BoardLane { id: string; domain: KnowledgeGraphNode | null; claims: AnalysisClaim[]; passes: BoardPass[] }
export interface BoardLink { edge: KnowledgeGraphEdge; pairId: string; from: string; to: string; fromLane: number; toLane: number }
export interface AnalysisBoard { lanes: BoardLane[]; links: BoardLink[] }

export const UNASSIGNED_LANE = 'lane:unassigned';
export const laneAnchor = (domainId: string) => `lane:${domainId}`;
const EXACT_LANE_SEARCH = 8;
const LOCAL_LANE_SEARCH = 64;
const LOCAL_PASSES = 16;
const ORDER_SWEEPS = 8;
const PASS_PREFIX = 'pass:';
const PASS_WIDTH_EM = 1.6;
const CARD_CHROME_EM = 3.2;
const WIDE_GLYPH = /[\u1100-\u11ff\u2e80-\ua4cf\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/u;
const labelWidthEm = (label: string) => [...label].reduce((sum, glyph) => sum + (WIDE_GLYPH.test(glyph) ? 1 : 0.6), CARD_CHROME_EM);

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

// O(D^2(D + P))
export function orderLanesByFlow(domainIds: readonly string[], weights: ReadonlyMap<string, ReadonlyMap<string, number>>): string[] {
  const pairs = domainIds.flatMap((from, a) => domainIds.flatMap((to, b) => { const weight = weights.get(from)?.get(to) ?? 0; return weight ? [{ a, b, weight }] : []; }));
  let best = domainIds.map((_, index) => index), bestCost = flowCost(best, pairs);
  if (domainIds.length <= EXACT_LANE_SEARCH) {
    for (const order of lexicographicPermutations(domainIds.length)) {
      const cost = flowCost(order, pairs);
      if (cost < bestCost) { bestCost = cost; best = order; }
    }
  } else if (domainIds.length <= LOCAL_LANE_SEARCH) {
    for (let pass = 0, improved = true; improved && pass < LOCAL_PASSES; pass++) {
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

export function busiestInOrder<T>(items: readonly T[], weight: (item: T) => number, pinned: T | null, limit: number): T[] {
  const ranked = [...items].sort((a, b) => weight(b) - weight(a));
  const kept = new Set(ranked.slice(0, limit));
  if (pinned !== null && items.includes(pinned) && !kept.has(pinned)) { kept.delete(ranked[limit - 1]!); kept.add(pinned); }
  return items.filter(item => kept.has(item));
}

// O(sweeps(E + N log N))
export function orderCardsByNeighbours(lanes: readonly (readonly string[])[], links: readonly { from: string; to: string }[], width: (id: string) => number = () => 1): string[][] {
  const neighbours = new Map<string, string[]>();
  for (const { from, to } of links) for (const [id, other] of [[from, to], [to, from]] as const) {
    const list = neighbours.get(id);
    if (list) list.push(other); else neighbours.set(id, [other]);
  }
  const position = new Map<string, number>();
  const linked = lanes.map(lane => lane.filter(id => neighbours.has(id)));
  const span = new Map(linked.flat().map(id => [id, width(id)]));
  const seat = (lane: string[]) => lane.reduce((left, id) => { position.set(id, left + span.get(id)! / 2); return left + span.get(id)!; }, 0);
  linked.forEach(seat);
  for (let sweep = 0; sweep < ORDER_SWEEPS; sweep++) {
    for (const lane of sweep % 2 ? [...linked].reverse() : linked) {
      const centre = new Map(lane.map(id => { const near = neighbours.get(id)!; return [id, near.reduce((sum, other) => sum + (position.get(other) ?? -1), 0) / near.length]; }));
      lane.sort((a, b) => centre.get(a)! - centre.get(b)! || position.get(a)! - position.get(b)!);
      seat(lane);
    }
  }
  return lanes.map((lane, index) => [...linked[index]!, ...lane.filter(id => !neighbours.has(id))]);
}

// O(CR + E log E + sweeps N log N), N=C+ED
export function buildAnalysisBoard(model: AnalysisModel): AnalysisBoard {
  const claimById = new Map(model.claims.map(claim => [claim.node.id, claim]));
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
  const ownerIn = (nodeId: string, domainId: string) => claimById.has(nodeId) ? nodeId : roleOwners.get(domainId)?.get(nodeId) ?? laneAnchor(domainId);
  const weights = new Map<string, Map<string, number>>();
  const raw = model.pairs.flatMap(pair => {
    const row = weights.get(pair.from.id) ?? new Map<string, number>();
    row.set(pair.to.id, pair.edges.length); weights.set(pair.from.id, row);
    return pair.edges.map(edge => ({ edge, pairId: pair.id, from: ownerIn(edge.from, pair.from.id), to: ownerIn(edge.to, pair.to.id), fromDomain: pair.from.id, toDomain: pair.to.id }));
  });
  const laneIds = orderLanesByFlow(model.domains.map(domain => domain.id), weights);
  const laneIndex = new Map(laneIds.map((id, index) => [id, index]));
  const links = raw.map(({ fromDomain, toDomain, ...link }) => ({ ...link, fromLane: laneIndex.get(fromDomain)!, toLane: laneIndex.get(toDomain)! }));
  const passes = laneIds.map((): string[] => []);
  const hops = links.flatMap(link => {
    const step = Math.sign(link.toLane - link.fromLane), path = [link.from];
    for (let lane = link.fromLane + step; lane !== link.toLane; lane += step) { const id = `${PASS_PREFIX}${link.edge.id}\0${lane}`; passes[lane]!.push(id); path.push(id); }
    path.push(link.to);
    return path.slice(1).map((to, index) => ({ from: path[index]!, to }));
  });
  const order = orderCardsByNeighbours(laneIds.map((id, lane) => [...laneClaims.get(id)!.map(claim => claim.node.id), ...passes[lane]!]), hops, id => id.startsWith(PASS_PREFIX) ? PASS_WIDTH_EM : labelWidthEm(claimById.get(id)!.node.display ?? claimById.get(id)!.node.title));
  const lanes: BoardLane[] = laneIds.map((id, index) => {
    const claims: AnalysisClaim[] = [], runs: BoardPass[] = [];
    for (const item of order[index]!) {
      if (!item.startsWith(PASS_PREFIX)) { claims.push(claimById.get(item)!); continue; }
      const edgeId = item.slice(PASS_PREFIX.length, item.lastIndexOf('\0')), last = runs.at(-1);
      if (last?.before === claims.length) last.edges.push(edgeId); else runs.push({ before: claims.length, edges: [edgeId] });
    }
    return { id: laneAnchor(id), domain: model.byId.get(id) ?? null, claims, passes: runs };
  });
  if (unassigned.length) lanes.push({ id: UNASSIGNED_LANE, domain: null, claims: unassigned, passes: [] });
  const cardIndex = new Map(lanes.flatMap(lane => lane.claims.map((claim, index) => [claim.node.id, index] as const)));
  const rank = (id: string) => cardIndex.get(id) ?? -1;
  const upper = (link: BoardLink) => Math.min(link.fromLane, link.toLane), lower = (link: BoardLink) => Math.max(link.fromLane, link.toLane);
  links.sort((a, b) => upper(a) - upper(b) || lower(a) - lower(b) || a.fromLane - b.fromLane || rank(a.from) - rank(b.from) || rank(a.to) - rank(b.to) || a.edge.id.localeCompare(b.edge.id, 'en'));
  return { lanes, links };
}
