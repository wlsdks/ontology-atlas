/**
 * Node identity is `urn:uuid:<uid>`, so renaming a slug mints no new identity. Mirror of
 * `cli/src/lib/export-format/interop-format.mjs`: `interop-format.contract.test.ts` requires
 * byte-identical output, so change both. Edges are sorted, and an edge whose ends were not both
 * emitted is dropped rather than inventing nodes.
 */

const INTEROP_URN_BASE = 'urn:uuid';
export const INTEROP_SCHEMA_VERSION = 2;

const OATLAS_NS = 'https://wlsdks.github.io/ontology-atlas/ns#';
const GRAPHML_GRAPH_ID = 'atlas';
const NODE_UID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

interface InteropNode {
  uid: string;
  slug: string;
  kind: string;
  title: string;
  domain?: string;
}

interface InteropEdge {
  from: string;
  to: string;
  via: string;
}

export interface InteropGraph {
  nodes: InteropNode[];
  edges: InteropEdge[];
}

/**
 * Every graph edge key the compiler can emit as `via`, mapped to its oatlas predicate term; keep in
 * sync with `mcp/src/vault/` NEIGHBOR_KEYS + INLINE_NEIGHBOR_KEYS. An unknown `via` becomes
 * `oatlas:<via>` so no edge type is dropped silently.
 */
const VIA_PREDICATE: Record<string, string> = {
  domains: 'domains',
  capabilities: 'capabilities',
  elements: 'elements',
  dependencies: 'dependsOn',
  relates: 'relates',
  contains: 'contains',
  describes: 'describes',
  domain: 'domain',
};

export function nodeUrn(uid: string): string {
  if (!NODE_UID_RE.test(uid)) {
    throw new Error('Interop URN requires a valid lowercase UUIDv4 `uid`.');
  }
  return `${INTEROP_URN_BASE}:${uid}`;
}

function predicateTerm(via: string): string {
  return VIA_PREDICATE[via] || String(via);
}

interface NormalNode {
  uid: string;
  slug: string;
  kind: string;
  title: string;
  domain?: string;
}

function normalizeGraph(graph: InteropGraph): {
  nodes: NormalNode[];
  nodeBySlug: Map<string, NormalNode>;
  edges: InteropEdge[];
} {
  const rawNodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const rawEdges = Array.isArray(graph?.edges) ? graph.edges : [];

  const nodeBySlug = new Map<string, NormalNode>();
  const slugByUid = new Map<string, string>();
  for (const n of rawNodes) {
    const slug = typeof n?.slug === 'string' ? n.slug.trim() : '';
    const uid = typeof n?.uid === 'string' ? n.uid.trim() : '';
    if (!NODE_UID_RE.test(uid)) {
      throw new Error(
        `Interop graph node "${slug || '<unknown>'}" requires a valid lowercase UUIDv4 \`uid\`.`,
      );
    }
    if (!slug || nodeBySlug.has(slug)) continue;
    const priorSlug = slugByUid.get(uid);
    if (priorSlug && priorSlug !== slug) {
      throw new Error(`Interop graph UID "${uid}" is shared by "${priorSlug}" and "${slug}".`);
    }
    slugByUid.set(uid, slug);
    nodeBySlug.set(slug, {
      uid,
      slug,
      kind: typeof n.kind === 'string' && n.kind.trim() ? n.kind.trim() : 'node',
      title: typeof n.title === 'string' && n.title !== '' ? n.title : slug,
      domain:
        typeof n.domain === 'string' && n.domain.trim() ? n.domain.trim() : undefined,
    });
  }

  const nodes = [...nodeBySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));

  const seenEdge = new Set<string>();
  const edges: InteropEdge[] = [];
  for (const e of rawEdges) {
    const from = typeof e?.from === 'string' ? e.from.trim() : '';
    const to = typeof e?.to === 'string' ? e.to.trim() : '';
    const via = typeof e?.via === 'string' && e.via.trim() ? e.via.trim() : '';
    if (!from || !to || !via) continue;
    if (!nodeBySlug.has(from) || !nodeBySlug.has(to)) continue;
    // No separator: this file and `cli/src/lib/export-format/interop-format.mjs` must produce the same output for the
    // same input, and a space separator is ambiguous. `JSON.stringify` avoids both problems.
    const key = JSON.stringify([from, via, to]);
    if (seenEdge.has(key)) continue;
    seenEdge.add(key);
    edges.push({ from, to, via });
  }
  // Compare field by field. Running localeCompare over a concatenated string is unsafe
  // because some collations ignore the separator; comparing per field states the intended
  // field priority exactly.
  edges.sort(
    (a, b) =>
      a.from.localeCompare(b.from) ||
      a.via.localeCompare(b.via) ||
      a.to.localeCompare(b.to),
  );

  return { nodes, nodeBySlug, edges };
}

/** JSON-LD 1.1 (`@context` + `@graph`); RDF 1.1 tools read it directly. */
export function buildJsonLd(graph: InteropGraph): string {
  const { nodes, nodeBySlug, edges } = normalizeGraph(graph);

  const context: Record<string, unknown> = {
    '@vocab': 'https://schema.org/',
    oatlas: OATLAS_NS,
    uid: 'oatlas:uid',
    slug: 'oatlas:slug',
    kind: 'oatlas:kind',
    title: 'oatlas:title',
    domain: 'oatlas:domain',
  };
  const usedVias = [...new Set(edges.map((e) => e.via))].sort();
  for (const via of usedVias) {
    context[predicateTerm(via)] = {
      '@id': `oatlas:${predicateTerm(via)}`,
      '@type': '@id',
    };
  }

  const outgoing = new Map<string, InteropEdge[]>();
  for (const e of edges) {
    const list = outgoing.get(e.from) ?? [];
    list.push(e);
    outgoing.set(e.from, list);
  }

  const graphNodes = nodes.map((n) => {
    const node: Record<string, unknown> = {
      '@id': nodeUrn(n.uid),
      '@type': capitalize(n.kind),
      uid: n.uid,
      slug: n.slug,
      kind: n.kind,
      title: n.title,
    };
    if (n.domain !== undefined) node.domain = n.domain;
    for (const e of outgoing.get(n.slug) ?? []) {
      const target = nodeBySlug.get(e.to)!;
      const targetUri = nodeUrn(target.uid);
      const term = predicateTerm(e.via);
      const existing = node[term];
      if (Array.isArray(existing)) existing.push({ '@id': targetUri });
      else if (existing != null) node[term] = [existing, { '@id': targetUri }];
      else node[term] = { '@id': targetUri };
    }
    return node;
  });

  return JSON.stringify({ '@context': context, '@graph': graphNodes }, null, 2) + '\n';
}

export function buildGraphML(graph: InteropGraph): string {
  const { nodes, nodeBySlug, edges } = normalizeGraph(graph);
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    '<graphml xmlns="http://graphml.graphdrawing.org/xmlns" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
      'xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns http://graphml.graphdrawing.org/xmlns/1.0/graphml.xsd">',
  );
  lines.push('  <key id="uid" for="node" attr.name="uid" attr.type="string"/>');
  lines.push('  <key id="slug" for="node" attr.name="slug" attr.type="string"/>');
  lines.push('  <key id="kind" for="node" attr.name="kind" attr.type="string"/>');
  lines.push('  <key id="title" for="node" attr.name="title" attr.type="string"/>');
  lines.push('  <key id="domain" for="node" attr.name="domain" attr.type="string"/>');
  lines.push('  <key id="via" for="edge" attr.name="via" attr.type="string"/>');
  lines.push(`  <graph id="${GRAPHML_GRAPH_ID}" edgedefault="directed">`);

  for (const n of nodes) {
    const id = nodeUrn(n.uid);
    lines.push(`    <node id="${escapeXml(id)}">`);
    lines.push(`      <data key="uid">${escapeXml(n.uid)}</data>`);
    lines.push(`      <data key="slug">${escapeXml(n.slug)}</data>`);
    lines.push(`      <data key="kind">${escapeXml(n.kind)}</data>`);
    lines.push(`      <data key="title">${escapeXml(n.title)}</data>`);
    if (n.domain !== undefined) {
      lines.push(`      <data key="domain">${escapeXml(n.domain)}</data>`);
    }
    lines.push('    </node>');
  }

  let edgeIdx = 0;
  for (const e of edges) {
    const src = nodeUrn(nodeBySlug.get(e.from)!.uid);
    const dst = nodeUrn(nodeBySlug.get(e.to)!.uid);
    lines.push(
      `    <edge id="e${edgeIdx}" source="${escapeXml(src)}" target="${escapeXml(dst)}">`,
    );
    lines.push(`      <data key="via">${escapeXml(e.via)}</data>`);
    lines.push('    </edge>');
    edgeIdx += 1;
  }

  lines.push('  </graph>');
  lines.push('</graphml>');
  return lines.join('\n') + '\n';
}

function capitalize(s: string): string {
  return String(s).charAt(0).toUpperCase() + String(s).slice(1);
}

function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
