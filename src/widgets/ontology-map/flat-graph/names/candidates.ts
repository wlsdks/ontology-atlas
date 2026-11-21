import type { DialModel } from "../../dial/types";
import type { OpenedElements } from "../open";
import { byId } from "../seed";
import { fannedNames, sideNames } from "./sides";
import type { NameInput, PlacedName } from "./placed-name";

export interface Candidate { id: string; element: boolean; tries: () => PlacedName[][] }

export function candidates(input: NameInput, degree: ReadonlyMap<string, number>, scale: number, fan: OpenedElements | null): Candidate[] {
  const { model, layout, tokens } = input;
  // The focused capability's element is named once its dot stands a name gap clear of the disc and ring: beside a dot they hide, a name points at nothing.
  const standsClear = (id: string) => {
    const ownerId = model.capabilityOf.get(id) ?? model.domainOf.get(id);
    const at = layout.positions.get(id);
    const owner = ownerId === undefined || ownerId === null ? undefined : layout.positions.get(ownerId);
    if (!at || !owner || fan?.offsets.has(id)) return true;
    if (ownerId !== input.focusId) return true;
    const ring = input.selected ? tokens.selectedRingGapPx + tokens.selectedRingPx : 0;
    return Math.hypot(at.x - owner.x, at.y - owner.y) * scale >= input.discRadius(ownerId!) + ring + input.discRadius(id) + tokens.nameGapPx;
  };
  const lit = input.lit;
  const caps = [...model.capabilityById.values()].filter((c) => layout.positions.has(c.id));
  const rank = (a: { id: string }, b: { id: string }) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || byId(a.id, b.id);
  const capCandidate = (c: { id: string; label: string }): Candidate => ({ id: c.id, element: false, tries: () => sideNames(input, c.id, "capability", c.label) });
  const showElements = input.elementSpacingPx >= input.tokens.elementNameSpacingPx;
  const elementIds = showElements ? [...model.capabilityOf.keys(), ...model.domains.flatMap((d) => d.directElementIds)].filter((id) => layout.positions.has(id)).sort(byId) : [];
  const elementCandidate = (id: string): Candidate => ({ id, element: true, tries: () => {
    const label = input.elementLabel(id);
    const offset = fan?.offsets.get(id);
    return !label ? [] : offset ? fannedNames(input, id, label, offset) : sideNames(input, id, "element", label);
  } });
  const focusFirst = (a: { id: string }, b: { id: string }) => (a.id === input.focusId ? -1 : b.id === input.focusId ? 1 : rank(a, b));
  const litCaps = lit ? caps.filter((c) => lit.has(c.id)).sort(focusFirst) : [];
  const namesElements = lit !== null && input.focusId !== null && !model.domainById.has(input.focusId);
  const litElements = namesElements ? [...lit!].filter((id) => model.capabilityOf.has(id) || (model.domainOf.has(id) && !model.domainById.has(id) && !model.capabilityById.has(id))).filter((id) => layout.positions.has(id) && (id === input.focusId || standsClear(id))).sort((a, b) => (a === input.focusId ? -1 : b === input.focusId ? 1 : byId(a, b))) : [];
  const rest = caps.filter((c) => !lit?.has(c.id)).sort(rank);
  const orphans = layout.orphanIds.filter((id) => !lit || lit.has(id)).map((id): Candidate => ({
    id, element: false, tries: () => { const label = input.elementLabel(id); return label ? sideNames(input, id, "capability", label) : []; },
  }));
  const agent = input.agentFocusId;
  const agentCandidate: Candidate[] = agent === null || !layout.positions.has(agent) || model.domainById.has(agent) || agent === model.projectId ? []
    : model.capabilityById.has(agent) ? [capCandidate({ id: agent, label: model.capabilityById.get(agent)!.label })]
      : layout.orphanIds.includes(agent) ? orphans.filter((o) => o.id === agent) : [elementCandidate(agent)];
  const focusElement = litElements.filter((id) => id === input.focusId).map(elementCandidate);
  return [
    ...focusElement,
    ...agentCandidate,
    ...litCaps.map(capCandidate),
    ...litElements.filter((id) => id !== input.focusId).map(elementCandidate),
    ...rest.map(capCandidate),
    ...orphans,
    ...elementIds.filter((id) => !lit?.has(id)).map(elementCandidate),
  ];
}

const degreeCache = new WeakMap<DialModel, Map<string, number>>();

export function degreeOf(model: DialModel): Map<string, number> {
  let hit = degreeCache.get(model);
  if (!hit) {
    hit = new Map();
    for (const dep of model.capabilityDependencies) {
      hit.set(dep.from, (hit.get(dep.from) ?? 0) + 1);
      hit.set(dep.to, (hit.get(dep.to) ?? 0) + 1);
    }
    degreeCache.set(model, hit);
  }
  return hit;
}
