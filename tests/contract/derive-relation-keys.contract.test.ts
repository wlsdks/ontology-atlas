import { describe, expect, it } from "vitest";
import { DEPENDS_UNION_CASE, RELATION_KEY_CASES } from "../fixtures/relation-keys-cases.mjs";
import { deriveOntologyFromVault } from "@/entities/docs-vault/lib/derive-ontology-from-vault";
import type { VaultDoc, VaultManifest } from "@/entities/docs-vault/model/types";
// MCP 는 정본 (읽기 전용) — 웹이 이쪽을 따라간다.
import { GRAPH_ARRAY_KEYS, collectNeighborRefs } from "../../mcp/src/vault.mjs";

/**
 * 2-way 계약 — 관계 키를 읽는 곳이 두 패키지에 산다:
 *   - mcp/src/vault.mjs (AI agent surface — 정본, GRAPH_ARRAY_KEYS)
 *   - src/entities/docs-vault/lib/derive-ontology-from-vault.ts (웹 지도·공방·인사이트)
 *
 * 웹 derive 가 MCP 의 관계 키 하나를 안 읽으면, 에이전트가 정본 키로 쓴
 * 관계가 사람 화면에서 소실된다 — describes(2026-07-27) 와 depends_on
 * (2026-08-12) 이 정확히 그렇게 새어 나갔다. 같은 fixture 표
 * (`tests/fixtures/relation-keys-cases.mjs`) 를 양쪽에 넣어 대조한다.
 */

function makeDoc(slug: string, frontmatter: Record<string, unknown>): VaultDoc {
  return {
    slug,
    path: `${slug}.md`,
    title: slug,
    description: undefined,
    tags: [],
    frontmatter,
    headings: [],
    excerpt: "",
    wordCount: 0,
    updatedAt: "2026-04-01T00:00:00.000Z",
    linksOut: [],
  };
}

function makeManifest(docs: VaultDoc[]): VaultManifest {
  return {
    version: "2026-04-23",
    generatedAt: new Date().toISOString(),
    docs,
    backlinksDetail: {},
    tags: {},
    tree: { name: "root", path: "", type: "dir" },
  };
}

describe("relation-keys contract — 웹 derive 가 MCP 관계 키를 전부 읽는다", () => {
  it("fixture 표가 MCP GRAPH_ARRAY_KEYS 전집합을 덮는다 (새 키 → 즉시 fail)", () => {
    const fixtureKeys = RELATION_KEY_CASES.map((c) => c.key).sort();
    const mcpKeys = [...GRAPH_ARRAY_KEYS].sort();
    expect(fixtureKeys).toEqual(mcpKeys);
  });

  // 공회전 방지 — 표가 비어 있으면 아래 루프는 아무것도 증명하지 않는다.
  it("fixture 표는 공집합이 아니다", () => {
    expect(RELATION_KEY_CASES.length).toBeGreaterThanOrEqual(9);
  });

  for (const c of RELATION_KEY_CASES) {
    describe(`key: ${c.key}`, () => {
      it("MCP collectNeighborRefs 가 이 키를 읽는다", () => {
        const refs = collectNeighborRefs({ frontmatter: c.frontmatter }) as {
          key: string;
          ref: string;
        }[];
        expect(refs.length).toBeGreaterThanOrEqual(1);
      });

      it("웹 derive 가 같은 키에서 엣지를 만든다", () => {
        const result = deriveOntologyFromVault(
          makeManifest([makeDoc(`fixtures/${c.key}-case`, c.frontmatter)]),
        );
        const matched = result.edges.filter((e) => e.type === c.expectedEdgeType);
        expect(matched.length).toBeGreaterThanOrEqual(1);
      });
    });
  }

  describe("relation array 스칼라 거절 — 웹이 컴파일러보다 관계를 더 만들지 않는다", () => {
    for (const c of RELATION_KEY_CASES) {
      const sourceFrontmatter = c.frontmatter as Record<string, unknown>;
      const scalar = (sourceFrontmatter[c.key] as string[])[0];
      const frontmatter = { ...sourceFrontmatter, [c.key]: scalar };

      it(`MCP: ${c.key} 스칼라를 관계로 읽지 않는다`, () => {
        const refs = collectNeighborRefs({ frontmatter }) as { key: string; ref: string }[];
        expect(refs.filter((ref) => ref.key === c.key)).toEqual([]);
      });

      it(`웹 derive: ${c.key} 스칼라를 엣지로 만들지 않는다`, () => {
        const result = deriveOntologyFromVault(
          makeManifest([makeDoc(`fixtures/${c.key}-scalar`, frontmatter)]),
        );
        expect(result.edges.filter((edge) => edge.type === c.expectedEdgeType)).toEqual([]);
      });
    }
  });

  describe("dependencies + depends_on 합집합 — 같은 대상은 한 번만", () => {
    it("MCP: canonical dependencies ref 3개", () => {
      const refs = collectNeighborRefs({ frontmatter: DEPENDS_UNION_CASE.frontmatter }) as {
        key: string;
        ref: string;
      }[];
      const depRefs = refs.filter((r) => r.key === "dependencies").map((r) => r.ref);
      expect(depRefs.sort()).toEqual(DEPENDS_UNION_CASE.expectedRefs);
    });

    it("웹 derive: depends_on 엣지 3개", () => {
      const result = deriveOntologyFromVault(
        makeManifest([makeDoc("capabilities/union-case", DEPENDS_UNION_CASE.frontmatter)]),
      );
      const targets = result.edges
        .filter((e) => e.type === "depends_on")
        .map((e) => e.to.split(":").at(-1))
        .sort();
      expect(targets).toEqual(DEPENDS_UNION_CASE.expectedRefs);
    });
  });
});
