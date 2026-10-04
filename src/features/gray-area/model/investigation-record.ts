import type { AnalysisRun } from '@/entities/analysis-record';
import type { GrayAreaSnapshot, GrayAreaWitness } from '@/shared/lib/tauri-gray-area';
import type { GrayAreaCandidate } from './candidates';

export interface InvestigationPacket {
  contract: 'grayAreaInvestigation:v1';
  requestedMode: 'read-only';
  execution: string;
  projectUid: string;
  basis: GrayAreaSnapshot['basis'];
  snapshotId: string;
  measuredAt: string;
  candidate: GrayAreaCandidate;
  nodes: Array<{ uid: string; slug: string; bodyDigest: string }>;
  witnesses: GrayAreaWitness[];
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function uid(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function strings(value: unknown, max: number): value is string[] {
  return Array.isArray(value) && value.length <= max && value.every(text) && new Set(value).size === value.length;
}

export function parseInvestigationPacket(request: string): InvestigationPacket | null {
  if (request.length > 100_000) return null;
  const blocks = [...request.matchAll(/^```atlas-investigation\r?\n([\s\S]*?)\r?\n```\s*$/gm)];
  if (blocks.length !== 1) return null;
  let value: unknown;
  try { value = JSON.parse(blocks[0][1]); } catch { return null; }
  const row = object(value);
  const basis = object(row?.basis);
  const candidate = object(row?.candidate);
  if (!row || row.contract !== 'grayAreaInvestigation:v1' || row.requestedMode !== 'read-only'
    || !text(row.execution) || !uid(row.projectUid) || !basis || !candidate || !text(row.snapshotId) || !text(row.measuredAt)) return null;
  if (!['projectSlug', 'sourceId', 'sourceFingerprint', 'graphDigest', 'bodyDigest', 'bindingDigest'].every((key) => text(basis[key]))
    || !strings(basis.selectedUids, 12) || basis.selectedUids.length === 0 || !basis.selectedUids.every(uid)
    || (basis.sourceRoots !== undefined && !strings(basis.sourceRoots, 50))) return null;
  if (!['missing-link', 'changed-source', 'recorded-gap'].includes(String(candidate.kind))
    || !text(candidate.id) || !text(candidate.slug) || !text(candidate.statement)
    || !['observed', 'recorded-unverified'].includes(String(candidate.currency))
    || (candidate.relatedSlug !== null && !text(candidate.relatedSlug))
    || !strings(candidate.path, 12) || !strings(candidate.sourcePaths, 12)) return null;
  if (!Array.isArray(row.nodes) || row.nodes.length === 0 || row.nodes.length > 12
    || row.nodes.some((node) => { const n = object(node); return !n || !uid(n.uid) || !text(n.slug) || !text(n.bodyDigest); })) return null;
  const nodes = row.nodes as InvestigationPacket['nodes'];
  if (new Set(nodes.map((node) => node.uid)).size !== nodes.length || new Set(nodes.map((node) => node.slug)).size !== nodes.length
    || !nodes.some((node) => node.slug === candidate.slug)
    || !candidate.path.every((slug) => nodes.some((node) => node.slug === slug))
    || (candidate.relatedSlug && !nodes.some((node) => node.slug === candidate.relatedSlug))) return null;
  if (!Array.isArray(row.witnesses) || row.witnesses.length > 12 || row.witnesses.some((witness) => {
    const w = object(witness);
    return !w || !text(w.path) || !['read', 'refused', 'omitted'].includes(String(w.status))
      || (w.status === 'read' && (typeof w.text !== 'string' || !text(w.fullFileSha256) || !object(w.actualRange)));
  })) return null;
  return row as unknown as InvestigationPacket;
}

function targets(packet: InvestigationPacket): string {
  return JSON.stringify([packet.nodes.map((node) => node.uid).sort(), [...packet.basis.selectedUids].sort()]);
}
function question(packet: InvestigationPacket): string {
  return JSON.stringify([packet.candidate.kind, packet.nodes.find((node) => node.slug === packet.candidate.slug)?.uid,
    packet.nodes.find((node) => node.slug === packet.candidate.relatedSlug)?.uid ?? null,
    [...packet.candidate.sourcePaths].sort(), packet.candidate.kind === 'recorded-gap' ? packet.candidate.statement : null]);
}
function witnesses(packet: InvestigationPacket): string {
  return JSON.stringify(packet.witnesses.map((witness) => [witness.path, witness.status, witness.text ?? null,
    witness.actualRange?.startLine ?? null, witness.actualRange?.endLine ?? null,
    witness.fullFileSha256 ?? null, witness.fileComplete ?? null, witness.reason ?? null])
    .sort(([left], [right]) => String(left).localeCompare(String(right))));
}
function bodies(packet: InvestigationPacket): string {
  return JSON.stringify(packet.nodes.map(({ uid, slug, bodyDigest }) => [uid, slug, bodyDigest]).sort(([a], [b]) => a.localeCompare(b)));
}
export type InvestigationMatch = { status: 'current' | 'stale' | 'unknown'; run: AnalysisRun };

export function matchInvestigationRun(run: AnalysisRun, current: InvestigationPacket): InvestigationMatch | null {
  const saved = parseInvestigationPacket(run.request.text);
  if (!saved || run.mode !== 'meaning' || run.origin.surface !== 'map'
    || saved.projectUid !== current.projectUid || saved.basis.projectSlug !== current.basis.projectSlug || question(saved) !== question(current)
    || targets(saved) !== targets(current)) return null;
  const slugs = [...saved.nodes.map((node) => node.slug)].sort();
  if (run.scope.projectSlug !== saved.basis.projectSlug || run.scope.projectUid !== saved.projectUid
    || JSON.stringify([...run.scope.targetSlugs].sort()) !== JSON.stringify(slugs)
    || !run.origin.sessionId || !run.origin.runtimeId || run.request.id !== run.origin.userEventId
    || !run.answer.trim() || run.basis.sourceFingerprint !== saved.basis.sourceFingerprint) return { status: 'unknown', run };
  const unchanged = ['sourceId', 'sourceFingerprint', 'graphDigest', 'bodyDigest', 'bindingDigest']
    .every((key) => saved.basis[key as keyof typeof saved.basis] === current.basis[key as keyof typeof current.basis])
    && JSON.stringify([...(saved.basis.sourceRoots ?? [])].sort()) === JSON.stringify([...(current.basis.sourceRoots ?? [])].sort())
    && bodies(saved) === bodies(current);
  return { status: unchanged && witnesses(saved) === witnesses(current) ? 'current' : 'stale', run };
}

export function latestInvestigationMatch(runs: readonly AnalysisRun[], packet: InvestigationPacket): InvestigationMatch | null {
  return runs.map((run) => matchInvestigationRun(run, packet)).filter((match): match is InvestigationMatch => match !== null)
    .sort((left, right) => right.run.createdAt.localeCompare(left.run.createdAt) || right.run.id.localeCompare(left.run.id))[0] ?? null;
}

/** Historical date only. Comparing a saved packet with itself proves association, never freshness. */
export function latestScopedInvestigation(
  runs: readonly AnalysisRun[],
  scope: { projectUid: string; projectSlug: string; uids: readonly string[] },
): AnalysisRun | null {
  const selected = JSON.stringify([...scope.uids].sort());
  return runs.filter((run) => {
    const packet = parseInvestigationPacket(run.request.text);
    return packet?.projectUid === scope.projectUid && packet.basis.projectSlug === scope.projectSlug
      && JSON.stringify([...packet.basis.selectedUids].sort()) === selected
      && matchInvestigationRun(run, packet)?.status === 'current';
  }).sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))[0] ?? null;
}
