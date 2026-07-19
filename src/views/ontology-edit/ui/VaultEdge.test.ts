import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "VaultEdge.tsx"), "utf8");

/**
 * VaultEdge 는 순수 export 가 없는 얇은 렌더 레이어라(라우팅 순수 로직은
 * `lib/builder-edge-route.ts` 로 이동), 회귀를 소스 계약으로 잠근다: smoothstep
 * 직교 라우팅으로 되돌아가면(=owner 헤어핀 재발) 이 테스트가 즉시 깨진다.
 */
describe("VaultEdge routing contract", () => {
  it("routes with the custom tangent bezier, not smoothstep (owner hairpin regression)", () => {
    // 2차: xyflow 의 getBezierPath 는 마주보는 포트에서 곡률을 무시해 뻣뻣했다 →
    // 커스텀 접선 경로(buildBuilderBezierPath)로 교체. smoothstep 회귀도 차단.
    expect(source).toContain("buildBuilderBezierPath");
    // 호출(call) 부재를 본다 — 설명 주석에 이름이 남아도 무방하도록 "(" 까지.
    expect(source).not.toContain("getSmoothStepPath(");
    expect(source).not.toContain("getBezierPath(");
  });

  it("separates parallel edges and scales the tangent per semantic type", () => {
    expect(source).toContain("parallelEndpointShift");
    expect(source).toContain("edgeTangentStrength");
  });
});
