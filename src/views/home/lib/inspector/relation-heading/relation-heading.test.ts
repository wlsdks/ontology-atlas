import { describe, expect, it } from "vitest";
import { buildV2ConnectionGroups } from "@/widgets/ontology-map";
import { relationHeadingKeys } from "./relation-heading";

const group = (...kinds: string[]) => ({
  rows: kinds.map((kind) => ({ kind })),
  total: kinds.length,
});
const typedRow = (relationType: string) => ({ kind: "element", relationType, relationTypes: [relationType] });
const headings = (
  kind: string,
  groups: Partial<Parameters<typeof relationHeadingKeys>[1]>,
) => relationHeadingKeys(kind, {
  contains: group(), belongsTo: group(), dependsOn: group(), usedBy: group(), ...groups,
});

describe("relation headings", () => {
  it.each([
    ["depends_on", "uses"],
    ["uses", "depends_on"],
  ])("keeps same-neighbor mixed relations neutral in order %s then %s", (...types) => {
    for (const direction of ["incoming", "outgoing"] as const) {
      const groups = buildV2ConnectionGroups(types.map((relationType) => Object.freeze({
        id: "element:shared", title: "Shared", kind: "element", relationType, direction,
      })));
      const result = relationHeadingKeys("capability", groups);
      const view = groups[direction === "incoming" ? "usedBy" : "dependsOn"];
      expect(view.total).toBe(1);
      expect(view.rows[0].relationType).toBe(types[0]);
      expect(view.allRows![0].relationTypes).toEqual(expect.arrayContaining(types));
      expect(result.dependsOn).toBe("nodeDatasheet.metricConnectedTo");
      expect(result.usedBy).toBe("nodeDatasheet.metricConnectedFrom");
    }
  });

  it("specializes only complete dependency groups in either direction", () => {
    const groups = buildV2ConnectionGroups(["dependencies", "depends_on"].flatMap((relationType) =>
      (["incoming", "outgoing"] as const).map((direction) => ({
        id: "element:shared", title: "Shared", kind: "element", relationType, direction,
      })),
    ));
    const result = relationHeadingKeys("capability", groups);
    expect(result.dependsOn).toBe("nodeDatasheet.metricDependsOn");
    expect(result.usedBy).toBe("nodeDatasheet.metricUsedBy");
  });

  it("keeps mixed and other directed relations neutral even beyond the preview", () => {
    const rows = [typedRow("depends_on")];
    for (const relationType of ["uses", "implements", "describes", "is_a", "unknown"]) {
      const mixed = { rows, total: 2, allRows: [...rows, typedRow(relationType)] };
      const result = headings("capability", { dependsOn: mixed, usedBy: mixed });
      expect(result.dependsOn).toBe("nodeDatasheet.metricConnectedTo");
      expect(result.usedBy).toBe("nodeDatasheet.metricConnectedFrom");
      expect(result.dependsOnHelp).toBe("nodeDatasheet.metricConnectedToHelp");
      expect(result.usedByHelp).toBe("nodeDatasheet.metricConnectedFromHelp");
      const other = { rows: [typedRow(relationType)], total: 1 };
      expect(headings("capability", { dependsOn: other }).dependsOn)
        .toBe("nodeDatasheet.metricConnectedTo");
    }
  });

  it("does not claim dependency from incomplete or untyped groups", () => {
    for (const incomplete of [
      group(), group("element"),
      { rows: [{ kind: "element", relationType: "depends_on" }], total: 1 },
      { rows: [typedRow("depends_on")], total: 2 },
    ]) {
      const result = headings("capability", { dependsOn: incomplete, usedBy: incomplete });
      expect(result.dependsOn).toBe("nodeDatasheet.metricConnectedTo");
      expect(result.usedBy).toBe("nodeDatasheet.metricConnectedFrom");
    }
  });

  it.each([
    ["capability", "element", "containsElements"],
    ["domain", "capability", "containsCapabilities"],
    ["project", "domain", "containsDomains"],
  ])("classifies %s containment of %s", (selected, child, key) => {
    expect(headings(selected, {
      contains: group(child, child), belongsTo: group(),
    }).contains).toBe(`nodeDatasheet.${key}`);
  });

  it("requires the selected kind to match the contained role", () => {
    expect(headings("domain", {
      contains: group("element"), belongsTo: group(),
    }).contains).toBe("nodeDatasheet.containsItems");
  });

  it("uses the complete group when a different kind falls beyond the preview", () => {
    const rows = group(...Array<string>(6).fill("element")).rows;
    expect(headings("capability", {
      contains: { rows, total: 7, allRows: [...rows, { kind: "capability" }] },
      belongsTo: group(),
    }).contains).toBe("nodeDatasheet.containsItems");
    expect(headings("capability", {
      contains: { rows, total: 7, allRows: [...rows, { kind: "element" }] },
      belongsTo: group(),
    }).contains).toBe("nodeDatasheet.containsElements");
  });

  it("does not infer a role from incomplete or unknown containment", () => {
    for (const contains of [
      group(), group("unknown"),
      { ...group("element"), total: 2 },
      { ...group("element"), total: 2, allRows: group("element").rows },
    ]) {
      expect(headings("capability", {
        contains, belongsTo: group(),
      }).contains).toBe("nodeDatasheet.containsItems");
    }
  });

  it.each([
    ["capability", "domain", "belongsToDomain"],
    ["domain", "project", "belongsToProject"],
    ["element", "capability", "belongsToCapability"],
  ])("classifies the container of a %s as %s", (selected, parent, key) => {
    expect(headings(selected, {
      contains: group(), belongsTo: group(parent),
    }).belongsTo).toBe(`nodeDatasheet.${key}`);
  });

  it("keeps mixed, unknown and incomplete parents generic", () => {
    for (const belongsTo of [
      group(), group("domain", "project"), group("unknown"),
      { rows: group("domain").rows, total: 2, allRows: group("domain", "project").rows },
      { ...group("domain"), total: 2 },
    ]) {
      expect(headings("element", {
        contains: group(), belongsTo,
      }).belongsTo).toBe("nodeDatasheet.containedBy");
    }
  });

  it("does not call a non-element an element when a capability contains it", () => {
    expect(headings("capability", {
      contains: group(), belongsTo: group("capability"),
    }).belongsTo).toBe("nodeDatasheet.containedBy");
  });
});
