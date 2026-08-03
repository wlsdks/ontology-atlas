import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **못 하는 자리에 문을 그리지 않는다.**
 *
 * 「이어서 새로 만들기」는 도메인 노드에서만 뜬다. 도메인→역량은 새 문서의
 * `domain:` 키 하나로 이어지므로 쓰기 의미를 새로 만들 필요가 없다. 다른
 * 조합(역량→요소 등)은 **부모 문서의 목록을 고쳐야** 해서 「만들기」가 아니라
 * 「남의 문서 수정」이 되고, 그건 다른 일이다.
 *
 * 이 게이트가 잠그는 것 셋: ① 도메인 조건 ② 도메인 미리 고르기(사람이 방금
 * 누른 노드를 다시 고르게 하지 않는다) ③ 사람이 만든 노드에 `created_by` 스탬프
 * (없으면 방금 만든 노드가 검수 대기 링을 못 받는다 — 2026-08-03 실측).
 */
const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("「이어서 새로 만들기」 — 어포던스 계약", () => {
  const home = read("src/views/home/ui/HomePage.tsx");

  it("도메인 노드에서만 뜬다 — 다른 kind 는 이어 붙일 수가 없다", () => {
    expect(home).toMatch(/canCreateNode && canvasSelectedGraphNode\?\.kind === "domain"/);
    // 조건이 사라지면 못 이어지는 자리에도 타일이 뜬다.
    expect(home).toMatch(/onCreateLinked=\{/);
  });

  it("고른 도메인이 미리 골라진다 — 방금 누른 노드를 다시 묻지 않는다", () => {
    expect(home).toMatch(/setCreateNodeSeedDomain\(tail\)/);
    expect(home).toMatch(/defaultDomain=\{createNodeSeedDomain\}/);
    expect(read("src/views/home/ui/CreateNodeForm.tsx")).toMatch(
      /useState\(defaultDomain\)/,
    );
  });

  it("화면에서 만든 노드에 `human` 스탬프가 찍힌다", () => {
    /*
     * 스탬프는 **쓰기 시점에, 호출 경로가 증명하는 행위자에게만** 찍는다
     * (2026-07-31 원장). 이 경로는 화면의 「개념 만들기」 하나뿐이라 그 조건을
     * 만족한다. 빠지면 방금 만든 노드가 지도에서 검수 대기 링을 못 받는다.
     */
    expect(home).toMatch(/buildNewNodeDoc\(\{ \.\.\.input, createdBy: "human" \}\)/);
    expect(read("src/entities/docs-vault/lib/build-vault-markdown.ts")).toMatch(
      /createdBy: args\.createdBy,/,
    );
  });

  it("타일은 핸들러가 있을 때만 그려진다 — 라벨만 있고 문이 없으면 안 된다", () => {
    const panel = read("src/widgets/topology-map-v2/ui/TopologyV2DetailPanel.tsx");
    expect(panel).toMatch(/onCreateLinked && labels\.actionCreateLinked/);
  });
});
