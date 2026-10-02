import type { GrayAreaSnapshot } from '@/shared/lib/tauri-gray-area';

export interface GrayAreaCandidate {
  id: string;
  kind: 'missing-link' | 'changed-source' | 'recorded-gap';
  slug: string;
  relatedSlug: string | null;
  path: string[];
  statement: string;
  sourcePaths: string[];
  currency: 'observed' | 'recorded-unverified';
}
const DEPENDENCIES = new Set(['dependencies', 'depends_on']);
const STATIC_IMPORTS = new Set(['static', 'require', 'reexport', 'side']);

function selectedPaths(snapshot: GrayAreaSnapshot): Map<string, string[]> {
  const selected = new Set(snapshot.basis.selectedUids);
  const paths = new Map(snapshot.nodes.filter(n => selected.has(n.uid)).map(n => [n.slug, [n.slug]]));
  const groupScope = new Set(snapshot.nodes.filter(n => selected.has(n.uid) && (n.kind === 'project' || n.kind === 'domain')).map(n=>n.slug));
  let grew = true;
  while (grew) {
    grew = false;
    for (const edge of snapshot.edges) {
      if (!['domains','domain','capabilities','elements','contains'].includes(edge.via)) continue;
      const [parent,child] = edge.via === 'domain' ? [edge.to,edge.from] : [edge.from,edge.to];
      if (groupScope.has(parent) && !groupScope.has(child)) { groupScope.add(child); paths.set(child,[child]); grew=true; }
    }
  }
  const adjacency = new Map<string, Set<string>>();
  for (const edge of snapshot.edges) {
    if (!DEPENDENCIES.has(edge.via)) continue;
    for (const [from, to] of [[edge.from, edge.to], [edge.to, edge.from]]) {
      const neighbors = adjacency.get(from) ?? new Set<string>(); neighbors.add(to); adjacency.set(from, neighbors);
    }
  }
  const queue = [...paths.keys()];
  for (let i = 0; i < queue.length; i += 1) {
    const path = paths.get(queue[i])!;
    if (path.length >= 3) continue;
    for (const next of [...(adjacency.get(queue[i]) ?? [])].sort()) {
      if (paths.has(next)) continue;
      paths.set(next, [...path, next]); queue.push(next);
    }
  }
  return paths;
}

function indexDependenciesLinear(edges: GrayAreaSnapshot['edges'], paths: ReadonlyMap<string, string[]>) {
  const declared = new Set<string>();
  const firstDependent = new Map<string, string>();
  for (const edge of edges) {
    if (!DEPENDENCIES.has(edge.via)) continue;
    declared.add(JSON.stringify([edge.from, edge.to]));
    if (paths.has(edge.from) && !firstDependent.has(edge.to)) firstDependent.set(edge.to, edge.from);
  }
  return { declared, firstDependent };
}

export function buildGrayAreaCandidates(snapshot: GrayAreaSnapshot): GrayAreaCandidate[] {
  const bySlug = new Map(snapshot.nodes.map(n => [n.slug, n]));
  const byPath = new Map<string, string[]>();
  for (const node of snapshot.nodes) {
    if (!node.path) continue;
    const slugs = byPath.get(node.path) ?? [];
    slugs.push(node.slug);
    byPath.set(node.path, slugs);
  }
  const paths = selectedPaths(snapshot);
  const { declared, firstDependent } = indexDependenciesLinear(snapshot.edges, paths);
  const rows = new Map<string, GrayAreaCandidate>();
  const add = (row: Omit<GrayAreaCandidate, 'id'>) => {
    const id = JSON.stringify([snapshot.snapshotId, row.kind, row.slug, row.relatedSlug, row.statement]);
    rows.set(id, { ...row, id });
  };
  if (snapshot.coverage.importsAvailable) for (const edge of snapshot.imports) {
    if (edge.sourceRole !== 'production' || edge.importUsage !== 'value' || !STATIC_IMPORTS.has(edge.kind)) continue;
    const from = byPath.get(edge.from); const to = byPath.get(edge.to);
    if (from?.length !== 1 || to?.length !== 1 || from[0] === to[0]) continue;
    if (declared.has(JSON.stringify([from[0], to[0]]))) continue;
    const path = paths.get(from[0]) ?? paths.get(to[0]);
    if (!path) continue;
    add({ kind: 'missing-link', slug: from[0], relatedSlug: to[0], path, statement: `${edge.from} → ${edge.to}`, sourcePaths: [edge.from, edge.to], currency: 'observed' });
  }
  for (const drift of snapshot.drift) {
    const path = paths.get(drift.slug);
    if (!path || !bySlug.has(drift.slug)) continue;
    const dependent = firstDependent.get(drift.slug);
    if (!dependent) continue;
    add({ kind: 'changed-source', slug: drift.slug, relatedSlug: dependent, path: path.length > 1 ? path : [drift.slug, dependent], statement: `${drift.documentChangedAt} → ${drift.sourceChangedAt}`, sourcePaths: [drift.path], currency: 'observed' });
  }
  for (const read of snapshot.recordedReads) {
    const path = paths.get(read.slug); const node = bySlug.get(read.slug);
    if (!path || !node || read.kind === 'other' || !node.body.includes(read.statement)) continue;
    add({ kind: 'recorded-gap', slug: read.slug, relatedSlug: null, path, statement: read.statement, sourcePaths: read.paths, currency: 'recorded-unverified' });
  }
  const order = { 'missing-link': 0, 'changed-source': 1, 'recorded-gap': 2 };
  return [...rows.values()].sort((a, b) => a.path.length - b.path.length || order[a.kind] - order[b.kind] || a.slug.localeCompare(b.slug) || a.id.localeCompare(b.id));
}

export function grayAreaCandidatePage(snapshot: GrayAreaSnapshot, dismissed: ReadonlySet<string> = new Set()) {
  const all = buildGrayAreaCandidates(snapshot).filter(candidate=>!dismissed.has(candidate.id));
  return { candidates: all.slice(0, 3), total: all.length, omitted: Math.max(0, all.length - 3) };
}
export function formatRecordedPath(snapshot: GrayAreaSnapshot, path: string[], label:(slug:string)=>string): string {
  return path.map((slug,index)=>{
    if(index===0)return label(slug);
    const previous=path[index-1];
    const forward=snapshot.edges.some(e=>DEPENDENCIES.has(e.via)&&e.from===previous&&e.to===slug);
    const reverse=snapshot.edges.some(e=>DEPENDENCIES.has(e.via)&&e.from===slug&&e.to===previous);
    return `${forward?' → ':reverse?' ← ':' · '}${label(slug)}`;
  }).join('');
}
