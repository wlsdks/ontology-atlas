type TreeKind = "project" | "domain" | "capability" | "element";

export interface TreeInputNode {
  id: string;
  label: string;
  kind: TreeKind;
}

export interface TreeInputEdge {
  source: string;
  target: string;
  /** `belongs_to` states containment from the child's side. */
  kind: "contains" | "depends";
  relationType: string;
}

export interface CapabilityDependency {
  /** An element's dependency rolls up to its capability. */
  from: string;
  to: string;
  sourceId: string;
  targetId: string;
}

export interface ContainmentTree {
  project: TreeInputNode | null;
  domains: TreeInputNode[];
  capabilityDomain: Map<string, string | null>;
  capabilities: TreeInputNode[];
  elementParent: Map<string, string>;
  capabilityElements: Map<string, string[]>;
  domainElementCount: Map<string, number>;
}

export interface DomainFlow {
  fromDomain: string;
  toDomain: string;
  /** Both directions when the flow is two-way. */
  count: number;
  twoWay: boolean;
}

const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byId = (a: { id: string }, b: { id: string }) => byString(a.id, b.id);

export function readContainmentTree(
  nodes: readonly TreeInputNode[],
  edges: readonly TreeInputEdge[],
): ContainmentTree {
  const kindOf = new Map(nodes.map((n) => [n.id, n.kind] as const));
  const parents = new Map<string, string[]>();
  for (const e of edges) {
    if (e.kind !== "contains") continue;
    if (!kindOf.has(e.source) || !kindOf.has(e.target)) continue;
    const [parent, child] = e.relationType === "belongs_to" ? [e.target, e.source] : [e.source, e.target];
    const list = parents.get(child);
    if (list) list.push(parent);
    else parents.set(child, [parent]);
  }
  for (const list of parents.values()) list.sort();
  const firstParentOfKind = (id: string, kind: TreeKind) =>
    (parents.get(id) ?? []).find((p) => kindOf.get(p) === kind) ?? null;

  const project = nodes.filter((n) => n.kind === "project").sort(byId)[0] ?? null;
  const domains = nodes.filter((n) => n.kind === "domain").sort(byId);
  const capabilities = nodes.filter((n) => n.kind === "capability").sort(byId);

  const capabilityDomain = new Map<string, string | null>();
  for (const c of capabilities) capabilityDomain.set(c.id, firstParentOfKind(c.id, "domain"));

  const elementParent = new Map<string, string>();
  const capabilityElements = new Map<string, string[]>();
  const domainElementCount = new Map<string, number>();
  for (const el of nodes.filter((n) => n.kind === "element").sort(byId)) {
    const cap = firstParentOfKind(el.id, "capability");
    const dom = cap ? capabilityDomain.get(cap) ?? null : firstParentOfKind(el.id, "domain");
    const owner = cap ?? dom;
    if (owner) elementParent.set(el.id, owner);
    if (cap) {
      const list = capabilityElements.get(cap);
      if (list) list.push(el.id);
      else capabilityElements.set(cap, [el.id]);
    }
    if (dom) domainElementCount.set(dom, (domainElementCount.get(dom) ?? 0) + 1);
  }
  return { project, domains, capabilityDomain, capabilities, elementParent, capabilityElements, domainElementCount };
}

export function rollDependencies(tree: ContainmentTree, edges: readonly TreeInputEdge[]): CapabilityDependency[] {
  const isCapability = new Set(tree.capabilities.map((c) => c.id));
  const toCapability = (id: string): string | null => {
    if (isCapability.has(id)) return id;
    const owner = tree.elementParent.get(id);
    return owner && isCapability.has(owner) ? owner : null;
  };
  const out: CapabilityDependency[] = [];
  const seen = new Set<string>();
  for (const e of edges) {
    if (e.kind === "contains" || e.relationType !== "depends_on") continue;
    const from = toCapability(e.source);
    const to = toCapability(e.target);
    if (!from || !to || from === to) continue;
    const key = `${e.source}\0${e.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ from, to, sourceId: e.source, targetId: e.target });
  }
  return out.sort((a, b) => (a.sourceId + a.targetId < b.sourceId + b.targetId ? -1 : 1));
}

export function rollDomainFlows(
  dependencies: readonly { from: string; to: string }[],
  domainOf: (id: string) => string | null | undefined,
): DomainFlow[] {
  const roll = new Map<string, DomainFlow>();
  for (const dep of dependencies) {
    const a = domainOf(dep.from);
    const b = domainOf(dep.to);
    if (!a || !b || a === b) continue;
    const back = roll.get(`${b}\0${a}`);
    if (back) {
      back.count += 1;
      back.twoWay = true;
      continue;
    }
    const k = `${a}\0${b}`;
    const cur = roll.get(k);
    if (cur) cur.count += 1;
    else roll.set(k, { fromDomain: a, toDomain: b, count: 1, twoWay: false });
  }
  return [...roll.values()].sort(
    (x, y) => y.count - x.count || byString(x.fromDomain + x.toDomain, y.fromDomain + y.toDomain),
  );
}

export interface DomainDependency {
  sourceId: string;
  targetId: string;
  fromDomain: string;
  toDomain: string;
  fromCapability: string | null;
  toCapability: string | null;
}

export interface DirectedDomainFlow {
  key: string;
  a: string;
  b: string;
  ab: number;
  ba: number;
  total: number;
  relatesOnly: boolean;
}

const pairKey = (a: string, b: string) => `${a}\0${b}`;

function domainResolver(tree: ContainmentTree) {
  const isDomain = new Set(tree.domains.map((d) => d.id));
  const capabilityOf = (id: string): string | null => {
    if (tree.capabilityDomain.has(id)) return id;
    const owner = tree.elementParent.get(id);
    return owner && tree.capabilityDomain.has(owner) ? owner : null;
  };
  const domainOf = (id: string): string | null => {
    if (isDomain.has(id)) return id;
    const cap = capabilityOf(id);
    if (cap) return tree.capabilityDomain.get(cap) ?? null;
    const owner = tree.elementParent.get(id);
    return owner && isDomain.has(owner) ? owner : null;
  };
  return { capabilityOf, domainOf };
}

export function domainOfNode(tree: ContainmentTree, id: string): string | null {
  return domainResolver(tree).domainOf(id);
}

export function rollDomainDependencies(tree: ContainmentTree, edges: readonly TreeInputEdge[]): DomainDependency[] {
  const { capabilityOf, domainOf } = domainResolver(tree);
  const out: DomainDependency[] = [];
  const seen = new Set<string>();
  for (const e of edges) {
    if (e.kind === "contains" || e.relationType !== "depends_on") continue;
    const key = pairKey(e.source, e.target);
    if (seen.has(key)) continue;
    seen.add(key);
    const fromDomain = domainOf(e.source);
    const toDomain = domainOf(e.target);
    if (!fromDomain || !toDomain) continue;
    out.push({
      sourceId: e.source,
      targetId: e.target,
      fromDomain,
      toDomain,
      fromCapability: capabilityOf(e.source),
      toCapability: capabilityOf(e.target),
    });
  }
  return out;
}

export function rollRelatesDomainPairs(tree: ContainmentTree, edges: readonly TreeInputEdge[]): { a: string; b: string }[] {
  const { domainOf } = domainResolver(tree);
  const pairs = new Map<string, { a: string; b: string }>();
  for (const e of edges) {
    if (e.kind === "contains" || e.relationType !== "related_to") continue;
    const x = domainOf(e.source);
    const y = domainOf(e.target);
    if (!x || !y || x === y) continue;
    const [a, b] = x < y ? [x, y] : [y, x];
    pairs.set(pairKey(a, b), { a, b });
  }
  return [...pairs.entries()].sort(([p], [q]) => byString(p, q)).map(([, pair]) => pair);
}

export function rollRelatesCapabilityPairs(tree: ContainmentTree, edges: readonly TreeInputEdge[]): { a: string; b: string }[] {
  const { capabilityOf } = domainResolver(tree);
  const pairs = new Map<string, { a: string; b: string }>();
  for (const e of edges) {
    if (e.kind === "contains" || e.relationType !== "related_to") continue;
    const x = capabilityOf(e.source);
    const y = capabilityOf(e.target);
    if (!x || !y || x === y) continue;
    const [a, b] = x < y ? [x, y] : [y, x];
    pairs.set(pairKey(a, b), { a, b });
  }
  return [...pairs.entries()].sort(([p], [q]) => byString(p, q)).map(([, pair]) => pair);
}

export function rollDirectedDomainFlows(
  deps: readonly DomainDependency[],
  relates: readonly { a: string; b: string }[],
): DirectedDomainFlow[] {
  const flows = new Map<string, DirectedDomainFlow>();
  for (const dep of deps) {
    if (dep.fromDomain === dep.toDomain) continue;
    const forward = dep.fromDomain < dep.toDomain;
    const [a, b] = forward ? [dep.fromDomain, dep.toDomain] : [dep.toDomain, dep.fromDomain];
    const key = pairKey(a, b);
    let flow = flows.get(key);
    if (!flow) {
      flow = { key, a, b, ab: 0, ba: 0, total: 0, relatesOnly: false };
      flows.set(key, flow);
    }
    if (forward) flow.ab += 1;
    else flow.ba += 1;
    flow.total += 1;
  }
  for (const pair of relates) {
    const [a, b] = pair.a < pair.b ? [pair.a, pair.b] : [pair.b, pair.a];
    const key = pairKey(a, b);
    if (!flows.has(key)) flows.set(key, { key, a, b, ab: 0, ba: 0, total: 0, relatesOnly: true });
  }
  return [...flows.values()].sort((x, y) => y.total - x.total || byString(x.key, y.key));
}
