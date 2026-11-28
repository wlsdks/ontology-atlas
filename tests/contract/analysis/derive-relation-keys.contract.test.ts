import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEPENDS_UNION_CASE, RELATION_KEY_CASES } from "../../fixtures/relation-keys-cases.mjs";
import { deriveOntologyFromVault } from "@/entities/docs-vault/lib/derive-ontology-from-vault";
import type { VaultDoc, VaultManifest } from "@/entities/docs-vault/model/vault-manifest";

/**
 * Relation keys are read by the MCP server (`GRAPH_ARRAY_KEYS` in
 * `src-tauri/crates/vault-document/src/schema.rs`, canonical) and in
 * `src/entities/docs-vault/lib/derive-ontology-from-vault.ts` (web). A key the web misses is lost
 * on the human screen; the fixture table `tests/fixtures/relation-keys-cases.mjs` states one case
 * per server key and the web derive is run on each.
 */

const serverSchema = readFileSync(
  resolve(__dirname, "../../../src-tauri/crates/vault-document/src/schema.rs"),
  "utf8",
);
const serverGraphKeys = [
  ...(/pub const GRAPH_ARRAY_KEYS: \[&str; \d+\] = \[([^\]]+)\]/.exec(serverSchema)?.[1] ?? "").matchAll(/"([a-z_]+)"/g),
].map((match) => match[1]);

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

describe("relation-keys contract — the web derive reads every server relation key", () => {
  it("the fixture table covers the full set of the server's GRAPH_ARRAY_KEYS (a new key fails at once)", () => {
    const fixtureKeys = RELATION_KEY_CASES.map((c) => c.key).sort();
    expect(serverGraphKeys.length).toBeGreaterThanOrEqual(9);
    expect(fixtureKeys).toEqual([...serverGraphKeys].sort());
  });

  // Idling guard — with an empty table the loop below proves nothing.
  it("the fixture table is not an empty set", () => {
    expect(RELATION_KEY_CASES.length).toBeGreaterThanOrEqual(9);
  });

  for (const c of RELATION_KEY_CASES) {
    describe(`key: ${c.key}`, () => {
      it("the web derive builds an edge from the same key", () => {
        const result = deriveOntologyFromVault(
          makeManifest([makeDoc(`fixtures/${c.key}-case`, c.frontmatter)]),
        );
        const matched = result.edges.filter((e) => e.type === c.expectedEdgeType);
        expect(matched.length).toBeGreaterThanOrEqual(1);
      });
    });
  }

  describe("relation array scalar rejection — the web never builds more relations than the server compiles", () => {
    for (const c of RELATION_KEY_CASES) {
      const sourceFrontmatter = c.frontmatter as Record<string, unknown>;
      const scalar = (sourceFrontmatter[c.key] as string[])[0];
      const frontmatter = { ...sourceFrontmatter, [c.key]: scalar };

      it(`web derive: does not build an edge from a ${c.key} scalar`, () => {
        const result = deriveOntologyFromVault(
          makeManifest([makeDoc(`fixtures/${c.key}-scalar`, frontmatter)]),
        );
        expect(result.edges.filter((edge) => edge.type === c.expectedEdgeType)).toEqual([]);
      });
    }
  });

  describe("dependencies + depends_on union — the same target only once", () => {
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
