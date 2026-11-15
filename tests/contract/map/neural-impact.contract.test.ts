import { describe, expect, it } from "vitest";
import { resolveStaticVaultSource } from "@/entities/docs-vault";
import { deriveOntologyFromVault } from "@/entities/docs-vault/lib/derive-ontology-from-vault";
import type { VaultDoc, VaultManifest } from "@/entities/docs-vault/model/types";
import { derivationToInsight } from "@/features/vault-ontology/model/use-ontology-insight";
import { buildOntologyMapGraph } from "@/views/home/lib/map-canvas/map-adapter";
import { neuralImpactOfMapEdges } from "@/widgets/ontology-map";
import { compileOntology } from "../../../mcp/src/ontology-compiler.mjs";
import { queryCompiledOntology } from "../../../mcp/src/ontology-engine.mjs";
import { NEURAL_IMPACT_CASES } from "../../fixtures/neural-impact-cases.mjs";

/**
 * A person selecting a concept in Neural and an agent asking MCP's `impact` must be told the same
 * concepts at the same distances: one table runs through both, each from the same frontmatter.
 */

/** Deep enough that no case is cut short. */
const MCP_DEPTH = 10;

function manifestOf(docs: readonly { slug: string; frontmatter: Record<string, unknown> }[]): VaultManifest {
  const vaultDocs: VaultDoc[] = docs.map(({ slug, frontmatter }) => ({
    slug,
    path: `${slug}.md`,
    title: slug,
    tags: [],
    frontmatter,
    headings: [],
    excerpt: "",
    wordCount: 0,
    updatedAt: "2026-04-01T00:00:00.000Z",
    linksOut: [],
  }));
  return { version: "2026-04-23", generatedAt: "2026-04-23T00:00:00.000Z", docs: vaultDocs, backlinksDetail: {}, tags: {}, tree: { name: "root", path: "", type: "dir" } };
}

type CaseDocs = readonly { slug: string; frontmatter: Record<string, unknown> }[];

function mapImpactOf(docs: CaseDocs) {
  const insight = derivationToInsight(deriveOntologyFromVault(manifestOf(docs)), "en");
  const slugOf = new Map(insight.nodes.map((node) => [node.id, node.agentSlug] as const));
  const graph = buildOntologyMapGraph(insight.nodes, insight.edges);
  return (center: string): Record<string, number> => {
    const centerId = insight.nodes.find((node) => node.agentSlug === center)?.id;
    expect(centerId, `${center} is not on the map`).toBeDefined();
    const impact = neuralImpactOfMapEdges(graph.edges, centerId!);
    return Object.fromEntries([...impact.distance].map(([id, distance]) => [slugOf.get(id) ?? `unnamed:${id}`, distance]));
  };
}

function mcpImpactOf(docs: CaseDocs) {
  const compiled = compileOntology(docs.map((doc) => ({ ...doc, mtime: 1 })));
  return (center: string) => mcpImpact(compiled, center);
}

function mcpImpact(compiled: ReturnType<typeof compileOntology>, center: string): Record<string, number> {
  const result = queryCompiledOntology(compiled, { operation: "impact", slug: center, direction: "incoming", depth: MCP_DEPTH, limit: 500 }) as {
    limited: boolean;
    nodes: { slug: string; distance: number }[];
  };
  expect(result.limited).toBe(false);
  return Object.fromEntries(result.nodes.map((row) => [row.slug, row.distance]));
}

describe("impact case table (Neural vs MCP impact)", () => {
  for (const testCase of NEURAL_IMPACT_CASES) {
    describe(testCase.name, () => {
      it("Neural's impact distances equal the expected ones", () => {
        expect(mapImpactOf(testCase.docs)(testCase.center)).toEqual(testCase.expected);
      });

      it("MCP impact, incoming, equals the expected ones", () => {
        expect(mcpImpactOf(testCase.docs)(testCase.center)).toEqual(testCase.expected);
      });
    });
  }
});

describe("dogfood vault: every concept's impact agrees", () => {
  const docs = resolveStaticVaultSource("dogfood").manifest.docs
    .filter((doc) => typeof doc.frontmatter.kind === "string")
    .map((doc) => ({ slug: doc.slug, frontmatter: doc.frontmatter }));
  const onMap = mapImpactOf(docs);
  const viaMcp = mcpImpactOf(docs);
  const centers = docs.filter((doc) => doc.frontmatter.kind === "capability" || doc.frontmatter.kind === "element").map((doc) => doc.slug);

  it("reads a vault where some impact reaches three distances", () => {
    expect(centers.some((slug) => Object.values(viaMcp(slug)).some((distance) => distance >= 3))).toBe(true);
  });

  it("gives every capability and element the same impact on the map as over MCP", () => {
    const differ = centers.filter((slug) => JSON.stringify(Object.entries(onMap(slug)).sort()) !== JSON.stringify(Object.entries(viaMcp(slug)).sort()));
    expect(differ).toEqual([]);
  });
});
