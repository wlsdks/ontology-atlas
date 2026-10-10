/**
 * Interop serializers from a compiled graph to JSON-LD 1.1 and GraphML; identity is `urn:uuid:<uid>`, and edges
 * without both endpoints are dropped. Twin of `src/shared/lib/interop-format.ts`, byte-identical per
 * `tests/contract/interop-format.contract.test.ts`.
 */

const INTEROP_URN_BASE = 'urn:uuid';
export const INTEROP_SCHEMA_VERSION = 2;

const OATLAS_NS = 'https://wlsdks.github.io/ontology-atlas/ns#';
const GRAPHML_GRAPH_ID = 'atlas';
const NODE_UID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Every edge key the compiler can emit as `via` → its oatlas predicate; keep in sync with `mcp/src/vault/`
 * NEIGHBOR_KEYS and INLINE_NEIGHBOR_KEYS. An unknown `via` becomes `oatlas:<via>`, never dropped.
 */
const VIA_PREDICATE = Object.freeze({
  domains: 'domains',
  capabilities: 'capabilities',
  elements: 'elements',
  dependencies: 'dependsOn',
  relates: 'relates',
  contains: 'contains',
  describes: 'describes',
  domain: 'domain',
});

function nodeUrn(uid) {
  if (!NODE_UID_RE.test(uid)) {
    throw new Error('Interop URN requires a valid lowercase UUIDv4 `uid`.');
  }
  return `${INTEROP_URN_BASE}:${uid}`;
}

function predicateTerm(via) {
  return VIA_PREDICATE[via] || String(via);
}

/**
 * Canonical form of the graph, shared by both serializers so they agree on which nodes and edges exist:
 * nodes sorted by slug, edges with both endpoints known, sorted deterministically.
 */
function normalizeGraph(graph) {
  const rawNodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const rawEdges = Array.isArray(graph?.edges) ? graph.edges : [];

  const nodeBySlug = new Map();
  const slugByUid = new Map();
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

  const seenEdge = new Set();
  const edges = [];
  for (const e of rawEdges) {
    const from = typeof e?.from === 'string' ? e.from.trim() : '';
    const to = typeof e?.to === 'string' ? e.to.trim() : '';
    const via = typeof e?.via === 'string' && e.via.trim() ? e.via.trim() : '';
    if (!from || !to || !via) continue;
    // Snapshot only the resolved graph — never mint phantom endpoints.
    if (!nodeBySlug.has(from) || !nodeBySlug.has(to)) continue;
    // Never use NUL as a composite-key separator: it makes the file binary to git, hiding its diff and
    // making grep skip it. `JSON.stringify` is printable and still unambiguous.
    const key = JSON.stringify([from, via, to]);
    if (seenEdge.has(key)) continue;
    seenEdge.add(key);
    edges.push({ from, to, via });
  }
  // Field by field, in the same precedence as NUL-joined strings; localeCompare over a joined string could
  // ignore the separator under some collations.
  edges.sort(
    (a, b) =>
      a.from.localeCompare(b.from) ||
      a.via.localeCompare(b.via) ||
      a.to.localeCompare(b.to),
  );

  return { nodes, nodeBySlug, edges };
}

/**
 * JSON-LD 1.1 (`@context` + `@graph`), readable by rdflib, Protégé and triplestores; edge `via` keys become
 * `oatlas:` predicates.
 */
export function buildJsonLd(graph) {
  const { nodes, nodeBySlug, edges } = normalizeGraph(graph);

  const context = {
    '@vocab': 'https://schema.org/',
    oatlas: OATLAS_NS,
    uid: 'oatlas:uid',
    slug: 'oatlas:slug',
    kind: 'oatlas:kind',
    title: 'oatlas:title',
    domain: 'oatlas:domain',
  };
  // Only declare predicates that actually appear — keeps the context tight and
  // deterministic. Sorted for stable output.
  const usedVias = [...new Set(edges.map((e) => e.via))].sort();
  for (const via of usedVias) {
    context[predicateTerm(via)] = { '@id': `oatlas:${predicateTerm(via)}`, '@type': '@id' };
  }

  const outgoing = new Map();
  for (const e of edges) {
    const list = outgoing.get(e.from) ?? [];
    list.push(e);
    outgoing.set(e.from, list);
  }

  const graphNodes = nodes.map((n) => {
    const node = {
      '@id': nodeUrn(n.uid),
      '@type': capitalize(n.kind),
      uid: n.uid,
      slug: n.slug,
      kind: n.kind,
      title: n.title,
    };
    if (n.domain !== undefined) node.domain = n.domain;
    for (const e of outgoing.get(n.slug) ?? []) {
      const target = nodeBySlug.get(e.to);
      const targetUri = nodeUrn(target.uid);
      const term = predicateTerm(e.via);
      const existing = node[term];
      if (Array.isArray(existing)) existing.push({ '@id': targetUri });
      else if (existing != null) node[term] = [existing, { '@id': targetUri }];
      else node[term] = { '@id': targetUri };
    }
    return node;
  });

  return (
    JSON.stringify(
      { '@context': context, '@graph': graphNodes },
      null,
      2,
    ) + '\n'
  );
}

/**
 * GraphML for Gephi and Cytoscape: nodes carry slug, kind, title and domain, edges carry via, and node ids
 * are the JSON-LD URNs.
 */
export function buildGraphML(graph) {
  const { nodes, nodeBySlug, edges } = normalizeGraph(graph);
  const lines = [];
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
    const src = nodeUrn(nodeBySlug.get(e.from).uid);
    const dst = nodeUrn(nodeBySlug.get(e.to).uid);
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

function capitalize(s) {
  return String(s).charAt(0).toUpperCase() + String(s).slice(1);
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
