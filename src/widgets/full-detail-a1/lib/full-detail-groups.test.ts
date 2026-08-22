import { describe, expect, it } from "vitest";
import { buildFullDetailGroups } from "./full-detail-groups";

describe("buildFullDetailGroups", () => {
  const nodes = [
    { id: "domain:a", title: "Domain A", kind: "domain" },
    { id: "capability:child-1", title: "Child One", kind: "capability" },
    { id: "element:child-2", title: "Child Two", kind: "element" },
    { id: "element:grandchild", title: "Grandchild", kind: "element" },
    { id: "capability:user", title: "User Capability", kind: "capability" },
    { id: "capability:dep", title: "Dep Capability", kind: "capability" },
    { id: "project:root", title: "Root Project", kind: "project" },
  ];

  const edges = [
    // domain:a contains capability:child-1, element:child-2 (outgoing containment)
    { from: "domain:a", to: "capability:child-1", type: "contains" },
    { from: "domain:a", to: "element:child-2", type: "contains" },
    // capability:child-1 itself contains element:grandchild
    { from: "capability:child-1", to: "element:grandchild", type: "contains" },
    // project:root contains domain:a (so domain:a "belongs to" project:root)
    { from: "project:root", to: "domain:a", type: "contains" },
    // capability:user depends_on domain:a → domain:a is "used by" capability:user
    { from: "capability:user", to: "domain:a", type: "depends_on" },
    // domain:a depends_on capability:dep → 「기대는 곳」 (what it depends on)
    { from: "domain:a", to: "capability:dep", type: "depends_on" },
  ];

  it("빈 edges → 네 그룹 모두 total 0", () => {
    const groups = buildFullDetailGroups("domain:a", nodes, []);
    expect(groups.contains.total).toBe(0);
    expect(groups.usedBy.total).toBe(0);
    expect(groups.dependsOn.total).toBe(0);
    expect(groups.belongsTo.total).toBe(0);
  });

  it("outgoing containment → contains 그룹, 자식의 자식 개수를 childCount 로", () => {
    const groups = buildFullDetailGroups("domain:a", nodes, edges);
    expect(groups.contains.total).toBe(2);
    const child1 = groups.contains.rows.find((r) => r.id === "capability:child-1");
    expect(child1?.childCount).toBe(1); // grandchild
    const child2 = groups.contains.rows.find((r) => r.id === "element:child-2");
    expect(child2?.childCount).toBe(0);
  });

  it("incoming containment → belongsTo 그룹, 그 부모의 자식 수(=domain:a 포함 1)를 childCount 로", () => {
    const groups = buildFullDetailGroups("domain:a", nodes, edges);
    expect(groups.belongsTo.total).toBe(1);
    expect(groups.belongsTo.rows[0].id).toBe("project:root");
    expect(groups.belongsTo.rows[0].childCount).toBe(1);
  });

  it("incoming non-containment → usedBy 그룹", () => {
    const groups = buildFullDetailGroups("domain:a", nodes, edges);
    expect(groups.usedBy.total).toBe(1);
    expect(groups.usedBy.rows[0].id).toBe("capability:user");
    expect(groups.usedBy.rows[0].containment).toBe(false);
  });

  it("outgoing non-containment → dependsOn 그룹", () => {
    const groups = buildFullDetailGroups("domain:a", nodes, edges);
    expect(groups.dependsOn.total).toBe(1);
    expect(groups.dependsOn.rows[0].id).toBe("capability:dep");
  });

  it("containment row 는 trace mark 용 containment:true, 비-containment 는 false", () => {
    const groups = buildFullDetailGroups("domain:a", nodes, edges);
    for (const row of groups.contains.rows) expect(row.containment).toBe(true);
    for (const row of groups.belongsTo.rows) expect(row.containment).toBe(true);
    for (const row of groups.dependsOn.rows) expect(row.containment).toBe(false);
  });

  it("uncapped — full 리스트 (cap 없음)", () => {
    const manyEdges = Array.from({ length: 12 }, (_, i) => ({
      from: "domain:a",
      to: `element:e${i}`,
      type: "contains",
    }));
    const manyNodes = [
      ...nodes,
      ...Array.from({ length: 12 }, (_, i) => ({
        id: `element:e${i}`,
        title: `E${i}`,
        kind: "element",
      })),
    ];
    const groups = buildFullDetailGroups("domain:a", manyNodes, manyEdges);
    expect(groups.contains.total).toBe(12);
    expect(groups.contains.rows).toHaveLength(12);
  });

  it("belongs_to 로 저작된 containment 도 방향 반대로 올바르게 분류", () => {
    // capability:child-1 --belongs_to--> domain:a : domain:a is the parent (the
    // container) and capability:child-1 the child — the opposite direction encoding
    // from `contains` (parent→child).
    const belongsToEdges = [
      { from: "capability:child-1", to: "domain:a", type: "belongs_to" },
    ];
    const groups = buildFullDetailGroups("domain:a", nodes, belongsToEdges);
    expect(groups.contains.total).toBe(1);
    expect(groups.contains.rows[0].id).toBe("capability:child-1");
    expect(groups.belongsTo.total).toBe(0);

    const fromChildGroups = buildFullDetailGroups(
      "capability:child-1",
      nodes,
      belongsToEdges,
    );
    expect(fromChildGroups.belongsTo.total).toBe(1);
    expect(fromChildGroups.belongsTo.rows[0].id).toBe("domain:a");
    expect(fromChildGroups.contains.total).toBe(0);
  });

  it("같은 방향에 두 relationType(depends_on + related_to) 인 같은 이웃 → 버킷당 1행만 (React key 충돌 회귀 방지)", () => {
    const dupEdges = [
      { from: "domain:a", to: "capability:dep", type: "depends_on" },
      { from: "domain:a", to: "capability:dep", type: "related_to" },
    ];
    const groups = buildFullDetailGroups("domain:a", nodes, dupEdges);
    expect(groups.dependsOn.total).toBe(1);
    expect(groups.dependsOn.rows).toHaveLength(1);
  });

  it("changedIds 로 fresh 플래그 표시", () => {
    const groups = buildFullDetailGroups(
      "domain:a",
      nodes,
      edges,
      new Set(["capability:child-1"]),
    );
    const row = groups.contains.rows.find((r) => r.id === "capability:child-1");
    expect(row?.fresh).toBe(true);
    const other = groups.contains.rows.find((r) => r.id === "element:child-2");
    expect(other?.fresh).toBe(false);
  });
});
