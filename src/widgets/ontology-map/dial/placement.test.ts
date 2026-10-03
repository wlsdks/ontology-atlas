import { describe, expect, it } from "vitest";

import en from "../../../../messages/en/mapDial.json";
import ko from "../../../../messages/ko/mapDial.json";
import { capabilityTierRead, createDialPlacement, dialPlacementLine } from "./placement";
import type { DialDomain, DialMemory, DialModel } from "./types";

function model(dependents: Record<string, number>): DialModel {
  const domains: DialDomain[] = Object.keys(dependents).map((id) => ({ id, label: id, capabilityIds: [], directElementIds: [], elementCount: 0 }));
  return {
    projectId: "project", projectLabel: "P", domains, domainById: new Map(domains.map((d) => [d.id, d])),
    capabilityById: new Map(), domainOf: new Map(), capabilityOf: new Map(), flows: [], flowByKey: new Map(),
    capabilityDependencies: [], orphanIds: [], dependents: new Map(Object.entries(dependents)),
  };
}

function memoryOf(steps: Record<string, number>): DialMemory {
  return {
    order: Object.keys(steps), radiusByStep: new Map(),
    angleById: new Map(Object.entries(steps).map(([id, step]) => [id, { step, angle: 0 }])), itemOrder: new Map(),
  };
}

const format = (template: string, read: number, total: number) =>
  template.replace("{read, number}", read.toLocaleString("en")).replace("{total, number}", total.toLocaleString("en"));
const labelsOf = (messages: typeof en) => ({
  reading: (read: number, total: number) => format(messages.reading, read, total),
  settling: () => messages.settling,
});

describe("dial placement", () => {
  it("reads the capability tier from loader folders", () => {
    expect(capabilityTierRead(["project", "domains/a", "capabilities/x"])).toBe(false);
    expect(capabilityTierRead(["domains/a", "capabilities/x", "elements/e"])).toBe(true);
    expect(capabilityTierRead(["capabilities/x", "notes/n"])).toBe(true);
    expect(capabilityTierRead(["notes/a", "notes/b"])).toBe(false);
  });

  it("places nothing before the capability tier on a first open", () => {
    const p = createDialPlacement();
    const step = p.next({ model: model({ a: 0 }), reading: true, capabilityTierRead: false, memory: null });
    expect(step.state).toBe("reading");
    expect(step.model.domains).toEqual([]);
  });

  it("starts provisional at the first domain when a ring record exists, at the remembered step", () => {
    const p = createDialPlacement();
    const step = p.next({ model: model({ a: 0 }), reading: true, capabilityTierRead: false, memory: memoryOf({ a: 2 }) });
    expect(step.state).toBe("provisional");
    expect(step.held).toBe(1);
    expect(step.model.dependents.get("a")).toBe(4);
  });

  it("holds ring changes while reading and applies them in one event at the end", () => {
    const p = createDialPlacement();
    p.next({ model: model({ a: 0, b: 2 }), reading: true, capabilityTierRead: true, memory: null });
    const mid = p.next({ model: model({ a: 5, b: 2 }), reading: true, capabilityTierRead: true, memory: null });
    expect(mid).toMatchObject({ state: "provisional", held: 1, released: false });
    expect(mid.model.dependents.get("a")).toBe(0);
    const end = p.next({ model: model({ a: 9, b: 8 }), reading: false, capabilityTierRead: true, memory: null });
    expect(end).toMatchObject({ state: "settled", held: 2, released: true });
    expect(end.model.dependents.get("a")).toBe(9);
    const rebuilt = p.next({ model: model({ a: 9, b: 8 }), reading: false, capabilityTierRead: true, memory: null });
    expect(rebuilt).toMatchObject({ state: "settled", held: 2, released: false });
    expect(p.next({ model: model({ a: 9, b: 8 }), reading: true, capabilityTierRead: true, memory: null }).held).toBe(0);
  });

  it.each([["en", en], ["ko", ko]] as const)("%s reading line: the loader's counts, never a percentage", (_, messages) => {
    const labels = labelsOf(messages);
    const line = dialPlacementLine("reading", { read: 2140, total: 10000 }, labels)!;
    expect(line).toContain("2,140");
    expect(line).toContain("10,000");
    expect(line).not.toContain("%");
    expect(dialPlacementLine("provisional", { read: 1, total: 2 }, labels)).toBe(messages.settling);
    expect(dialPlacementLine("settled", { read: 1, total: 2 }, labels)).toBeNull();
  });
});
