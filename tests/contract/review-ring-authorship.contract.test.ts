import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** `created_by` is provenance, never an inferred review state or primary map lens. */
const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("created_by UI boundary", () => {
  it("출처 값은 그래프 노드까지 보존한다", () => {
    const stages: [string, string, RegExp][] = [
      ["파생이 프론트매터를 읽는다", "src/entities/docs-vault/lib/derive-ontology-from-vault.ts", /createdBy:\s*typeof fm\.created_by/],
      ["그래프 노드가 싣는다", "src/features/vault-ontology/model/use-ontology-insight.ts", /createdBy:\s*stub\.createdBy/],
      ["지도 어댑터가 넘긴다", "src/views/home/lib/topology-v2-adapter.ts", /createdBy:\s*node\.createdBy/],
      ["월드 노드가 받는다", "src/widgets/topology-map-v2/ui/topology-world.ts", /createdBy:\s*n\.createdBy/],
    ];
    const broken = stages.filter(([, file, pattern]) => !pattern.test(read(file)));
    expect(broken.map(([name]) => name)).toEqual([]);
  });

  it("저작자를 검수 상태나 INDEX 렌즈로 승격하지 않는다", () => {
    const home = read("src/views/home/ui/HomePage.tsx");
    const panel = read("src/widgets/topology-index-panel/ui/TopologyIndexPanel.tsx");
    const frame = read("src/widgets/topology-map-v2/ui/topology-frame-draw.ts");
    const shapes = read("src/widgets/topology-map-v2/render/node-shapes.ts");
    const tokens = read("src/widgets/topology-map-v2/tokens/read-topology-v2-tokens.ts");
    const css = read("app/globals.css");
    expect(home).not.toMatch(/humanAuthoredLens|segmentHuman/);
    expect(panel).not.toMatch(/humanAuthored|segmentHuman|lens === "human"/);
    expect(frame).not.toMatch(/reviewPending:\s*node\.createdBy === "human"/);
    expect(`${frame}\n${shapes}\n${tokens}\n${css}`).not.toMatch(
      /reviewPending|reviewRing|topology-v2-review-ring/,
    );
  });
});
