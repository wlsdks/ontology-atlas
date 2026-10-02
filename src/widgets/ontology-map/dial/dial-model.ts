import type { ContainmentTree, DirectedDomainFlow, DomainDependency } from "../model/containment-tree";
import type {
  DialAttention,
  DialCapability,
  DialCapabilityDependency,
  DialDomain,
  DialEvidence,
  DialEvidenceView,
  DialModel,
} from "./types";

export interface DialModelInput {
  tree: ContainmentTree;
  dependencies: readonly DomainDependency[];
  flows: readonly DirectedDomainFlow[];
  elementIds?: readonly string[];
}

export function buildDialModel({ tree, dependencies, flows, elementIds = [] }: DialModelInput): DialModel {
  const domains: DialDomain[] = [];
  const domainById = new Map<string, DialDomain>();
  for (const d of tree.domains) {
    const domain: DialDomain = {
      id: d.id,
      label: d.label,
      capabilityIds: [],
      directElementIds: [],
      elementCount: tree.domainElementCount.get(d.id) ?? 0,
    };
    domains.push(domain);
    domainById.set(d.id, domain);
  }

  const domainOf = new Map<string, string | null>();
  const capabilityOf = new Map<string, string>();
  const capabilityById = new Map<string, DialCapability>();
  const orphanIds: string[] = [];
  for (const d of domains) domainOf.set(d.id, d.id);
  for (const c of tree.capabilities) {
    const domainId = tree.capabilityDomain.get(c.id) ?? null;
    const owner = domainId === null ? undefined : domainById.get(domainId);
    if (!owner) {
      domainOf.set(c.id, null);
      orphanIds.push(c.id);
      continue;
    }
    domainOf.set(c.id, owner.id);
    owner.capabilityIds.push(c.id);
    capabilityById.set(c.id, {
      id: c.id,
      label: c.label,
      domainId: owner.id,
      elementIds: [...(tree.capabilityElements.get(c.id) ?? [])],
      needsAcross: 0,
      usedAcross: 0,
    });
  }

  const elements = new Set([...tree.elementParent.keys(), ...elementIds]);
  for (const id of [...elements].sort()) {
    const owner = tree.elementParent.get(id);
    const capability = owner === undefined ? undefined : capabilityById.get(owner);
    if (capability) {
      capabilityOf.set(id, capability.id);
      domainOf.set(id, capability.domainId);
      continue;
    }
    const domain = owner === undefined ? undefined : domainById.get(owner);
    if (domain) {
      domain.directElementIds.push(id);
      domainOf.set(id, domain.id);
      continue;
    }
    domainOf.set(id, null);
    orphanIds.push(id);
  }

  const capabilityDependencies: DialCapabilityDependency[] = [];
  for (const dep of dependencies) {
    const from = dep.fromCapability === null ? undefined : capabilityById.get(dep.fromCapability);
    const to = dep.toCapability === null ? undefined : capabilityById.get(dep.toCapability);
    if (from && to && from.id !== to.id) {
      capabilityDependencies.push({ from: from.id, to: to.id, fromDomain: dep.fromDomain, toDomain: dep.toDomain });
    }
    if (dep.fromDomain === dep.toDomain) continue;
    if (from) from.needsAcross += 1;
    if (to) to.usedAcross += 1;
  }

  const sources = new Map<string, Set<string>>(domains.map((d) => [d.id, new Set<string>()] as const));
  for (const dep of dependencies) {
    if (dep.fromDomain !== dep.toDomain) sources.get(dep.toDomain)?.add(dep.fromDomain);
  }

  const flowList = [...flows];
  return {
    projectId: tree.project?.id ?? null,
    projectLabel: tree.project?.label ?? "",
    domains,
    domainById,
    capabilityById,
    domainOf,
    capabilityOf,
    flows: flowList,
    flowByKey: new Map(flowList.map((f) => [f.key, f] as const)),
    capabilityDependencies,
    orphanIds: orphanIds.sort(),
    dependents: new Map([...sources].map(([id, set]) => [id, set.size] as const)),
  };
}

const evidenceViews = new WeakMap<DialModel, { evidence: ReadonlyMap<string, DialEvidence> | null; view: DialEvidenceView }>();

export function dialEvidenceView(model: DialModel, evidence: ReadonlyMap<string, DialEvidence> | null): DialEvidenceView {
  const hit = evidenceViews.get(model);
  if (hit && hit.evidence === evidence) return hit.view;
  const staleByDomain = new Map<string, number>();
  if (evidence) {
    for (const c of model.capabilityById.values()) {
      if (evidence.get(c.id) === "stale") staleByDomain.set(c.domainId, (staleByDomain.get(c.domainId) ?? 0) + 1);
    }
  }
  const view: DialEvidenceView = {
    measured: evidence !== null,
    stateOf: (id) => evidence?.get(id) ?? "unknown",
    staleByDomain,
  };
  evidenceViews.set(model, { evidence, view });
  return view;
}

export function resolveDialAttention(model: DialModel, hoveredId: string | null, focusedId: string | null): DialAttention {
  const id = focusedId ?? hoveredId;
  const selected = focusedId !== null;
  let domainId: string | null = null;
  let capabilityId: string | null = null;
  if (id !== null) {
    if (model.domainById.has(id)) domainId = id;
    else if (model.capabilityById.has(id)) capabilityId = id;
    else capabilityId = model.capabilityOf.get(id) ?? null;
    if (capabilityId !== null) domainId = model.capabilityById.get(capabilityId)?.domainId ?? null;
    else if (domainId === null) domainId = model.domainOf.get(id) ?? null;
  }
  const needsCaps = new Set<string>();
  const usedByCaps = new Set<string>();
  const partnerDomains = new Set<string>();
  if (domainId === null) {
    return { key: `||${selected ? 1 : 0}`, domainId: null, capabilityId: null, needsCaps, usedByCaps, partnerDomains, selected };
  }
  for (const dep of model.capabilityDependencies) {
    if (capabilityId !== null) {
      if (dep.from === capabilityId) {
        needsCaps.add(dep.to);
        if (dep.toDomain !== domainId) partnerDomains.add(dep.toDomain);
      } else if (dep.to === capabilityId) {
        usedByCaps.add(dep.from);
        if (dep.fromDomain !== domainId) partnerDomains.add(dep.fromDomain);
      }
      continue;
    }
    if (dep.fromDomain === dep.toDomain) continue;
    if (dep.fromDomain === domainId) needsCaps.add(dep.to);
    else if (dep.toDomain === domainId) usedByCaps.add(dep.from);
  }
  if (capabilityId === null) {
    for (const f of model.flows) {
      if (f.a === domainId) partnerDomains.add(f.b);
      else if (f.b === domainId) partnerDomains.add(f.a);
    }
  }
  return {
    key: `${domainId}|${capabilityId ?? ""}|${selected ? 1 : 0}`,
    domainId,
    capabilityId,
    needsCaps,
    usedByCaps,
    partnerDomains,
    selected,
  };
}
