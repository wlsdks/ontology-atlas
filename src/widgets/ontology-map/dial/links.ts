import type { DialAttention, DialModel, DialTokens } from "./types";

export interface DialLink {
  key: string;
  u: string;
  v: string;
  uv: number;
  vu: number;
  total: number;
  relatesOnly: boolean;
  attended: boolean;
}

interface Precomputed {
  capPairCounts: Map<string, number>;
  depsByDomain: Map<string, number[]>;
}

const pre = new WeakMap<DialModel, Precomputed>();

function precompute(model: DialModel): Precomputed {
  const hit = pre.get(model);
  if (hit) return hit;
  const capPairCounts = new Map<string, number>();
  const depsByDomain = new Map<string, number[]>();
  model.capabilityDependencies.forEach((d, i) => {
    const k = `${d.fromDomain}>${d.toDomain}`;
    capPairCounts.set(k, (capPairCounts.get(k) ?? 0) + 1);
    for (const dom of d.fromDomain === d.toDomain ? [d.fromDomain] : [d.fromDomain, d.toDomain]) {
      const list = depsByDomain.get(dom);
      if (list) list.push(i);
      else depsByDomain.set(dom, [i]);
    }
  });
  const p = { capPairCounts, depsByDomain };
  pre.set(model, p);
  return p;
}

export function domainOfEnd(model: DialModel, id: string): string {
  return model.capabilityById.get(id)?.domainId ?? id;
}

export function aggregateLinks(model: DialModel, resolved: ReadonlySet<string>, attention: DialAttention): DialLink[] {
  const { capPairCounts, depsByDomain } = precompute(model);
  const out = new Map<string, DialLink>();
  const add = (from: string, to: string, n: number, relatesOnly = false) => {
    if (from === to || n <= 0) return;
    const [u, v] = from < to ? [from, to] : [to, from];
    const key = `${u}\0${v}`;
    let link = out.get(key);
    if (!link) {
      link = { key, u, v, uv: 0, vu: 0, total: 0, relatesOnly, attended: false };
      out.set(key, link);
    }
    if (relatesOnly) return;
    link.relatesOnly = false;
    if (from === u) link.uv += n;
    else link.vu += n;
    link.total += n;
  };
  const deps = model.capabilityDependencies;
  const focusCap = attention.capabilityId;
  const focusDomain = focusCap ? model.capabilityById.get(focusCap)?.domainId ?? null : null;
  const partial = focusCap && focusDomain && !resolved.has(focusDomain) ? focusCap : null;
  const subtract = new Map<string, number>();
  const partialDeps: number[] = [];
  if (partial) {
    for (const i of depsByDomain.get(focusDomain!) ?? []) {
      const d = deps[i]!;
      if (d.from !== partial && d.to !== partial) continue;
      partialDeps.push(i);
      const other = d.from === partial ? d.toDomain : d.fromDomain;
      const k = `${d.fromDomain}>${d.toDomain}`;
      if (d.fromDomain !== d.toDomain && !resolved.has(other)) subtract.set(k, (subtract.get(k) ?? 0) + 1);
    }
  }
  for (const f of model.flows) {
    if (f.relatesOnly) {
      add(f.a, f.b, 1, true);
      continue;
    }
    const touches = resolved.has(f.a) || resolved.has(f.b);
    const less = (x: string, y: string) => (touches ? capPairCounts.get(`${x}>${y}`) : subtract.get(`${x}>${y}`)) ?? 0;
    add(f.a, f.b, f.ab - less(f.a, f.b));
    add(f.b, f.a, f.ba - less(f.b, f.a));
  }
  const seen = new Set<number>();
  const at = (cap: string, dom: string) => (resolved.has(dom) || cap === focusCap ? cap : dom);
  for (const dom of resolved) {
    for (const i of depsByDomain.get(dom) ?? []) {
      if (seen.has(i)) continue;
      seen.add(i);
      const d = deps[i]!;
      add(at(d.from, d.fromDomain), at(d.to, d.toDomain), 1);
    }
  }
  for (const i of partialDeps) {
    if (seen.has(i)) continue;
    const d = deps[i]!;
    const end = (cap: string, dom: string) => (cap === partial || dom === focusDomain || resolved.has(dom) ? cap : dom);
    add(end(d.from, d.fromDomain), end(d.to, d.toDomain), 1);
  }
  const links = [...out.values()];
  if (attention.domainId) {
    const mine = (id: string) => (attention.capabilityId ? id === attention.capabilityId : domainOfEnd(model, id) === attention.domainId);
    for (const l of links) l.attended = l.relatesOnly ? l.u === attention.domainId || l.v === attention.domainId : mine(l.u) !== mine(l.v);
  }
  return links.sort((x, y) => y.total - x.total || (x.key < y.key ? -1 : 1));
}

const NO_ATTENTION: DialAttention = { key: "||0", domainId: null, capabilityId: null, needsCaps: new Set(), usedByCaps: new Set(), relatesCaps: new Set(), partnerDomains: new Set(), selected: false };

export function ownLinkCount(model: DialModel, domainId: string): number {
  return aggregateLinks(model, new Set([domainId]), NO_ATTENTION).filter(
    (l) => !l.relatesOnly && (model.capabilityById.get(l.u)?.domainId === domainId || model.capabilityById.get(l.v)?.domainId === domainId),
  ).length;
}

export interface RestBudget {
  keep: Set<string>;
  limit: number;
  perEndCap: number;
  total: number;
}

export interface CrossingGuard {
  crosses(link: DialLink): boolean;
  add(link: DialLink): void;
}

const NEAR_EQUAL = 1.1;

export function restBudget(counted: readonly DialLink[], endsOnScreen: number, tokens: DialTokens, guard: CrossingGuard | null = null): RestBudget {
  const limit = counted.length <= tokens.restLinksMin
    ? counted.length
    : Math.max(tokens.restLinksMin, Math.min(tokens.restLinksMax, Math.round(tokens.restLinksPerEnd * endsOnScreen)));
  const perEndCap = endsOnScreen > tokens.perEndCapEnds ? tokens.perEndCap : Infinity;
  const avoid = counted.length > limit || perEndCap !== Infinity ? guard : null;
  const keep = new Set<string>();
  const dropped = new Set<string>();
  const perEnd = new Map<string, number>();
  let slots = 0;
  const open = (l: DialLink) => !keep.has(l.key) && !dropped.has(l.key) && (perEnd.get(l.u) ?? 0) < perEndCap && (perEnd.get(l.v) ?? 0) < perEndCap;
  const take = (l: DialLink) => {
    keep.add(l.key);
    perEnd.set(l.u, (perEnd.get(l.u) ?? 0) + 1);
    perEnd.set(l.v, (perEnd.get(l.v) ?? 0) + 1);
    avoid?.add(l);
  };
  const fill = (head: DialLink, peers: readonly DialLink[]) => {
    slots += 1;
    if (!avoid?.crosses(head)) return take(head);
    dropped.add(head.key);
    const peer = peers.find((l) => l.total * NEAR_EQUAL >= head.total && open(l) && !avoid.crosses(l));
    if (peer) take(peer);
  };
  const byEnd = new Map<string, DialLink[]>();
  for (const l of counted) {
    for (const end of [l.u, l.v]) {
      const list = byEnd.get(end);
      if (list) list.push(l);
      else byEnd.set(end, [l]);
    }
  }
  for (const list of byEnd.values()) {
    if (slots >= limit) break;
    if (open(list[0]!)) fill(list[0]!, list);
  }
  for (const [i, l] of counted.entries()) {
    if (slots >= limit) break;
    if (open(l)) fill(l, counted.slice(i + 1));
  }
  return { keep, limit, perEndCap, total: counted.length };
}
