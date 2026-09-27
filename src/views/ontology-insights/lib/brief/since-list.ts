import { isAfter, toMs, type BriefCore } from './brief-model';

/** One thing that happened after the anchor, from whichever core recorded it. */
export interface SinceRow {
  core: BriefCore['core'];
  /** ISO time; rows sort newest first. */
  at: string;
  /** Message id under `brief.since.*`; `label` is its argument. */
  kind: 'concept-doc' | 'wiki-log' | 'guide-file' | 'agent-call';
  /** What moved: concept title, wiki log summary, guide file path, or tool and target. */
  label: string;
  /** Where to look, when a screen lists it. */
  href: string | null;
}

export interface SinceListInput {
  docs: readonly { slug: string; title: string; kind: string | null; updatedAt: string | null }[];
  wikiLog: readonly { at: string; kind: string; summary: string }[];
  guideFiles: readonly { path: string; mtimeMs: number | null }[];
  agentCalls: readonly { at: string; tool: string; target: string }[];
  anchorMs: number;
  limit?: number;
}

const CONCEPT_KINDS = new Set(['domain', 'capability', 'element', 'project']);

/**
 * Everything after the anchor in one newest-first list, from dates the folder already carries. `total` counts all;
 * the screen shows `limit` and names the rest.
 */
export function buildSinceList(input: SinceListInput): { rows: SinceRow[]; total: number; soleKind: SinceRow['kind'] | null } {
  const rows: SinceRow[] = [];
  for (const doc of input.docs) {
    if (!doc.kind || !CONCEPT_KINDS.has(doc.kind) || !isAfter(doc.updatedAt, input.anchorMs)) continue;
    rows.push({ core: 'ontology', at: doc.updatedAt!, kind: 'concept-doc', label: doc.title || doc.slug, href: `/topology/?p=${encodeURIComponent(doc.slug)}` });
  }
  for (const entry of input.wikiLog) {
    if (!isAfter(entry.at, input.anchorMs)) continue;
    rows.push({ core: 'wiki', at: entry.at, kind: 'wiki-log', label: `${entry.kind} · ${entry.summary}`, href: '/library/' });
  }
  for (const file of input.guideFiles) {
    if (!isAfter(file.mtimeMs, input.anchorMs) || file.mtimeMs == null) continue;
    rows.push({ core: 'harness', at: new Date(file.mtimeMs).toISOString(), kind: 'guide-file', label: file.path, href: '/architecture/?view=guides' });
  }
  for (const call of input.agentCalls) {
    if (!isAfter(call.at, input.anchorMs)) continue;
    rows.push({ core: 'agent', at: call.at, kind: 'agent-call', label: call.target ? `${call.tool} · ${call.target}` : call.tool, href: '/agents/' });
  }
  rows.sort((a, b) => (toMs(b.at) ?? 0) - (toMs(a.at) ?? 0));
  const limit = input.limit ?? 12;
  // Judged over every row, so a title naming one kind never hides another kind past the shown rows.
  const kinds = new Set(rows.map((row) => row.kind));
  const soleKind = kinds.size === 1 ? rows[0]!.kind : null;
  return { rows: rows.slice(0, limit), total: rows.length, soleKind };
}
