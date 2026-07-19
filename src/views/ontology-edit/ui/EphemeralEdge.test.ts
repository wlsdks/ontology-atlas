import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "EphemeralEdge.tsx"), "utf8");

/**
 * ephemeral(초안) edge 도 vault edge 와 같은 cubic bezier 곡선 언어를 쓴다 —
 * 캔버스 안의 모든 선이 한 목소리여야 한다는 계약. offset 스텁 라우팅으로
 * 되돌아가면 깨진다.
 */
describe("EphemeralEdge routing contract", () => {
  it("uses the shared custom tangent bezier at relation strength", () => {
    expect(source).toContain("buildBuilderBezierPath");
    expect(source).toContain('edgeTangentStrength(');
    expect(source).toContain('"relation"');
  });

  it("keeps the indigo dashed draft ink and Save chip", () => {
    expect(source).toContain("--topology-v2-indigo-bright");
    expect(source).toContain("ephemeralEdgeSaveLabel");
  });
});
