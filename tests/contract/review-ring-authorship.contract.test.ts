import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **사람이 쓴 노드는 검수 대기로 보여야 한다** — 그리고 그 판정은
 * `created_by` 가 **정확히 `human`** 일 때만 참이어야 한다.
 *
 * 2026-07-31 원장이 이 값 규약을 정하면서 못박은 것: **부재는 결함이 아니라
 * unknown 이다.** 소급 추론(「로그 없음 = 사람」·git blame)으로는 출처가 존재하지
 * 않는다(98노드에 활동 로그 4줄, git user 는 단일 사람). 그래서 어떤 경로도
 * 부재를 `human` 으로 기본값 처리하면 안 된다 — 그 순간 지도의 절반이 검수
 * 대기로 붉어지고, 그 표시는 아무 뜻도 없어진다.
 *
 * 이 게이트가 잠그는 것은 **배관의 연속성**이다. 값은 프론트매터 → 파생 →
 * 그래프 노드 → 지도 어댑터 → 렌더러의 다섯 구간을 지나는데, 어느 한 칸이
 * 끊기면 링이 조용히 안 그려진다(타입은 optional 이라 tsc 도 조용하다).
 */
const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("검수 대기 링 — 저작 출처 배관", () => {
  it("다섯 구간이 모두 값을 나른다 — 한 칸이라도 끊기면 링이 조용히 사라진다", () => {
    const stages: [string, string, RegExp][] = [
      ["파생이 프론트매터를 읽는다", "src/entities/docs-vault/lib/derive-ontology-from-vault.ts", /createdBy:\s*typeof fm\.created_by/],
      ["그래프 노드가 싣는다", "src/features/vault-ontology/model/use-ontology-insight.ts", /createdBy:\s*stub\.createdBy/],
      ["지도 어댑터가 넘긴다", "src/views/home/lib/topology-v2-adapter.ts", /createdBy:\s*node\.createdBy/],
      ["월드 노드가 받는다", "src/widgets/topology-map-v2/ui/topology-world.ts", /createdBy:\s*n\.createdBy/],
      ["프레임이 판정한다", "src/widgets/topology-map-v2/ui/topology-frame-draw.ts", /reviewPending:\s*node\.createdBy === "human"/],
    ];
    const broken = stages.filter(([, file, pattern]) => !pattern.test(read(file)));
    expect(broken.map(([name]) => name)).toEqual([]);
  });

  it("판정은 정확히 `human` 일 때만 참이다 — 부재를 사람으로 떨어뜨리지 않는다", () => {
    const draw = read("src/widgets/topology-map-v2/ui/topology-frame-draw.ts");
    // `!== "agent:"` 같은 여집합 판정이나 `?? "human"` 기본값은 소급 추론이다.
    expect(draw).not.toMatch(/createdBy\s*\?\?\s*"human"/);
    expect(draw).not.toMatch(/createdBy\s*!==\s*"agent/);
  });

  it("링은 정적이고 glow 가 아니다 — 상주하는 표시가 돌면 지도가 떨린다", () => {
    const shapes = read("src/widgets/topology-map-v2/render/node-shapes.ts");
    const block = shapes.slice(shapes.indexOf("if (reviewPending"), shapes.indexOf("// 스포트라이트 변경-노드 링"));
    expect(block).toContain("setLineDash");
    // 회전 위상(`lineDashOffset`)도, 헌장이 금지한 번짐(`shadowBlur`)도 없다.
    expect(block).not.toContain("lineDashOffset");
    expect(block).not.toContain("shadowBlur");
  });

  it("검수 색은 오류 색과 다른 값이다 — 「사람이 썼다」가 「잘못됐다」로 읽히면 안 된다", () => {
    const css = read("app/globals.css");
    const review = css.match(/--topology-v2-review-ring:\s*([^;]+);/)?.[1]?.trim();
    expect(review, "검수 링 토큰이 없다 — 이 게이트가 빈 집합 위에서 돈다").toBeTruthy();
    const danger = css.match(/--color-status-danger:\s*([^;]+);/)?.[1]?.trim();
    if (danger) expect(review).not.toBe(danger);
  });
});
