import { describe, expect, it } from "vitest";
import { DEPENDS_UNION_CASE, RELATION_KEY_CASES } from "../../fixtures/relation-keys-cases.mjs";
import { deriveOntologyFromVault } from "@/entities/docs-vault/lib/derive-ontology-from-vault";
import type { VaultDoc, VaultManifest } from "@/entities/docs-vault/model/types";
// MCP is canonical (read-only) — the web follows it.
import { GRAPH_ARRAY_KEYS, collectNeighborRefs } from "../../../mcp/src/vault/relation-refs.mjs";

/**
 * Relation keys are read in `mcp/src/vault/` (canonical) and in
 * `src/entities/docs-vault/lib/derive-ontology-from-vault.ts` (web). A key the web misses is lost
 * on the human screen; one fixture table (`tests/fixtures/relation-keys-cases.mjs`) feeds both.
 */

function makeDoc(slug: string, frontmatter: Record<string, unknown>): VaultDoc {
  return {
    slug,
    path: `${slug}.md`,
    title: slug,
    description: undefined,
    tags: [],
    frontmatter,
    updatedAt: "2026-04-01T00:00:00.000Z",
    linksOut: [],
  };
}

function makeManifest(docs: VaultDoc[]): VaultManifest {
  return {
    version: "2026-04-23",
    generatedAt: new Date().toISOString(),
    docs,
    backlinkSources: {},
    tags: {},
    tree: { name: "root", path: "", type: "dir" },
  };
}

describe("relation-keys contract — the web derive reads every MCP relation key", () => {
  it("the fixture table covers the full set of MCP GRAPH_ARRAY_KEYS (a new key fails at once)", () => {
    const fixtureKeys = RELATION_KEY_CASES.map((c) => c.key).sort();
    const mcpKeys = [...GRAPH_ARRAY_KEYS].sort();
    expect(fixtureKeys).toEqual(mcpKeys);
  });

  // Idling guard — with an empty table the loop below proves nothing.
  it("the fixture table is not an empty set", () => {
    expect(RELATION_KEY_CASES.length).toBeGreaterThanOrEqual(9);
  });

  for (const c of RELATION_KEY_CASES) {
    describe(`key: ${c.key}`, () => {
      it("MCP collectNeighborRefs reads this key", () => {
        const refs = collectNeighborRefs({ frontmatter: c.frontmatter }) as {
          key: string;
          ref: string;
        }[];
        expect(refs.length).toBeGreaterThanOrEqual(1);
      });

      it("the web derive builds an edge from the same key", () => {
        const result = deriveOntologyFromVault(
          makeManifest([makeDoc(`fixtures/${c.key}-case`, c.frontmatter)]),
        );
        const matched = result.edges.filter((e) => e.type === c.expectedEdgeType);
        expect(matched.length).toBeGreaterThanOrEqual(1);
      });
    });
  }

  describe("relation array scalar rejection — the web never builds more relations than the compiler", () => {
    for (const c of RELATION_KEY_CASES) {
      const sourceFrontmatter = c.frontmatter as Record<string, unknown>;
      const scalar = (sourceFrontmatter[c.key] as string[])[0];
      const frontmatter = { ...sourceFrontmatter, [c.key]: scalar };

      it(`MCP: does not read a ${c.key} scalar as a relation`, () => {
        const refs = collectNeighborRefs({ frontmatter }) as { key: string; ref: string }[];
        expect(refs.filter((ref) => ref.key === c.key)).toEqual([]);
      });

      it(`web derive: does not build an edge from a ${c.key} scalar`, () => {
        const result = deriveOntologyFromVault(
          makeManifest([makeDoc(`fixtures/${c.key}-scalar`, frontmatter)]),
        );
        expect(result.edges.filter((edge) => edge.type === c.expectedEdgeType)).toEqual([]);
      });
    }
  });

  describe("dependencies + depends_on union — the same target only once", () => {
    it("MCP: 3 canonical dependencies refs", () => {
      const refs = collectNeighborRefs({ frontmatter: DEPENDS_UNION_CASE.frontmatter }) as {
        key: string;
        ref: string;
      }[];
      const depRefs = refs.filter((r) => r.key === "dependencies").map((r) => r.ref);
      expect(depRefs.sort()).toEqual(DEPENDS_UNION_CASE.expectedRefs);
    });

    it("web derive: 3 depends_on edges", () => {
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
