import {
  analysisDigest,
  analysisTextDigest,
  analysisScopeKey,
  appendAnalysisRecord,
  compareAnalysisBasis,
  serializeAnalysisRecord,
  type AnalysisBasis,
  type AnalysisEvidence,
  type AnalysisFinding,
  type AnalysisRun,
  type AnalysisScope,
} from '@/entities/analysis-record';
import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';
import { getTauriVaultRootPath, inspectTauriProjectSource } from '@/shared/lib/tauri-vault-fs';
import { resolveNodeAgentTarget, type KnowledgeProjectInsight } from '@/entities/knowledge-graph';

import { parseAtlasToolCall } from './atlas-tool-call';
import { presentationRelationKey, presentationRelationKeysForGraphEdge } from './presentation-trace';
import type { AcpTurnCompletion, AcpTurnStart } from './use-acp-session';

export interface AnalysisGraphSnapshot {
  nodes: ReadonlyArray<{ id: string; title: string; kind: string; uid?: string | null }>;
  edges: ReadonlyArray<{ from: string; to: string; type: string; label?: string | null }>;
}

/** The canvas uses kind:id; portable analysis always uses the vault's actual slug. */
export function analysisGraphFromInsight(insight: KnowledgeProjectInsight | null | undefined): AnalysisGraphSnapshot {
  const slugs = new Map((insight?.nodes ?? []).map((node) => [node.id, resolveNodeAgentTarget(node).ref ?? node.id]));
  return {
    nodes: (insight?.nodes ?? []).map((node) => ({ id: slugs.get(node.id)!, title: node.title, kind: node.kind })),
    edges: (insight?.edges ?? []).map((edge) => ({ from: slugs.get(edge.from) ?? edge.from, to: slugs.get(edge.to) ?? edge.to, type: edge.type, label: edge.label ?? null })),
  };
}

export interface AnalysisCaptureContext {
  mode: AnalysisRun['mode'];
  surface: AnalysisRun['origin']['surface'];
  scope: AnalysisScope;
  handle: FileSystemDirectoryHandle | null;
  writable: boolean;
  fileHandles: ReadonlyMap<string, FileSystemFileHandle>;
  graph: AnalysisGraphSnapshot;
  sourceFingerprint: string | null;
  profileHash: string | null;
  /** Connected local source, used only to recheck the basis; never serialized. */
  sourceRoot?: string | null;
  profileDocumentSlug?: string | null;
  roleIds?: ReadonlySet<string>;
  parentRunId?: string | null;
  parentRequestText?: string | null;
}

export type AnalysisSaveState = {
  status: 'saving' | 'saved' | 'error';
  id: string;
  handle: FileSystemDirectoryHandle | null;
  record: AnalysisRun | null;
  error: string | null;
  rawAnswer?: string;
};

const READ_TOOLS = new Set(['connection_info', 'list_kinds', 'list_concepts', 'get_concept', 'get_concepts', 'find_evidence', 'find_backlinks', 'find_neighbors', 'find_path', 'find_orphans', 'query_concepts', 'query_ontology', 'compile_ontology', 'validate_vault', 'inspect_architecture']);
const CATEGORIES = new Set(['definition', 'boundary', 'relation', 'evidence', 'architecture']);
const MAX_EVIDENCE = 200;

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function decode(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim().replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '');
  try { return JSON.parse(trimmed); } catch { return null; }
}

/** Only actual full, untruncated successful result objects become portable evidence. */
export function fullBodyResultRows(rawOutput: unknown): Array<Record<string, unknown>> {
  const found = new Map<string, Record<string, unknown>>();
  const visited = new Set<object>();
  let budget = 20_000;
  const walk = (raw: unknown, depth: number) => {
    if (depth > 16 || budget-- <= 0) return;
    const value = decode(raw);
    if (!value || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) { value.forEach((item) => walk(item, depth + 1)); return; }
    const row = value as Record<string, unknown>;
    if (row.isError === true || row.error) return;
    const bodyInfo = object(row.bodyInfo);
    if (typeof row.slug === 'string' && typeof row.body === 'string' && object(row.frontmatter)
      && bodyInfo?.mode === 'full' && bodyInfo.truncated === false
      && bodyInfo.returnedChars === row.body.length) {
      found.set(row.slug, row);
    }
    for (const [key, child] of Object.entries(row)) {
      if (key === 'body' || key === 'frontmatter') continue;
      if (child && (typeof child === 'object' || ['text', 'content', 'output', 'result'].includes(key))) walk(child, depth + 1);
    }
  };
  walk(rawOutput, 0);
  return [...found.values()];
}

/** Keep the real measurement, including unknown coverage. Machine-local roots are omitted. */
export function architectureResultRows(rawOutput: unknown): Array<Record<string, unknown>> {
  const results: Record<string, unknown>[] = [];
  const stripRoots = (value: unknown): unknown => Array.isArray(value) ? value.map(stripRoots) : object(value)
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => key !== 'rootPath').map(([key, child]) => [key, stripRoots(child)])) : value;
  const walk = (raw: unknown, depth: number) => {
    if (depth > 12 || results.length >= 20) return;
    const value = decode(raw);
    if (Array.isArray(value)) { value.forEach((child) => walk(child, depth + 1)); return; }
    const row = object(value);
    if (!row || row.isError === true || row.error) return;
    if (row.contract === 'architectureBrief:v1' && object(row.measured) && object(row.profile) && object(row.conformance)) {
      results.push(stripRoots(row) as Record<string, unknown>); return;
    }
    for (const key of ['structuredContent', 'content', 'text', 'output', 'result']) if (row[key]) walk(row[key], depth + 1);
  };
  walk(rawOutput, 0);
  return [...new Map(results.map((result) => [JSON.stringify(result), result])).values()];
}

export async function analysisGraphDigest(graph: AnalysisGraphSnapshot): Promise<string> {
  return analysisDigest({
    nodes: graph.nodes.map(({ id, title, kind, uid }) => ({ id, title, kind, uid: uid ?? null })).sort((a, b) => a.id.localeCompare(b.id)),
    edges: graph.edges.map(({ from, to, type, label }) => ({ from, to, type, label: label ?? null })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  });
}

export async function currentAnalysisBasis(context: AnalysisCaptureContext, slugs: readonly string[]): Promise<AnalysisBasis & { profileSnapshot: AnalysisRun['profileSnapshot'] }> {
  const documents: AnalysisBasis['documents'] = [];
  let profileSnapshot: AnalysisRun['profileSnapshot'] = null;
  const requested = [...new Set([...slugs, ...(context.profileDocumentSlug ? [context.profileDocumentSlug] : [])])].slice(0, MAX_EVIDENCE);
  for (const slug of requested) {
    const handle = context.fileHandles.get(slug);
    if (!handle) continue;
    try {
      const file = await handle.getFile();
      if (file.size > 500_000) continue;
      const markdown = await file.text();
      const parsed = parseFrontmatter(markdown);
      if (parsed.diagnostics?.length) continue;
      if (slug === context.profileDocumentSlug) profileSnapshot = { slug, markdown, digest: await analysisTextDigest(markdown) };
      documents.push({ slug, digest: await analysisDigest({ frontmatter: parsed.frontmatter, body: parsed.body }) });
    } catch { /* Missing current evidence is unknown, never a clean verdict. */ }
  }
  let sourceFingerprint = context.sourceFingerprint;
  if (context.sourceRoot && context.mode === 'architecture') {
    try {
      const source = await inspectTauriProjectSource(context.sourceRoot);
      sourceFingerprint = source && !source.truncated ? source.fingerprint : null;
    } catch { sourceFingerprint = null; }
  }
  const profileHash = context.profileDocumentSlug ? profileSnapshot?.digest ?? null : context.profileHash;
  return { graphHash: await analysisGraphDigest(context.graph), sourceFingerprint, profileHash, documents: documents.filter((item) => slugs.includes(item.slug)), profileSnapshot };
}

function parseAnalysisFindings(answer: string): { findings: AnalysisFinding[]; reasons: string[] } {
  const blocks = [...answer.matchAll(/```atlas-analysis\s*\n([\s\S]*?)\n```/gu)];
  if (blocks.length !== 1) return { findings: [], reasons: [blocks.length ? 'multiple_findings_payloads' : 'no_findings_payload'] };
  let payload: unknown;
  try { payload = JSON.parse(blocks[0][1]); } catch { return { findings: [], reasons: ['invalid_findings_json'] }; }
  const root = object(payload);
  if (!root || !Array.isArray(root.findings) || root.findings.length > 100) return { findings: [], reasons: ['invalid_findings_shape'] };
  const findings: AnalysisFinding[] = [];
  const reasons: string[] = [];
  for (const [index, input] of root.findings.entries()) {
    const row = object(input);
    const list = (value: unknown): string[] | null => Array.isArray(value) && value.length <= 200 && value.every((part) => typeof part === 'string' && part.trim()) ? [...new Set(value as string[])] : null;
    const targets = list(row?.targetSlugs);
    const evidence = list(row?.evidenceSlugs);
    const roles = row?.roleIds === undefined ? [] : list(row.roleIds);
    if (!row || typeof row.category !== 'string' || !CATEGORIES.has(row.category)
      || typeof row.title !== 'string' || !row.title.trim() || row.title.length > 500
      || typeof row.detail !== 'string' || !row.detail.trim() || row.detail.length > 100_000
      || !targets || !evidence || !roles
      || (row.suggestedAction !== undefined && typeof row.suggestedAction !== 'string')) {
      reasons.push(`invalid_finding:${index + 1}`); continue;
    }
    const relation = row.relation === undefined || row.relation === null ? null : object(row.relation);
    if (row.relation != null && (!relation || !['from', 'to', 'type'].every((key) => typeof relation[key] === 'string' && relation[key]))) {
      reasons.push(`invalid_relation:${index + 1}`); continue;
    }
    findings.push({
      id: `finding-${index + 1}`,
      category: row.category as AnalysisFinding['category'], title: row.title, detail: row.detail,
      targetSlugs: targets, evidenceSlugs: evidence, roleIds: roles,
      relation: relation as AnalysisFinding['relation'], suggestedAction: typeof row.suggestedAction === 'string' ? row.suggestedAction : '',
    });
  }
  return { findings, reasons };
}

function findingGroundingProblems(finding: AnalysisFinding, run: AnalysisRun, context: AnalysisCaptureContext): string[] {
  const reasons: string[] = [];
  const known = new Set(context.graph.nodes.map((node) => node.id));
  const read = new Set(run.evidence.map((item) => item.slug));
  if (finding.targetSlugs.length === 0 && finding.roleIds.length === 0) reasons.push('no_target');
  if (finding.targetSlugs.some((slug) => !known.has(slug))) reasons.push('target_not_in_graph');
  if (context.scope.targetSlugs.length && finding.targetSlugs.some((slug) => !context.scope.targetSlugs.includes(slug))) reasons.push('target_outside_scope');
  if (finding.evidenceSlugs.length === 0 || finding.evidenceSlugs.some((slug) => !read.has(slug))) reasons.push('citation_not_read');
  if (finding.roleIds.some((id) => !context.roleIds?.has(id))) reasons.push('role_not_in_profile');
  if (finding.relation) {
    const kinds = new Map(context.graph.nodes.map((node) => [node.id, node.kind]));
    const relations = new Set(context.graph.edges.flatMap((edge) => presentationRelationKeysForGraphEdge({ ...edge, toKind: kinds.get(edge.to) ?? null })));
    if (!relations.has(presentationRelationKey(finding.relation.from, finding.relation.to, finding.relation.type))) reasons.push('relation_not_in_graph');
  }
  if (run.origin.outcome !== 'completed') reasons.push('turn_incomplete');
  if (run.mode === 'meaning' && run.sourceAccess !== 'atlas-only') reasons.push('atlas_only_unproven');
  return reasons;
}

/**
 * A tool read keeps the tool's name, but an ACP tool event outside the Atlas server carries
 * whatever title the agent gave it, which can run past the record's 200-character bound or
 * be blank. The record validator rejects both, and one such event used to fail the whole
 * save ("tool name must be a non-empty bounded string"), so the audit row is bounded here.
 */
function bounded(value: string | undefined, max: number): string {
  const trimmed = (value ?? '').trim();
  return trimmed ? trimmed.slice(0, max) : 'unknown';
}

export async function buildAnalysisRun(
  completion: AcpTurnCompletion,
  context: AnalysisCaptureContext,
  { id, graphHash, profileSnapshot = null }: { id: string; graphHash: string; profileSnapshot?: AnalysisRun['profileSnapshot'] },
): Promise<AnalysisRun> {
  const answerEvent = [...completion.events].reverse().find((event) => event.kind === 'agent');
  const answer = answerEvent?.kind === 'agent' ? answerEvent.text : '';
  const evidence = new Map<string, AnalysisEvidence>();
  const toolReads: AnalysisRun['toolReads'] = [];
  const observations: AnalysisRun['observations'] = [];
  const known = new Set(context.graph.nodes.map((node) => node.id));
  const readableEvidence = new Set([...known, ...context.fileHandles.keys()]);
  let sourceAccess: AnalysisRun['sourceAccess'] = 'atlas-only';
  const reasons: string[] = [];
  for (const event of completion.events) {
    if (event.kind !== 'tool') continue;
    if (['ToolSearch', 'tool_search'].includes(event.title)) continue;
    const call = parseAtlasToolCall(event.title, event.rawInput);
    toolReads.push({ id: bounded(event.id, 200), name: bounded(call?.name ?? event.title, 200), status: bounded(event.status, 100) });
    if (!call || !READ_TOOLS.has(call.name)) sourceAccess = 'unproven';
    if (call?.name === 'inspect_architecture') {
      const measurements = event.status === 'completed' ? architectureResultRows(event.rawOutput) : [];
      if (sourceAccess !== 'unproven') sourceAccess = measurements.length ? 'source-included' : 'unproven';
      for (const result of measurements) {
        if (observations.length >= 20) { reasons.push('observation_budget_exceeded'); break; }
        if (object(result.profile)?.slug !== context.scope.profileSlug) reasons.push('observation_outside_profile');
        if (!context.sourceRoot || call.input?.rootPath !== context.sourceRoot) reasons.push('observation_source_unproven');
        observations.push({ toolCallId: event.id, name: 'inspect_architecture', digest: await analysisDigest(result), result });
      }
    }
    if (!call || !['get_concept', 'get_concepts'].includes(call.name) || call.input?.body !== 'full' || event.status !== 'completed') continue;
    for (const row of fullBodyResultRows(event.rawOutput)) {
      const slug = row.slug as string;
      if (!readableEvidence.has(slug)) { reasons.push(`unknown_read:${slug}`); continue; }
      if (evidence.size >= MAX_EVIDENCE && !evidence.has(slug)) { reasons.push('evidence_budget_exceeded'); continue; }
      const frontmatter = row.frontmatter as Record<string, unknown>;
      const body = row.body as string;
      const digest = await analysisDigest({ frontmatter, body });
      const earlier = evidence.get(slug);
      if (earlier && earlier.digest !== digest) reasons.push(`mixed_read:${slug}`);
      evidence.set(slug, { slug, uid: typeof row.uid === 'string' ? row.uid : null, title: typeof frontmatter.title === 'string' ? frontmatter.title : slug, kind: typeof frontmatter.kind === 'string' ? frontmatter.kind : 'untyped-document', body, frontmatter, digest, toolCallId: event.id });
    }
  }
  if (toolReads.length === 0) sourceAccess = 'unproven';
  if (completion.outcome !== 'completed') reasons.push('turn_incomplete');
  if (!completion.stopReason) reasons.push('stop_reason_unavailable');
  else if (completion.stopReason !== 'end_turn') reasons.push('turn_did_not_end_normally');
  if (!answer.trim()) reasons.push('no_answer');
  if (evidence.size === 0) reasons.push('no_full_body_evidence');
  if (context.mode === 'meaning' && sourceAccess !== 'atlas-only') reasons.push('atlas_only_unproven');
  if (context.mode === 'architecture' && !context.sourceFingerprint) reasons.push('sourceFingerprint_unrecorded');
  if (context.mode === 'architecture' && !context.profileHash) reasons.push('profileHash_unrecorded');
  if (context.mode === 'architecture' && observations.length === 0) reasons.push('no_architecture_observation');
  const parsed = parseAnalysisFindings(answer);
  reasons.push(...parsed.reasons);
  const run: AnalysisRun = {
    schema: 'atlas-analysis/v1', recordType: 'run', id, createdAt: completion.endedAt, mode: context.mode,
    scope: structuredClone(context.scope),
    request: { id: completion.userEventId, text: completion.text, parentRunId: context.parentRequestText === completion.text ? context.parentRunId ?? null : null },
    origin: { surface: context.surface, runtimeId: completion.runtimeId, sessionId: completion.sessionId, userEventId: completion.userEventId, answerEventId: answerEvent?.id ?? null, startedAt: completion.startedAt, stopReason: completion.stopReason, outcome: completion.outcome },
    basis: { graphHash, sourceFingerprint: context.sourceFingerprint, profileHash: context.profileHash, documents: [...evidence.values()].map(({ slug, digest }) => ({ slug, digest })) },
    evidence: [...evidence.values()], observations, profileSnapshot, toolReads, sourceAccess, findings: parsed.findings,
    qualification: { status: 'unverified', reasons: [] }, answer,
  };
  for (const finding of run.findings) reasons.push(...findingGroundingProblems(finding, run, context).map((reason) => `${finding.id}:${reason}`));
  const current = await currentAnalysisBasis(context, run.evidence.map((item) => item.slug));
  const compatibility = compareAnalysisBasis(run.basis, current);
  if (compatibility.status !== 'current') reasons.push(...compatibility.reasons);
  run.qualification = { status: reasons.length ? 'unverified' : 'grounded', reasons: [...new Set(reasons)] };
  try { serializeAnalysisRecord(run); } catch (error) {
    // Large evidence must not erase a useful response. Retain the original
    // answer and explicit missing portability instead of a truncated witness.
    if (!(error instanceof Error) || !/byte budget|evidence body/i.test(error.message)) throw error;
    run.evidence = [];
    if (run.observations.length) { run.observations = []; reasons.push('observation_budget_exceeded'); }
    if (run.profileSnapshot) { run.profileSnapshot = null; reasons.push('profile_snapshot_budget_exceeded'); }
    run.qualification = { status: 'unverified', reasons: [...new Set([...reasons, 'evidence_budget_exceeded'])] };
    serializeAnalysisRecord(run);
  }
  return run;
}

export function createAnalysisTurnObserver(
  context: AnalysisCaptureContext,
  currentContext: () => AnalysisCaptureContext | null,
  onState: (state: AnalysisSaveState) => void,
): (start: AcpTurnStart) => ((completion: AcpTurnCompletion) => Promise<void>) {
  return (start) => {
    const id = crypto.randomUUID();
    const startingBasis = currentAnalysisBasis(context, []);
    // Capture each origin, including permission, before any later vault selection.
    const captured = context;
    return async (completion) => {
      onState({ status: 'saving', id, handle: captured.handle, record: null, error: null });
      let record: AnalysisRun | null = null;
      try {
        const basis = await startingBasis;
        record = await buildAnalysisRun(completion, { ...captured, sourceFingerprint: basis.sourceFingerprint, profileHash: basis.profileHash }, { id, graphHash: basis.graphHash!, profileSnapshot: basis.profileSnapshot });
        const capturedRoot = captured.handle ? getTauriVaultRootPath(captured.handle) : null;
        if (!capturedRoot || start.vaultRoot !== capturedRoot
          || completion.vaultRoot !== start.vaultRoot || completion.sessionId !== start.sessionId
          || completion.runtimeId !== start.runtimeId || completion.userEventId !== start.userEventId
          || completion.text !== start.text || completion.startedAt !== start.startedAt) {
          record.qualification = { status: 'unverified', reasons: [...record.qualification.reasons, 'turn_origin_mismatch'] };
          throw new Error('The analysis origin does not match the captured folder and request.');
        }
        const current = currentContext();
        if (!current || current.handle !== captured.handle) {
          record.qualification = { status: 'unverified', reasons: [...record.qualification.reasons, 'vault_context_changed'] };
        } else if (analysisScopeKey(current.mode, current.scope) !== analysisScopeKey(captured.mode, captured.scope)) {
          record.qualification = { status: 'unverified', reasons: [...record.qualification.reasons, 'view_scope_changed'] };
        } else if (current !== captured) {
          const basis = await currentAnalysisBasis(current, record.evidence.map((item) => item.slug));
          const state = compareAnalysisBasis(record.basis, basis);
          if (state.status !== 'current') record.qualification = { status: 'unverified', reasons: [...new Set([...record.qualification.reasons, ...state.reasons])] };
        }
        if (!captured.handle) throw new Error('No writable ontology folder was captured.');
        await appendAnalysisRecord(captured.handle, record, captured.writable);
        onState({ status: 'saved', id, handle: captured.handle, record, error: null });
      } catch (error) {
        const lastAnswer = [...completion.events].reverse().find((event) => event.kind === 'agent');
        onState({ status: 'error', id, handle: captured.handle, record, error: error instanceof Error ? error.message : String(error), rawAnswer: lastAnswer?.kind === 'agent' ? lastAnswer.text : '' });
      }
    };
  };
}

export const ANALYSIS_FINDINGS_INSTRUCTION = [
  'Keep the answer useful as plain Markdown. Cite exact ontology slugs and preserve unknowns; do not invent a maintainability percentage or treat a suspicion as a confirmed defect.',
  'At the end, include one ```atlas-analysis JSON block shaped {"findings":[{"category":"definition|boundary|relation|evidence|architecture","title":"...","detail":"...","targetSlugs":["exact authored slug"],"evidenceSlugs":["slug read in full this turn"],"roleIds":[],"relation":null,"suggestedAction":"..."}]}.',
  'Use the appropriate single category value. A relation, when relevant, is {"from":"slug","to":"slug","type":"declared relation type"}. Only cite actual full-body reads. Keep unmeasured source/runtime impact unknown. An empty findings array means no findings in this bounded review, never proof that the whole system is correct.',
].join('\n');
