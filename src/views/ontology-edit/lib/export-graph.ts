import type { EphemeralNode } from "./use-ephemeral-nodes";
import type { EphemeralEdge } from "./use-ephemeral-edges";

/**
 * Graph interop exports — frontmatter markdown 외 학술/데이터-사이언스
 * 도구 (Gephi / Cytoscape / Protégé / 일반 RDF triplestore) 와 호환되는
 * 두 표준 포맷.
 *
 * - **JSON-LD** (`@context` + `@graph`) — RDF 1.1 호환, semantic web 도구가
 *   바로 읽음. ontology id 는 `urn:ontology-atlas:` URI scheme 으로 namespacing.
 * - **GraphML** — XML graph format, Gephi/Cytoscape 가 native 지원. 노드의
 *   kind / title 을 attribute 로, 엣지의 edgeType 을 label 로.
 *
 * mission v2: vault frontmatter 가 진실원이지만 다른 도구로의 export 는
 * 한 줄 conversion. AI agent 도 MCP 안 쓸 때 graphml import 해 ego graph
 * 외부 도구로 분석 가능.
 */

export interface GraphExportInput {
  ephemeralNodes: EphemeralNode[];
  ephemeralEdges: EphemeralEdge[];
}

const URN_BASE = 'urn:ontology-atlas';
const GRAPHML_GRAPH_ID = 'atlas';

/**
 * JSON-LD 1.1 — `@context` + `@graph`. 각 노드는 schema.org/Thing 의
 * subclass 처럼 model. edgeType 은 predicate 으로 직렬화.
 */
export function buildJsonLd(input: GraphExportInput): string {
  const { ephemeralNodes, ephemeralEdges } = input;

  const context = {
    '@vocab': 'https://schema.org/',
    oatlas: 'https://ontology-atlas.web.app/ns#',
    kind: 'oatlas:kind',
    title: 'oatlas:title',
    project: 'oatlas:project',
    domain: 'oatlas:domain',
    capability: 'oatlas:capability',
    element: 'oatlas:element',
    depends_on: { '@id': 'oatlas:dependsOn', '@type': '@id' },
    relates: { '@id': 'oatlas:relates', '@type': '@id' },
    contains: { '@id': 'oatlas:contains', '@type': '@id' },
    describes: { '@id': 'oatlas:describes', '@type': '@id' },
  };

  // node id → URI. ephemeral id 의 shortId 를 suffix 로 붙여 같은 title
  // 의 노드가 동일 URN 으로 collapse 되지 않게 보장 (JSON-LD silent merge
  // 회피 — GraphML 와 같은 dedup 정책).
  const nodeIdToUri = new Map<string, string>();
  for (const n of ephemeralNodes) {
    const slug = simpleSlug(n.title);
    nodeIdToUri.set(
      n.id,
      `${URN_BASE}:${n.kind}:${slug}-${shortId(n.id)}`,
    );
  }

  // 노드별로 outgoing edges 를 grouping 해 같은 객체 안에 predicate 으로 적재.
  const outgoingByNode = new Map<string, EphemeralEdge[]>();
  for (const e of ephemeralEdges) {
    const list = outgoingByNode.get(e.source) ?? [];
    list.push(e);
    outgoingByNode.set(e.source, list);
  }

  const graph = ephemeralNodes.map((n) => {
    const id = nodeIdToUri.get(n.id);
    if (!id) throw new Error(`Missing URI for node ${n.id}`);
    const out: Record<string, unknown> = {
      '@id': id,
      '@type': capitalize(n.kind),
      title: n.title,
      kind: n.kind,
    };
    const outgoing = outgoingByNode.get(n.id) ?? [];
    for (const e of outgoing) {
      const targetUri = nodeIdToUri.get(e.target);
      if (!targetUri) continue;
      const predicate = e.edgeType; // depends_on / relates / contains / describes
      const existing = out[predicate];
      if (Array.isArray(existing)) {
        existing.push({ '@id': targetUri });
      } else if (existing != null) {
        out[predicate] = [existing, { '@id': targetUri }];
      } else {
        out[predicate] = { '@id': targetUri };
      }
    }
    return out;
  });

  const doc = {
    '@context': context,
    '@graph': graph,
  };
  return JSON.stringify(doc, null, 2) + '\n';
}

/**
 * GraphML — Gephi/Cytoscape native 포맷. node attribute = kind / title,
 * edge attribute = edgeType.
 */
export function buildGraphML(input: GraphExportInput): string {
  const { ephemeralNodes, ephemeralEdges } = input;
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    '<graphml xmlns="http://graphml.graphdrawing.org/xmlns" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
      'xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns http://graphml.graphdrawing.org/xmlns/1.0/graphml.xsd">',
  );
  // attribute keys
  lines.push('  <key id="kind" for="node" attr.name="kind" attr.type="string"/>');
  lines.push('  <key id="title" for="node" attr.name="title" attr.type="string"/>');
  lines.push('  <key id="edgeType" for="edge" attr.name="edgeType" attr.type="string"/>');
  lines.push(`  <graph id="${GRAPHML_GRAPH_ID}" edgedefault="directed">`);

  for (const n of ephemeralNodes) {
    const slug = simpleSlug(n.title);
    const id = `${n.kind}_${slug}_${shortId(n.id)}`;
    lines.push(`    <node id="${escapeXml(id)}">`);
    lines.push(`      <data key="kind">${escapeXml(n.kind)}</data>`);
    lines.push(`      <data key="title">${escapeXml(n.title)}</data>`);
    lines.push('    </node>');
  }

  // edges — node id 를 동일 algorithm 으로 재계산
  const idToGraphmlId = new Map<string, string>();
  for (const n of ephemeralNodes) {
    const slug = simpleSlug(n.title);
    idToGraphmlId.set(n.id, `${n.kind}_${slug}_${shortId(n.id)}`);
  }
  let edgeIdx = 0;
  for (const e of ephemeralEdges) {
    const src = idToGraphmlId.get(e.source);
    const dst = idToGraphmlId.get(e.target);
    if (!src || !dst) continue;
    lines.push(
      `    <edge id="e${edgeIdx}" source="${escapeXml(src)}" target="${escapeXml(dst)}">`,
    );
    lines.push(`      <data key="edgeType">${escapeXml(e.edgeType)}</data>`);
    lines.push('    </edge>');
    edgeIdx += 1;
  }

  lines.push('  </graph>');
  lines.push('</graphml>');
  return lines.join('\n') + '\n';
}

export function downloadJsonLd(input: GraphExportInput): void {
  if (typeof window === 'undefined') return;
  const text = buildJsonLd(input);
  download(text, `atlas-${stamp()}.jsonld`, 'application/ld+json');
}

export function downloadGraphML(input: GraphExportInput): void {
  if (typeof window === 'undefined') return;
  const text = buildGraphML(input);
  download(text, `atlas-${stamp()}.graphml`, 'application/xml');
}

function download(text: string, filename: string, mime: string): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
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
      .replace(/[^a-z0-9가-힣\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 32) || 'node'
  );
}

function shortId(id: string): string {
  // ephemeral id 는 nanoid-style — 앞 8 자만 남겨 GraphML id 충돌 방지.
  return id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 8);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stamp(): string {
  return new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
}
