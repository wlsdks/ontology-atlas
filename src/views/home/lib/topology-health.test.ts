import { describe, expect, it } from "vitest";

import { filterOntologyConnectedOrphans } from "./topology-health";

/**
 * 정리 칩 신호 품질 (기획자 감사 ⑦-a):
 * project-deps 렌즈의 orphan 판정은 ontology containment 를 못 본다 —
 * `contains` 로 도메인/역량을 거느린 프로젝트 루트가 "소속 미정" 오탐이
 * 되면 첫 클릭에 칩 신뢰가 무너진다. ontology 엣지에 어느 방향으로든
 * 참여하는 프로젝트는 orphan 에서 제외한다 (bare slug 와 `project:` prefix
 * 두 표기 모두).
 */
const project = (slug: string) => ({ slug }) as { slug: string };

describe("filterOntologyConnectedOrphans", () => {
  it("drops projects that participate in ontology edges (bare slug)", () => {
    const result = filterOntologyConnectedOrphans(
      [project("ontology-atlas"), project("island")],
      [{ from: "ontology-atlas", to: "domain:views" }],
    );
    expect(result.map((p) => p.slug)).toEqual(["island"]);
  });

  it("drops projects referenced with the project: prefix", () => {
    const result = filterOntologyConnectedOrphans(
      [project("ontology-atlas")],
      [{ from: "domain:views", to: "project:ontology-atlas" }],
    );
    expect(result).toEqual([]);
  });

  it("keeps genuinely unconnected projects", () => {
    const result = filterOntologyConnectedOrphans(
      [project("island")],
      [{ from: "domain:views", to: "capability:x" }],
    );
    expect(result.map((p) => p.slug)).toEqual(["island"]);
  });

  it("returns the input untouched when there are no ontology edges", () => {
    const orphans = [project("a"), project("b")];
    expect(filterOntologyConnectedOrphans(orphans, [])).toEqual(orphans);
  });
});
