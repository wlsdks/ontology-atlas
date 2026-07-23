import { describe, expect, it } from "vitest";
import { resolveTourAnchorNodeId } from "./resolve-tour-anchor-node";

describe("resolveTourAnchorNodeId", () => {
  it("target 'project': picks the first project node", () => {
    const nodes = [
      { id: "domain:a", kind: "domain", isHub: false },
      { id: "project:root", kind: "project", isHub: true },
    ];
    expect(resolveTourAnchorNodeId(nodes, "project")).toBe("project:root");
  });

  it("target 'project': falls back to the first domain node when there's no project", () => {
    const nodes = [
      { id: "domain:a", kind: "domain", isHub: false },
      { id: "capability:b", kind: "capability", isHub: false },
    ];
    expect(resolveTourAnchorNodeId(nodes, "project")).toBe("domain:a");
  });

  it("target 'project': returns null when there is neither a project nor a domain", () => {
    const nodes = [{ id: "capability:b", kind: "capability", isHub: false }];
    expect(resolveTourAnchorNodeId(nodes, "project")).toBeNull();
  });

  it("target 'domain': picks the first domain node", () => {
    const nodes = [
      { id: "project:root", kind: "project", isHub: false },
      { id: "domain:a", kind: "domain", isHub: false },
      { id: "domain:b", kind: "domain", isHub: false },
    ];
    expect(resolveTourAnchorNodeId(nodes, "domain")).toBe("domain:a");
  });

  // 2026-07-23 Guardian 정정 회귀 가드 — isHub 는 스파인 뷰에서 "+N" 클러스터
  // 칩으로 접혀 클릭이 select 가 아니라 클러스터 확장(element view 전면
  // 재배치)을 일으킨다. 어떤 target 도 hub 를 이유로 domain/project 보다
  // 앞세우지 않는다.
  it("target 'domain': never prefers an isHub capability over a spine-visible domain", () => {
    const nodes = [
      { id: "capability:mcp-server", kind: "capability", isHub: true },
      { id: "project:root", kind: "project", isHub: false },
      { id: "domain:a", kind: "domain", isHub: false },
    ];
    expect(resolveTourAnchorNodeId(nodes, "domain")).toBe("domain:a");
  });

  it("target 'domain': falls back to the project when there's no domain", () => {
    const nodes = [
      { id: "capability:b", kind: "capability", isHub: true },
      { id: "project:root", kind: "project", isHub: false },
    ];
    expect(resolveTourAnchorNodeId(nodes, "domain")).toBe("project:root");
  });

  it("returns null for an empty node list", () => {
    expect(resolveTourAnchorNodeId([], "domain")).toBeNull();
  });
});
