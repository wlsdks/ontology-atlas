import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_ONTOLOGY_CLASSES } from "./defaults";
import { DEFAULT_ONTOLOGY_RELATIONS } from "../../ontology-relation/model/defaults";

/**
 * TBox 단일 진실원 강제 — 클래스 / 관계 정의가 다른 두 곳 (seed 스크립트,
 * firestore.rules manual create 화이트리스트) 과 빌드 타임에 동기화돼 있는지
 * 검증한다. defaults 가 진실원이고, 다른 곳이 그것을 따라가는 구조.
 *
 * 데이터 모델 검토 (Sarah) P1 의 "ontologyClasses 의 단일 진실원을
 * defaults.ts 로 못 박고 빌드 타임에 sync 검증" 을 닫기 위함.
 */

const REPO_ROOT = resolve(__dirname, "../../../..");

function readRepoFile(relPath: string): string {
  return readFileSync(resolve(REPO_ROOT, relPath), "utf-8");
}

describe("ontologyClasses TBox sync — defaults vs seed script", () => {
  it("seed-ontology-tbox.mjs 의 ONTOLOGY_CLASSES 가 DEFAULT_ONTOLOGY_CLASSES 의 모든 ID 를 포함", () => {
    const seedText = readRepoFile("scripts/seed-ontology-tbox.mjs");
    const classesBlock = seedText.split("ONTOLOGY_CLASSES = [")[1]?.split("];")[0] ?? "";
    expect(classesBlock).not.toEqual("");

    for (const cls of DEFAULT_ONTOLOGY_CLASSES) {
      expect(
        classesBlock,
        `seed 스크립트가 클래스 '${cls.id}' 를 시드하지 않음 — defaults.ts 와 동기화 필요`,
      ).toContain(`id: '${cls.id}'`);
    }

    const seedIdCount = (classesBlock.match(/id:\s*'/g) ?? []).length;
    expect(
      seedIdCount,
      "seed 스크립트의 ID 수가 DEFAULT_ONTOLOGY_CLASSES 와 다름 — 한쪽이 추가/삭제됨",
    ).toBe(DEFAULT_ONTOLOGY_CLASSES.length);
  });

  it("seed-ontology-tbox.mjs 의 ONTOLOGY_RELATIONS 가 DEFAULT_ONTOLOGY_RELATIONS 의 모든 ID 를 포함", () => {
    const seedText = readRepoFile("scripts/seed-ontology-tbox.mjs");
    const relationsBlock =
      seedText.split("ONTOLOGY_RELATIONS = [")[1]?.split("];")[0] ?? "";
    expect(relationsBlock).not.toEqual("");

    for (const rel of DEFAULT_ONTOLOGY_RELATIONS) {
      expect(
        relationsBlock,
        `seed 스크립트가 관계 '${rel.id}' 를 시드하지 않음 — defaults.ts 와 동기화 필요`,
      ).toContain(`id: '${rel.id}'`);
    }

    const seedIdCount = (relationsBlock.match(/id:\s*'/g) ?? []).length;
    expect(
      seedIdCount,
      "seed 스크립트의 관계 ID 수가 DEFAULT_ONTOLOGY_RELATIONS 와 다름",
    ).toBe(DEFAULT_ONTOLOGY_RELATIONS.length);
  });
});

describe("ontologyClasses TBox sync — defaults vs firestore.rules", () => {
  it("rules 의 manual create 화이트리스트가 'unknown' 을 제외한 정식 5 종과 일치", () => {
    const rulesText = readRepoFile("firestore.rules");
    // knowledgeApprovedNodes 의 manual create 블록에서 kind 화이트리스트 추출.
    const approvedNodesMatch = rulesText.match(
      /match\s+\/knowledgeApprovedNodes\/\{nodeId\}\s*\{[\s\S]*?allow\s+create:[\s\S]*?kind\s+in\s+\[([^\]]+)\]/,
    );
    expect(
      approvedNodesMatch,
      "firestore.rules 의 knowledgeApprovedNodes manual create 블록을 찾지 못함",
    ).not.toBeNull();

    const whitelistRaw = approvedNodesMatch![1];
    const whitelist = (whitelistRaw.match(/"([a-z_]+)"/g) ?? [])
      .map((s) => s.replace(/"/g, ""))
      .sort();

    // 정식 5 종 = unknown 제외.
    const expectedFormal = DEFAULT_ONTOLOGY_CLASSES.map((c) => c.id)
      .filter((id) => id !== "unknown")
      .sort();

    expect(
      whitelist,
      `rules 의 manual create kind 화이트리스트가 defaults 의 정식 클래스와 다름 (unknown 은 server-only). rules: ${whitelist.join(",")} / expected: ${expectedFormal.join(",")}`,
    ).toEqual(expectedFormal);
  });

  it("rules 의 manual create edge type 화이트리스트가 DEFAULT_ONTOLOGY_RELATIONS 와 일치", () => {
    const rulesText = readRepoFile("firestore.rules");
    const approvedEdgesMatch = rulesText.match(
      /match\s+\/knowledgeApprovedEdges\/\{edgeId\}\s*\{[\s\S]*?allow\s+create:[\s\S]*?type\s+in\s+\[([^\]]+)\]/,
    );
    expect(
      approvedEdgesMatch,
      "firestore.rules 의 knowledgeApprovedEdges manual create 블록을 찾지 못함",
    ).not.toBeNull();

    const whitelistRaw = approvedEdgesMatch![1];
    const whitelist = (whitelistRaw.match(/"([a-z_]+)"/g) ?? [])
      .map((s) => s.replace(/"/g, ""))
      .sort();
    const expectedRelations = DEFAULT_ONTOLOGY_RELATIONS.map((r) => r.id).sort();

    expect(
      whitelist,
      `rules 의 manual create edge type 화이트리스트가 defaults 의 7 관계와 다름. rules: ${whitelist.join(",")} / expected: ${expectedRelations.join(",")}`,
    ).toEqual(expectedRelations);
  });
});
