import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveStaticVaultSource } from "@/entities/docs-vault";
import { deriveOntologyFromVault } from "@/entities/docs-vault/lib/derive-ontology-from-vault";
import type { VaultDoc, VaultManifest } from "@/entities/docs-vault/model/vault-manifest";
import { derivationToInsight } from "@/features/vault-ontology/model/use-ontology-insight";
import { buildOntologyMapGraph } from "@/views/home/lib/map-canvas/map-adapter";
import { neuralImpactOfMapEdges } from "@/widgets/ontology-map";
import { buildMarkdown } from "@/shared/lib/vault-document/frontmatter-codec.mjs";
import { NEURAL_IMPACT_CASES } from "../../fixtures/neural-impact-cases.mjs";
import { callServerTools } from "../server-session/call-server-tool";

/**
 * A person selecting a concept in Neural and an agent asking the server's `impact` must be told the
 * same concepts at the same distances: one table runs through both, each from the same frontmatter,
 * and the server is asked over stdio.
 */

/**
 * The comparison holds at a covering depth and limit: the server's default call stops at depth 2 and
 * 100 results, while Neural lights the whole reach. 10 and 500 cover every case and the dogfood vault.
 */
const SERVER_DEPTH = 10;

function manifestOf(docs: readonly { slug: string; frontmatter: Record<string, unknown> }[]): VaultManifest {
  const vaultDocs: VaultDoc[] = docs.map(({ slug, frontmatter }) => ({
    slug,
    path: `${slug}.md`,
    title: slug,
    tags: [],
    frontmatter,
    updatedAt: "2026-04-01T00:00:00.000Z",
    linksOut: [],
  }));
  return { version: "2026-04-23", generatedAt: "2026-04-23T00:00:00.000Z", docs: vaultDocs, backlinkSources: {}, tags: {}, tree: { name: "root", path: "", type: "dir" } };
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

/** The incoming impact of each center, asked of a vault folder in one server session. */
async function serverImpactsOf(vault: string, centers: readonly string[]): Promise<Map<string, Record<string, number>>> {
  const answers = await callServerTools(
    vault,
    centers.map((center) => ({
      name: "query_ontology",
      arguments: { operation: "impact", slug: center, direction: "incoming", depth: SERVER_DEPTH, limit: 500 },
    })),
  );
  return new Map(
    centers.map((center, index) => {
      const answer = answers[index];
      expect(answer.isError, `${center}: ${String(answer.value)}`).toBe(false);
      const result = answer.value as { limited: boolean; nodes: { slug: string; distance: number }[] };
      expect(result.limited).toBe(false);
      return [center, Object.fromEntries(result.nodes.map((row) => [row.slug, row.distance]))] as const;
    }),
  );
}

function writeVault(vault: string, docs: CaseDocs) {
  for (const { slug, frontmatter } of docs) {
    const file = join(vault, `${slug}.md`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, buildMarkdown({ frontmatter, body: `${slug}.` }));
  }
}

describe("impact case table (Neural vs the server's impact)", () => {
  for (const testCase of NEURAL_IMPACT_CASES) {
    describe(testCase.name, () => {
      it("Neural's impact distances equal the expected ones", () => {
        expect(mapImpactOf(testCase.docs)(testCase.center)).toEqual(testCase.expected);
      });

      it("the server's impact, incoming, equals the expected ones", async () => {
        const vault = mkdtempSync(join(tmpdir(), "atlas-neural-impact-"));
        try {
          writeVault(vault, testCase.docs);
          const impacts = await serverImpactsOf(vault, [testCase.center]);
          expect(impacts.get(testCase.center)).toEqual(testCase.expected);
        } finally {
          rmSync(vault, { recursive: true, force: true });
        }
      }, 30_000);
    });
  }
});

describe("dogfood vault: every concept's impact agrees", () => {
  const docs = resolveStaticVaultSource("dogfood").manifest.docs
    .filter((doc) => typeof doc.frontmatter.kind === "string")
    .map((doc) => ({ slug: doc.slug, frontmatter: doc.frontmatter }));
  const onMap = mapImpactOf(docs);
  const centers = docs.filter((doc) => doc.frontmatter.kind === "capability" || doc.frontmatter.kind === "element").map((doc) => doc.slug);
  let viaServer = new Map<string, Record<string, number>>();

  /** The bundled sample names its documents under `ontology/`; the folder the server reads does not. */
  const inFolder = (slug: string) => slug.replace(/^ontology\//, "");
  const withFolderNames = (impact: Record<string, number>) =>
    Object.fromEntries(Object.entries(impact).map(([slug, distance]) => [inFolder(slug), distance]));

  beforeAll(async () => {
    viaServer = await serverImpactsOf(join(process.cwd(), "docs/ontology"), centers.map(inFolder));
  }, 120_000);

  it("reads a vault where some impact reaches three distances", () => {
    expect(centers.some((slug) => Object.values(viaServer.get(inFolder(slug)) ?? {}).some((distance) => distance >= 3))).toBe(true);
  });

  it("gives every capability and element the same impact on the map as over the server", () => {
    const differ = centers.filter((slug) => JSON.stringify(Object.entries(withFolderNames(onMap(slug))).sort()) !== JSON.stringify(Object.entries(viaServer.get(inFolder(slug)) ?? {}).sort()));
    expect(differ).toEqual([]);
  });
});
