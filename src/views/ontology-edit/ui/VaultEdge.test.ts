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
  it("routes with cubic bezier, not smoothstep (owner hairpin regression)", () => {
    expect(source).toContain("getBezierPath");
    expect(source).not.toContain("getSmoothStepPath");
  });

  it("separates parallel edges and curves per semantic type", () => {
    expect(source).toContain("parallelEndpointShift");
    expect(source).toContain("edgeCurvatureForSemanticType");
  });
});
