import type { EphemeralNode } from "./use-ephemeral-nodes";
import type { EphemeralEdge } from "./use-ephemeral-edges";
import {
  buildGraphML as buildGraphMLShared,
  buildJsonLd as buildJsonLdShared,
  type InteropGraph,
} from "@/shared/lib/interop-format";

/**
 * Graph interop exports — frontmatter markdown 외 학술/데이터-사이언스
 * 도구 (Gephi / Cytoscape / Protégé / 일반 RDF triplestore) 와 호환되는
 * 두 표준 포맷 (JSON-LD 1.1 · GraphML).
 *
 * 직렬화 로직 자체는 `@/shared/lib/interop-format` 의 순수 함수가 담당한다 —
 * CLI (`ontology-atlas export`) 와 같은 코드다. 웹 ERD 빌더의 ephemeral 노드는
 * vault slug 이 없으므로, 이 어댑터가 title → slug 로 환원하고 (중복 title 은
 * `-2`, `-3` 으로 disambiguate) compile 아티팩트 shape 으로 변환한 뒤 공유
 * serializer 로 넘긴다. 노드 URN 은 vault slug 기반: `urn:ontology-atlas:<kind>:<slug>`.
 *
 * `tests/contract/interop-format.contract.test.ts` 가 웹/CLI serializer drift 를
 * 차단한다.
 */

export interface GraphExportInput {
  ephemeralNodes: EphemeralNode[];
  ephemeralEdges: EphemeralEdge[];
}

// ephemeral edgeType → compiler `via` 키. v1 웹 빌더는 'related_to' 하나만
// 만들고, 그래프 스키마의 canonical 약결합 키는 'relates' 다.
const EDGE_TYPE_TO_VIA: Record<string, string> = {
  related_to: "relates",
};

/**
 * ephemeral 노드/엣지 → compile 아티팩트 shape (`InteropGraph`). ephemeral id
 * 는 vault slug 이 아니므로 title 에서 slug 를 파생하고, 같은 slug 이 이미
 * 쓰였으면 suffix 로 disambiguate 해 서로 다른 URN 을 보장한다 (silent merge
 * 회피).
 */
function toInteropGraph(input: GraphExportInput): InteropGraph {
  const { ephemeralNodes, ephemeralEdges } = input;
  const idToSlug = new Map<string, string>();
  const usedSlugs = new Set<string>();
  const nodes = ephemeralNodes.map((n) => {
    let slug = simpleSlug(n.title);
    let candidate = slug;
    let suffix = 2;
    while (usedSlugs.has(candidate)) {
      candidate = `${slug}-${suffix}`;
      suffix += 1;
    }
    slug = candidate;
    usedSlugs.add(slug);
    idToSlug.set(n.id, slug);
    return { slug, kind: n.kind, title: n.title };
  });

  const edges = ephemeralEdges
    .map((e) => {
      const from = idToSlug.get(e.source);
      const to = idToSlug.get(e.target);
      if (!from || !to) return null;
      return { from, to, via: EDGE_TYPE_TO_VIA[e.edgeType] ?? e.edgeType };
    })
    .filter((e): e is { from: string; to: string; via: string } => e !== null);

  return { nodes, edges };
}

export function buildJsonLd(input: GraphExportInput): string {
  return buildJsonLdShared(toInteropGraph(input));
}

export function buildGraphML(input: GraphExportInput): string {
  return buildGraphMLShared(toInteropGraph(input));
}

export function downloadJsonLd(input: GraphExportInput): void {
  if (typeof window === "undefined") return;
  download(buildJsonLd(input), `atlas-${stamp()}.jsonld`, "application/ld+json");
}

export function downloadGraphML(input: GraphExportInput): void {
  if (typeof window === "undefined") return;
  download(buildGraphML(input), `atlas-${stamp()}.graphml`, "application/xml");
}

function download(text: string, filename: string, mime: string): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function simpleSlug(input: string): string {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9가-힣\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 32) || "node"
  );
}

function stamp(): string {
  return new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
}
