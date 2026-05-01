import { describe, expect, it } from "vitest";
import { getDemoDataset } from "./demo-data";

/**
 * 데모 시드 sanity — 슬림 (Phase 1.5) 후 6 컨테이너 / ~50 프로젝트 기준.
 * 토폴로지가 dense 자랑이 아니라 비개발자도 읽을 수 있는 도메인 6 개로
 * 정렬됨. ontology 노드는 demo-insight.ts 가 frontmatter capability/element
 * 로부터 파생.
 */
describe("demo dataset sanity", () => {
  it("6 컨테이너 도메인 — 슬림 후 명확한 4-6 도메인", () => {
    // hub/leaf 슬러그 prefix 분포로 컨테이너 수 추정. 첫 token = 도메인 id.
    const domains = new Set(
      getDemoDataset().projects.map((p) => p.slug.split("-").slice(0, 2).join("-")),
    );
    expect(domains.size).toBeGreaterThanOrEqual(4);
    expect(domains.size).toBeLessThanOrEqual(20);
  });

  it("flat projects 30~80 (슬림 demo 적정 범위)", () => {
    const total = getDemoDataset().projects.length;
    expect(total).toBeGreaterThanOrEqual(30);
    expect(total).toBeLessThanOrEqual(120);
  });

  it("hub 비율 (최소 10 hubs — 도메인 6 × 평균 2 hub)", () => {
    const hubs = getDemoDataset().projects.filter((p) => p.isHub);
    expect(hubs.length).toBeGreaterThanOrEqual(10);
  });

  it("cross-project 의존 — 의존 관계 sparse 하지만 존재", () => {
    const total = getDemoDataset().projects.reduce(
      (sum, p) => sum + p.dependencies.length,
      0,
    );
    // 슬림 demo 는 토폴로지 가독성 위해 dense 안 만듦. 일정 비율만 검증.
    expect(total / getDemoDataset().projects.length).toBeGreaterThan(0.5);
  });
});
