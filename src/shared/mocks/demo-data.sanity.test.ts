import { describe, expect, it } from "vitest";
import {
  getDemoContainerStats,
  getDemoDataset,
  getDemoProjectsForContainer,
  getDemoWorkspaceProjects,
} from "./demo-data";

/**
 * 데모 시드 sanity — ASLAN 청사진이 의도대로 변환되는지 점검.
 * 회귀 시 즉시 잡힘.
 */
describe("demo dataset sanity", () => {
  it("워크스페이스 이름은 'ASLAN LAB'", () => {
    expect(getDemoDataset().account.name).toBe("ASLAN LAB");
  });

  it("컨테이너 20~30 (데모 풀-스케일 기준)", () => {
    const containers = getDemoWorkspaceProjects();
    expect(containers.length).toBeGreaterThanOrEqual(20);
    expect(containers.length).toBeLessThanOrEqual(30);
    // 핵심 4개는 항상 포함
    const ids = containers.map((c) => c.id);
    expect(ids).toContain("narnia");
    expect(ids).toContain("aslan-iam");
    expect(ids).toContain("aslan-reactor");
    expect(ids).toContain("aslan-knowledge");
  });

  it("flat projects 200+ (데모 풀-스케일 기준)", () => {
    const total = getDemoDataset().projects.length;
    expect(total).toBeGreaterThanOrEqual(200);
  });

  it("각 컨테이너가 최소 8 hub · 40 node 포함 (사용자 파악 가능 최소 밀도)", () => {
    const stats = getDemoContainerStats();
    for (const [id, stat] of stats) {
      expect(stat.hubs, `${id}.hubs`).toBeGreaterThanOrEqual(8);
      expect(stat.nodes, `${id}.nodes`).toBeGreaterThanOrEqual(40);
    }
  });

  it("Aslan Reactor 가 가장 큰 컨테이너 중 하나 (hub 15+)", () => {
    const reactor = getDemoContainerStats().get("aslan-reactor");
    expect(reactor).toBeDefined();
    expect(reactor?.hubs).toBeGreaterThanOrEqual(15);
  });

  it("getDemoProjectsForContainer 가 분배된 프로젝트만 반환", () => {
    const narniaProjects = getDemoProjectsForContainer("stress-lab", "narnia");
    expect(narniaProjects.length).toBeGreaterThan(0);
    // narnia 의 첫 hub 는 core 역할 (aslan-demo-blueprint HUB_ROLE_POOL 첫 roll).
    expect(narniaProjects.some((p) => p.isHub)).toBe(true);
  });

  it("cross-container 의존이 1개 이상 존재 (예: narnia → aslan-knowledge)", () => {
    const stats = getDemoContainerStats();
    const totalCross = Array.from(stats.values()).reduce(
      (sum, s) => sum + Array.from(s.depsToContainers.values()).reduce((a, b) => a + b, 0),
      0,
    );
    expect(totalCross).toBeGreaterThan(0);
  });

  it("다른 accountId 는 빈 배열", () => {
    expect(getDemoWorkspaceProjects("other-account")).toEqual([]);
    expect(getDemoProjectsForContainer("other-account", "narnia")).toEqual([]);
    expect(getDemoContainerStats("other-account").size).toBe(0);
  });
});
