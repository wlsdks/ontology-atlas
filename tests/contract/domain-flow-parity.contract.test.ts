import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { deriveOntologyFromVault, resolveStaticVaultSource } from "@/entities/docs-vault";
import { resolveNodeAgentTarget } from "@/entities/knowledge-graph";
import { derivationToInsight } from "@/features/vault-ontology/model/use-ontology-insight";
import { buildOntologyMapGraph } from "@/views/home/lib/map-adapter";
import { buildDialModel, resolveDialAttention } from "@/widgets/ontology-map/dial/dial-model";
import type { DialModel } from "@/widgets/ontology-map/dial/types";
import {
  readContainmentTree,
  rollDirectedDomainFlows,
  rollDomainDependencies,
  rollRelatesDomainPairs,
  type TreeInputEdge,
  type TreeInputNode,
} from "@/widgets/ontology-map/model/containment-tree";
import { compileOntology } from "../../mcp/src/ontology-compiler.mjs";
import { queryCompiledOntology } from "../../mcp/src/ontology-engine.mjs";
import { parseFrontmatter } from "../../mcp/src/parser.mjs";
import { DOMAIN_FLOW_CASES } from "../fixtures/domain-flow-cases.mjs";

interface CompilerDoc {
  slug: string;
  frontmatter: Record<string, unknown>;
  mtime: number;
}

type Compiled = ReturnType<typeof compileOntology>;

interface MatrixRow {
  from: string;
  to: string;
  count: number;
}

const MAP_KINDS = new Set(["project", "domain", "capability", "element"]);

function loadDocs(dir: string, base = dir): CompilerDoc[] {
  const out: CompilerDoc[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...loadDocs(full, base));
      continue;
    }
    if (!entry.name.endsWith(".md")) continue;
    const { frontmatter } = parseFrontmatter(readFileSync(full, "utf8")) as { frontmatter: Record<string, unknown> };
    if (!frontmatter?.kind) continue;
    out.push({ slug: full.slice(base.length + 1).replace(/\.md$/, ""), frontmatter, mtime: 1 });
  }
  return out;
}

function matrixRows(compiled: Compiled, types: string[]): MatrixRow[] {
  const result = queryCompiledOntology(compiled, { operation: "domain_matrix", types, limit: 500 }) as {
    connections: { rows: MatrixRow[]; limited: boolean };
  };
  expect(result.connections.limited).toBe(false);
  return result.connections.rows;
}

function dialOf(nodes: readonly { id: string; label: string; kind: string }[], edges: readonly TreeInputEdge[]) {
  const treeNodes: TreeInputNode[] = nodes
    .filter((n) => MAP_KINDS.has(n.kind))
    .map((n) => ({ id: n.id, label: n.label, kind: n.kind as TreeInputNode["kind"] }));
  const tree = readContainmentTree(treeNodes, edges);
  const dependencies = rollDomainDependencies(tree, edges);
  const flows = rollDirectedDomainFlows(dependencies, rollRelatesDomainPairs(tree, edges));
  const elementIds = treeNodes.filter((n) => n.kind === "element").map((n) => n.id);
  return buildDialModel({ tree, dependencies, flows, elementIds });
}

function directedCounts(model: DialModel, name: (id: string) => string): Map<string, number> {
  const out = new Map<string, number>();
  for (const f of model.flows) {
    if (f.ab > 0) out.set(`${name(f.a)} > ${name(f.b)}`, f.ab);
    if (f.ba > 0) out.set(`${name(f.b)} > ${name(f.a)}`, f.ba);
  }
  return out;
}

const unordered = (x: string, y: string) => (x < y ? `${x} ~ ${y}` : `${y} ~ ${x}`);

function relatesOnlyPairs(model: DialModel, name: (id: string) => string): string[] {
  return model.flows.filter((f) => f.relatesOnly).map((f) => unordered(name(f.a), name(f.b))).sort();
}

function mcpRelatesOnly(dependsRows: MatrixRow[], relatesRows: MatrixRow[]): string[] {
  const dependent = new Set(dependsRows.map((r) => unordered(r.from, r.to)));
  return [...new Set(relatesRows.map((r) => unordered(r.from, r.to)))].filter((p) => !dependent.has(p)).sort();
}

function mcpDependents(dependsRows: MatrixRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of dependsRows) if (r.from !== r.to) out.set(r.to, (out.get(r.to) ?? 0) + 1);
  return out;
}

describe("domain flow case table (MCP compile vs map roll-up)", () => {
  for (const testCase of DOMAIN_FLOW_CASES) {
    describe(testCase.name, () => {
      const compiled = compileOntology(testCase.docs.map((d) => ({ ...d, mtime: 1 })));
      const depends = matrixRows(compiled, ["depends_on"]);
      const relates = matrixRows(compiled, ["relates"]);
      const model = dialOf(testCase.map.nodes, testCase.map.edges as TreeInputEdge[]);
      const side = (count: number | { mcp: number; map: number }, which: "mcp" | "map") =>
        typeof count === "number" ? count : count[which];
      const expected = (which: "mcp" | "map") =>
        new Map(testCase.expected.directed.map((r) => [`${r.from} > ${r.to}`, side(r.count, which)] as const));

      it("MCP domain_matrix rows equal the expected directed counts", () => {
        expect(new Map(depends.map((r) => [`${r.from} > ${r.to}`, r.count] as const))).toEqual(expected("mcp"));
      });

      it("the map roll-up equals the expected directed counts", () => {
        expect(directedCounts(model, (id) => id)).toEqual(expected("map"));
      });

      it("relates-only pairs agree", () => {
        const want = testCase.expected.relatesOnly.map(([a, b]) => unordered(a, b)).sort();
        expect(mcpRelatesOnly(depends, relates)).toEqual(want);
        expect(relatesOnlyPairs(model, (id) => id)).toEqual(want);
      });

      it("dependents agree", () => {
        expect(Object.fromEntries(model.dependents)).toEqual(testCase.expected.dependents);
        const mcp = mcpDependents(depends);
        for (const [id, count] of Object.entries(testCase.expected.dependents)) expect(mcp.get(id) ?? 0).toBe(count);
      });
    });
  }
});

const VAULTS = [
  { source: "dogfood" as const, root: "docs/ontology" },
  { source: "storefront" as const, root: "samples/storefront" },
];

describe.each(VAULTS)("$source vault: dial roll-ups equal domain_matrix and blast_radius", ({ source, root }) => {
  const compiled = compileOntology(loadDocs(join(process.cwd(), root)), { includeIndexes: true });
  const vault = resolveStaticVaultSource(source);
  const insight = derivationToInsight(deriveOntologyFromVault(vault.manifest), "en", {
    agentSlugPrefix: vault.agentSlugPrefix,
  });
  const refById = new Map<string, string | null>(insight.nodes.map((n) => [n.id, resolveNodeAgentTarget(n).ref] as const));
  const idByRef = new Map<string, string>();
  for (const [id, ref] of refById) if (ref !== null) idByRef.set(ref, id);
  const name = (id: string) => refById.get(id) ?? `unnamed:${id}`;
  const compiledSlugs = new Set(((compiled as { nodes: { slug: string }[] }).nodes).map((n) => n.slug));

  const graph = buildOntologyMapGraph(insight.nodes, insight.edges);
  const model = dialOf(graph.nodes, graph.edges);
  const depends = matrixRows(compiled, ["depends_on"]);
  const relates = matrixRows(compiled, ["relates"]);

  it("reads a vault with cross-domain dependencies", () => {
    expect(depends.length).toBeGreaterThan(0);
    expect(model.capabilityById.size).toBeGreaterThan(0);
  });

  it("every directed count equals the domain_matrix depends_on row", () => {
    expect(directedCounts(model, name)).toEqual(new Map(depends.map((r) => [`${r.from} > ${r.to}`, r.count] as const)));
  });

  it("relates-only pairs equal relates rows minus every pair with a dependency", () => {
    expect(relatesOnlyPairs(model, name)).toEqual(mcpRelatesOnly(depends, relates));
  });

  it("every dependents count equals the depends_on rows into that domain", () => {
    const mcp = mcpDependents(depends);
    const web = new Map([...model.dependents].map(([id, n]) => [name(id), n] as const));
    for (const ref of mcp.keys()) expect(web.has(ref)).toBe(true);
    for (const [ref, n] of web) expect([ref, n]).toEqual([ref, mcp.get(ref) ?? 0]);
  });

  function blastCaps(capabilityId: string, direction: "incoming" | "outgoing"): string[] {
    const capability = model.capabilityById.get(capabilityId)!;
    const caps = new Set<string>();
    for (const end of [capabilityId, ...capability.elementIds]) {
      const slug = refById.get(end);
      if (!slug || !compiledSlugs.has(slug)) continue;
      const result = queryCompiledOntology(compiled, { operation: "blast_radius", slug, direction, depth: 1, limit: 500 }) as {
        nodes: { rows: { slug: string }[]; limited: boolean };
      };
      expect(result.nodes.limited).toBe(false);
      for (const row of result.nodes.rows) {
        const id = idByRef.get(row.slug);
        const cap = id === undefined ? undefined : model.capabilityById.has(id) ? id : model.capabilityOf.get(id);
        if (cap !== undefined && cap !== capabilityId) caps.add(name(cap));
      }
    }
    return [...caps].sort();
  }

  it("each capability's usedByCaps and needsCaps equal the blast_radius capability roll-up", () => {
    const mismatches: string[] = [];
    for (const id of model.capabilityById.keys()) {
      const attention = resolveDialAttention(model, null, id);
      const usedBy = [...attention.usedByCaps].map(name).sort();
      const needs = [...attention.needsCaps].map(name).sort();
      const incoming = blastCaps(id, "incoming");
      const outgoing = blastCaps(id, "outgoing");
      if (usedBy.join() !== incoming.join()) mismatches.push(`${name(id)} usedBy ${usedBy.join(",")} vs ${incoming.join(",")}`);
      if (needs.join() !== outgoing.join()) mismatches.push(`${name(id)} needs ${needs.join(",")} vs ${outgoing.join(",")}`);
    }
    expect(mismatches).toEqual([]);
  });
});
