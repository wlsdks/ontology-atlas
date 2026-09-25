import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **Do not draw a door where nothing can be done.**
 *
 * "Create linked" appears only on domain nodes. Domain → capability is linked by a
 * single `domain:` key on the new document, so no new write semantics are needed.
 * Other combinations (capability → element, and so on) require **editing the parent
 * document's list**, which makes it "editing somebody else's document" rather than
 * "creating" — a different job.
 *
 * Three things this gate locks: ① the domain condition ② pre-selecting the domain (a
 * person is not made to re-pick the node they just clicked) ③ the `created_by` stamp
 * on person-created nodes.
 */
const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("「이어서 새로 만들기」 — 어포던스 계약", () => {
  const inspector = read("src/views/home/ui/TopologyInspectorSurfaces.tsx");
  const composer = read("src/views/home/ui/TopologyBlockingOverlays.tsx");
  const authoring = read("src/views/home/model/use-topology-authoring.tsx");

  it("도메인 노드에서만 뜬다 — 다른 kind 는 이어 붙일 수가 없다", () => {
    expect(inspector).toMatch(/canCreateNode && canvasSelectedGraphNode\?\.kind === "domain"/);
    // Without the condition the tile appears where nothing can be linked.
    expect(inspector).toMatch(/onCreateLinked=\{/);
  });

  it("고른 도메인이 미리 골라진다 — 방금 누른 노드를 다시 묻지 않는다", () => {
    // Seeded with the domain's own address, the value the picker offers for it (map-edit QA
    // D10, 2026-09-26): the bare graph-id tail wrote a second spelling of the relation.
    expect(inspector).toMatch(/setCreateNodeSeedDomain\(resolveNodeVaultRef\(canvasSelectedGraphNode\)\)/);
    expect(authoring).toMatch(/value: resolveNodeVaultRef\(node\)/);
    expect(composer).toMatch(/defaultDomain=\{props\.createNodeSeedDomain\}/);
    expect(read("src/views/home/ui/CreateNodeForm.tsx")).toMatch(
      /useState\(defaultDomain\)/,
    );
  });

  it("화면에서 만든 노드에 `human` 스탬프가 찍힌다", () => {
    /*
     * The stamp is applied **at write time, and only for an actor the call path
     * proves** (ledger, 2026-07-31). This path is the screen's single "create concept",
     * which satisfies that condition. Provenance survives as the fact that MCP/CLI and a
     * person audit the same graph.
     */
    expect(authoring).toMatch(/buildNewNodeDoc\(\{ \.\.\.input, createdBy: "human" \}\)/);
    expect(read("src/entities/docs-vault/lib/build-vault-markdown.ts")).toMatch(
      /createdBy: args\.createdBy,/,
    );
  });

  it("타일은 핸들러가 있을 때만 그려진다 — 라벨만 있고 문이 없으면 안 된다", () => {
    const panel = read("src/widgets/ontology-map/ui/OntologyMapDetailPanel.tsx");
    expect(panel).toMatch(/onCreateLinked && labels\.actionCreateLinked/);
  });
});

it("keeps the protected topology owners connected to the route", () => {
  const route = readFileSync("src/views/home/ui/HomePage.tsx", "utf8");
  expect(route).toContain('<TopologyInspectorSurfaces');
  expect(route).toContain('<TopologyBlockingOverlays');
  expect(route).toContain('useTopologyAuthoring({');
});
