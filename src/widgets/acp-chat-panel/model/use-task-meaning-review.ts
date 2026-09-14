import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { parseAtlasToolCall, type AcpEvent, type AcpTurnStart, type PendingPermission, type TaskBaselineCaptureResult } from '@/features/acp-session';
import { buildMeaningDiff, buildProposalBinding, type MeaningDiffItem } from '@/entities/knowledge-graph';
import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';

type TaskMeaningReviewReason =
  | 'unsupported_request' | 'historical_basis_unavailable' | 'source_basis_unavailable'
  | 'target_before_unavailable' | 'current_basis_unavailable' | 'intervening_change'
  | 'guard_mismatch' | 'parse_failed' | 'request_changed' | 'acknowledgement_required'
  | 'connection_unverified' | 'connection_root_mismatch' | 'source_binding_changed'
  | 'source_diff_unavailable';

export interface TaskMeaningReviewView {
  status: 'idle' | 'loading' | 'ready' | 'unavailable';
  requestKey: string | null;
  reasons: readonly TaskMeaningReviewReason[];
  items: readonly (MeaningDiffItem & { field: string })[];
  coverage: { total: number; inspected: number; omitted: number; complete: boolean };
  proposal: Awaited<ReturnType<typeof buildProposalBinding>> | null;
  historicalBasis: { meaningBasis: string; sourceBasisId: string } | null;
  currentBasis: { meaningBasis: string; sourceBasisId: string } | null;
  meaningStatus: 'unknown' | 'unreviewed' | 'accepted';
  executionBlocked: boolean;
  actualReportedRoot: string | null;
  guardStatus: 'verified' | 'compatible-coarse' | 'unknown';
  markMeaningAccepted: (input: { acknowledgeFullScope: boolean }) => Promise<boolean>;
}
export type TaskMeaningReviewController = TaskMeaningReviewView;

interface Input {
  pending: PendingPermission | null;
  runtimeId: string;
  vaultRoot: string | null;
  captureTaskBaseline?: (turn: AcpTurnStart) => Promise<TaskBaselineCaptureResult>;
  events: readonly AcpEvent[];
}

const EMPTY_COVERAGE = { total: 0, inspected: 0, omitted: 0, complete: false };
const own = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key);
const freeze = <T,>(value: T): T => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

function requestIdentityKey(input: Input): string | null {
  const pending = input.pending;
  const turn = pending?.origin?.turn;
  if (!pending || !turn) return null;
  const pendingNamespace = serverNamespace(pending.request.toolName ?? pending.request.title);
  const connectionEvidence = input.events.flatMap((event) => {
    if (event.kind === 'user' && event.id === turn.userEventId) return [[event.kind, event.id]];
    if (event.kind !== 'tool' || serverNamespace(event.title) !== pendingNamespace) return [];
    if (parseAtlasToolCall(event.title, event.rawInput)?.name !== 'connection_info') return [];
    return [[event.id, event.title, event.status, event.rawInput, event.rawOutput]];
  });
  return JSON.stringify([input.vaultRoot, pending.origin?.sessionGeneration, turn.sessionId, turn.userEventId,
    pending.request.requestId, pending.request.toolCallId, pending.request.toolName, pending.request.rawInput,
    connectionEvidence]);
}

function opaqueRequestKey(serialized: string | null): string | null {
  if (!serialized) return null;
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) hash = Math.imul(hash ^ serialized.charCodeAt(index), 16777619);
  return `task-review:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function turnOf(input: Input): AcpTurnStart | null {
  const turn = input.pending?.origin?.turn;
  if (!turn) return null;
  return { ...turn, runtimeId: input.runtimeId, startedAt: new Date().toISOString() };
}

function fieldsOf(raw: string): Record<string, { present: boolean; value?: unknown }> | null {
  const parsed = parseFrontmatter(raw);
  if (parsed.diagnostics?.length) return null;
  return { ...Object.fromEntries(Object.entries(parsed.frontmatter).map(([key, value]) => [key, { present: true, value }])), body: { present: true, value: parsed.body } };
}

function proposalClaims(rawInput: Record<string, unknown>) {
  const claims: Array<{ claimId: string; facet: 'definition' | 'condition' | 'exception' | 'unit' | 'actor' | 'scope' | 'relation' | 'evidence' | 'unknown'; field: string; after: { present: boolean; value?: unknown } }> = [];
  if (own(rawInput, 'frontmatter') && rawInput.frontmatter && typeof rawInput.frontmatter === 'object' && !Array.isArray(rawInput.frontmatter)) {
    for (const [field, value] of Object.entries(rawInput.frontmatter as Record<string, unknown>)) {
      const facet = field === 'relation_notes' ? 'relation' : field.includes('condition') ? 'condition' : field.includes('exception') ? 'exception' : field.includes('unit') ? 'unit' : field.includes('actor') ? 'actor' : field.includes('scope') ? 'scope' : field.includes('evidence') ? 'evidence' : field === 'description' || field === 'title' ? 'definition' : 'unknown';
      claims.push({ claimId: `frontmatter:${field}`, facet, field, after: value === null ? { present: false } : { present: true, value } });
    }
  }
  if (own(rawInput, 'body')) claims.push({ claimId: 'body', facet: 'definition', field: 'body', after: { present: true, value: rawInput.body } });
  return claims;
}

function serverNamespace(title: string | null | undefined): string | null {
  const double = title?.match(/^mcp__([^_]+(?:-[^_]+)?)__/u);
  if (double) return double[1] ?? null;
  const dotted = title?.match(/^mcp\.([^.]+)\.[^.]+$/u);
  return dotted?.[1] ?? null;
}

function connectionObservation(rawOutput: unknown): { roots: string[]; invalid: boolean } {
  const decode = (value: unknown): unknown => {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value.trim()); } catch { return null; }
  };
  let budget = 64;
  const roots: string[] = [];
  let invalid = false;
  const visit = (raw: unknown, depth = 0): void => {
    if (depth > 8 || budget-- <= 0) { invalid = true; return; }
    const value = decode(raw);
    if (!value || typeof value !== 'object') { invalid = true; return; }
    if (Array.isArray(value)) {
      for (const child of value) visit(child, depth + 1);
      return;
    }
    const row = value as Record<string, unknown>;
    if (row.isError === true || row.error || row.truncated === true) { invalid = true; return; }
    if (typeof row.vaultRoot === 'string') roots.push(row.vaultRoot);
    if (row.type === 'text') { visit(row.text, depth + 1); return; }
    for (const key of ['structuredContent', 'result', 'content']) {
      if (row[key] !== undefined) visit(row[key], depth + 1);
    }
  };
  visit(rawOutput);
  return { roots, invalid };
}

function currentConnection(input: Input, turn: AcpTurnStart): { status: 'verified' | 'missing' | 'mismatch'; actualRoot: string | null } {
  const pendingTitle = input.pending?.request.toolName ?? input.pending?.request.title;
  const namespace = serverNamespace(pendingTitle);
  if (!namespace || !input.vaultRoot || turn.vaultRoot !== input.vaultRoot) return { status: 'missing', actualRoot: null };
  const turnIndex = input.events.findIndex((event) => event.kind === 'user' && event.id === turn.userEventId);
  if (turnIndex < 0) return { status: 'missing', actualRoot: null };
  let actualRoot: string | null = null;
  let invalid = false;
  for (const event of input.events.slice(turnIndex + 1)) {
    if (event.kind !== 'tool' || serverNamespace(event.title) !== namespace) continue;
    const call = parseAtlasToolCall(event.title, event.rawInput);
    if (call?.name !== 'connection_info') continue;
    if (event.status !== 'completed') { invalid = true; continue; }
    const observation = connectionObservation(event.rawOutput);
    invalid ||= observation.invalid || observation.roots.length === 0;
    for (const reported of observation.roots) {
      if (actualRoot !== null && actualRoot !== reported) invalid = true;
      actualRoot = reported;
    }
  }
  return actualRoot !== null && actualRoot !== input.vaultRoot ? { status: 'mismatch', actualRoot }
    : !invalid && actualRoot === input.vaultRoot ? { status: 'verified', actualRoot }
      : { status: 'missing', actualRoot: null };
}

function completeBaseline(
  baseline: TaskBaselineCaptureResult | null | undefined,
  vaultRoot: string | null,
): baseline is Extract<TaskBaselineCaptureResult, { status: 'available' }> {
  if (!baseline || baseline.status !== 'available' || !vaultRoot || baseline.vaultId !== vaultRoot) return false;
  const requested = baseline.scope.requestedSlugs;
  const captured = baseline.scope.capturedSlugs;
  if (baseline.counts.requested !== requested.length || baseline.counts.captured !== captured.length
    || requested.length !== captured.length || baseline.documents.length !== captured.length) return false;
  const requestedSet = new Set(requested);
  const capturedSet = new Set(captured);
  const documentSet = new Set(baseline.documents.map((document) => document.slug));
  return requestedSet.size === requested.length && capturedSet.size === captured.length
    && documentSet.size === baseline.documents.length
    && requested.every((slug) => capturedSet.has(slug) && documentSet.has(slug));
}

type Prepared = {
  status: 'ready'; reasons: readonly []; proposal: Awaited<ReturnType<typeof buildProposalBinding>>;
  diff: { items: Array<MeaningDiffItem & { field: string }>; coverage: TaskMeaningReviewView['coverage'] };
  historical: Extract<TaskBaselineCaptureResult, { status: 'available' }>;
  current: Extract<TaskBaselineCaptureResult, { status: 'available' }>;
  guardStatus: 'verified' | 'compatible-coarse';
};
type Preparation = Prepared | { status: 'unavailable'; reasons: TaskMeaningReviewReason[]; executionBlocked?: boolean; actualReportedRoot?: string | null };

async function prepare(input: Input): Promise<Preparation> {
  const pending = input.pending;
  const turn = turnOf(input);
  const historical = pending?.origin?.taskBaseline;
  if (!pending || !turn || pending.request.reviewKind !== 'ontology-write' || !pending.request.toolName?.endsWith('patch_concept')) return { status: 'unavailable', reasons: ['unsupported_request'] };
  const raw = structuredClone(pending.request.rawInput);
  if (Array.isArray(raw.concepts) || typeof raw.slug !== 'string' || !raw.slug.trim()) return { status: 'unavailable', reasons: ['unsupported_request'] };
  if (!completeBaseline(historical, input.vaultRoot) || historical.vaultId !== turn.vaultRoot) return { status: 'unavailable', reasons: ['historical_basis_unavailable'] };
  if (!historical.sourceBasis) return { status: 'unavailable', reasons: ['source_basis_unavailable'] };
  const before = historical.documents.find((document) => document.slug === raw.slug);
  if (!before) return { status: 'unavailable', reasons: ['target_before_unavailable'] };
  const beforeFields = fieldsOf(before.raw);
  if (!beforeFields) return { status: 'unavailable', reasons: ['parse_failed'] };
  let current: TaskBaselineCaptureResult | null = null;
  try { current = input.captureTaskBaseline ? await input.captureTaskBaseline(turn) : null; } catch { /* A failed recheck cannot authorize acceptance. */ }
  if (!completeBaseline(current, input.vaultRoot) || current.vaultId !== historical.vaultId || !current.sourceBasis) return { status: 'unavailable', reasons: ['current_basis_unavailable'] };
  if (current.scope.requestedSlugs.length !== historical.scope.requestedSlugs.length
    || current.scope.requestedSlugs.some((slug) => !historical.scope.requestedSlugs.includes(slug))) {
    return { status: 'unavailable', reasons: ['current_basis_unavailable'] };
  }
  if (current.sourceBasis.kind !== historical.sourceBasis.kind
    || current.sourceBasis.rootPath !== historical.sourceBasis.rootPath
    || current.sourceBasis.sourceId !== historical.sourceBasis.sourceId) {
    return { status: 'unavailable', reasons: ['source_binding_changed'] };
  }
  if (current.sourceBasis.sourceBasisId !== historical.sourceBasis.sourceBasisId) {
    return { status: 'unavailable', reasons: ['source_diff_unavailable'] };
  }
  const currentTarget = current.documents.find((document) => document.slug === raw.slug);
  if (!currentTarget) return { status: 'unavailable', reasons: ['target_before_unavailable'] };
  if (currentTarget.mtime !== before.mtime || currentTarget.contentDigest !== before.contentDigest) return { status: 'unavailable', reasons: ['intervening_change'] };
  const expectedMtime = raw.expected_mtime;
  if (typeof expectedMtime !== 'number' || !Number.isFinite(expectedMtime) || Math.floor(expectedMtime) !== currentTarget.mtime) {
    return { status: 'unavailable', reasons: ['guard_mismatch'] };
  }
  // File.lastModified is integer milliseconds in both browser and Tauri. Node's writer guard may
  // retain sub-millisecond precision, so equality here is compatible, never exact verification.
  const guardStatus = 'compatible-coarse' as const;
  if (!fieldsOf(currentTarget.raw)) return { status: 'unavailable', reasons: ['parse_failed'] };
  const connection = currentConnection(input, turn);
  if (connection.status === 'mismatch') return { status: 'unavailable', reasons: ['connection_root_mismatch'], executionBlocked: true, actualReportedRoot: connection.actualRoot };
  if (connection.status !== 'verified') return { status: 'unavailable', reasons: ['connection_unverified'] };
  const origin = pending.origin!;
  const requestId = pending.request.requestId;
  const toolCallId = pending.request.toolCallId;
  if (requestId == null || !toolCallId) return { status: 'unavailable', reasons: ['unsupported_request'] };
  const identity = { vaultId: current.vaultId, sessionGeneration: origin.sessionGeneration, userEventId: turn.userEventId, requestId, toolCallId };
  const proposal = await buildProposalBinding({ identity, request: origin.task ? { outcome: origin.task.outcome, nonGoals: origin.task.nonGoals } : { outcome: turn.text, nonGoals: null }, sourceRevision: current.sourceBasis.sourceBasisId, meaningRevision: current.meaningBasis, contentDigest: currentTarget.contentDigest, rawInput: raw });
  const claims = proposalClaims(raw);
  if (claims.length === 0) return { status: 'unavailable', reasons: ['unsupported_request'] };
  const diffBase = buildMeaningDiff({ identity, target: raw.slug, expectedBefore: { mtime: before.mtime, contentDigest: before.contentDigest, sourceRevision: historical.sourceBasis.sourceBasisId, meaningRevision: historical.meaningBasis }, snapshot: { trust: 'vault_read', vaultId: historical.vaultId, target: raw.slug, mtime: before.mtime, contentDigest: before.contentDigest, sourceRevision: historical.sourceBasis.sourceBasisId, meaningRevision: historical.meaningBasis, completeRead: true, fields: beforeFields }, claims });
  const fieldByClaim = new Map(claims.map((claim) => [claim.claimId, claim.field]));
  const diff = { ...diffBase, items: diffBase.items.map((item) => ({ ...item, field: fieldByClaim.get(item.claimId) ?? item.claimId })) };
  return { status: 'ready', reasons: [], proposal, diff, historical, current, guardStatus };
}

export function useTaskMeaningReview(input: Input): TaskMeaningReviewView {
  const key = requestIdentityKey(input);
  const providerToken = useMemo(() => Object.freeze({ key, capture: input.captureTaskBaseline }), [key, input.captureTaskBaseline]);
  const latest = useRef({ input, providerToken });
  useLayoutEffect(() => { latest.current = { input, providerToken }; }, [input, providerToken]);
  const [state, setState] = useState<{ key: string | null; providerToken: object | null; result: Preparation | null; accepted: boolean }>({ key: null, providerToken: null, result: null, accepted: false });
  useEffect(() => {
    let cancelled = false;
    if (!key) return;
    void prepare(input).then((result) => {
      if (cancelled || latest.current.providerToken !== providerToken
        || requestIdentityKey(latest.current.input) !== key) return;
      const frozen = freeze(result);
      setState({ key, providerToken, result: frozen, accepted: false });
    });
    return () => { cancelled = true; };
    // `key` contains every captured request and relevant connection fact; provider identity changes
    // when the Home capture context (including source binding) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, providerToken]);
  const markMeaningAccepted = useCallback(async ({ acknowledgeFullScope }: { acknowledgeFullScope: boolean }) => {
    const expectedKey = key;
    const prepared = state.key === key && state.providerToken === providerToken && state.result?.status === 'ready' ? state.result : null;
    if (!acknowledgeFullScope || !expectedKey || !prepared || latest.current.providerToken !== providerToken) return false;
    const refreshed = await prepare(latest.current.input);
    if (latest.current.providerToken !== providerToken
      || requestIdentityKey(latest.current.input) !== expectedKey
      || refreshed.status !== 'ready' || refreshed.proposal.digest !== prepared.proposal.digest) return false;
    setState((current) => {
      if (current.key !== expectedKey || current.providerToken !== providerToken) return current;
      return { ...current, accepted: true };
    });
    return true;
  }, [key, providerToken, state]);
  const turn = turnOf(input);
  const connection = turn ? currentConnection(input, turn) : { status: 'missing' as const, actualRoot: null };
  return useMemo(() => {
    const result = state.key === key && state.providerToken === providerToken ? state.result : null;
    const ready = result?.status === 'ready' ? result : null;
    const status = !key ? 'idle' : !result ? 'loading' : result.status;
    const knownRootMismatch = connection.status === 'mismatch';
    // The callback reads the committed latest-input ref only after the person invokes it.
    // eslint-disable-next-line react-hooks/refs
    return Object.freeze({ status, requestKey: opaqueRequestKey(key), reasons: result?.reasons ?? [], items: ready?.diff.items ?? [], coverage: ready?.diff.coverage ?? EMPTY_COVERAGE, proposal: ready?.proposal ?? null, historicalBasis: ready ? { meaningBasis: ready.historical.meaningBasis, sourceBasisId: ready.historical.sourceBasis!.sourceBasisId } : null, currentBasis: ready ? { meaningBasis: ready.current.meaningBasis, sourceBasisId: ready.current.sourceBasis!.sourceBasisId } : null, meaningStatus: state.key === key && state.providerToken === providerToken && state.accepted ? 'accepted' : ready ? 'unreviewed' : 'unknown', executionBlocked: knownRootMismatch || (result?.status === 'unavailable' && result.executionBlocked === true), actualReportedRoot: knownRootMismatch ? connection.actualRoot : result?.status === 'unavailable' ? result.actualReportedRoot ?? null : null, guardStatus: ready?.guardStatus ?? 'unknown', markMeaningAccepted });
  }, [connection.actualRoot, connection.status, key, markMeaningAccepted, providerToken, state]);
}
