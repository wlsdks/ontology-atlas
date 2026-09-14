const SCHEMA = 'atlas-meaning-transition/v2' as const;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const LIMIT = 1_000_000;
type Sha256 = `sha256:${string}`;
type RequestId = string | number;

interface TransitionV2ArtifactRef { ref: string; contentDigest: Sha256 }
interface TransitionV2Identity { vaultId: string; sessionGeneration: number; userEventId: string; requestId: RequestId; toolCallId: string }
interface TransitionV2ProposalBinding {
  identity: TransitionV2Identity;
  request: { outcome: string; nonGoals: string[] | null };
  sourceRevision: string | null;
  meaningRevision: string | null;
  contentDigest: string | null;
  rawInput: Record<string, unknown>;
  digest: string;
}
type TransitionV2ReviewEvidence =
  | { status: 'unavailable'; reason: string }
  | {
      status: 'observed';
      proposalBinding: TransitionV2ProposalBinding;
      source: {
        status: 'observed'; rootPath: string; sourceId: string; kind: 'git' | 'folder'; revision: string;
        fingerprint: string; dirty: boolean | null; sourceBasisId: string;
      };
    };
type TransitionV2GitObservation =
  | { status: 'observed'; repositoryId: string; revision: string; dirty: boolean }
  | { status: 'unavailable'; reason: string };
type TransitionV2Correlation =
  | { status: 'observed'; sessionId: string; requestId: RequestId; toolCallId: string; evidence: 'structured_mcp_approval'; executionPermission: 'pending' | 'allowed' | 'rejected' }
  | { status: 'unavailable'; reason: string; executionPermission: 'unknown' };
interface TransitionV2Row {
  rowId: string; operation: string; target: string; rawGuardDigest: Sha256; expectedPersistedDigest: Sha256;
}
interface TransitionV2RowEvidence {
  rowId: string; execution: 'completed' | 'failed' | 'not_run' | 'unknown';
  readback: 'matched' | 'mismatched' | 'missing' | 'unknown'; persistedDigest: Sha256 | null; error: string | null;
}
export interface MeaningTransitionV2 {
  schema: typeof SCHEMA;
  eventId: string;
  createdAt: string;
  decisionId: string;
  phase: 'decision' | 'terminal';
  previous: null | { eventId: string; createdAt: string; recordDigest: Sha256 };
  identity: TransitionV2Identity;
  task: { label: string; digest: Sha256 };
  proposal: {
    digest: Sha256; rowManifestDigest: Sha256; operation: string; rows: TransitionV2Row[];
    artifacts: { retainedBefore: TransitionV2ArtifactRef; preview: TransitionV2ArtifactRef; decision: TransitionV2ArtifactRef };
  };
  meaningDecision: {
    decisionId: string; action: 'accept_meaning' | 'reject_meaning' | 'defer_meaning'; actionAt: string;
    actor: 'user_action'; authentication: 'unverified'; rationale: string | null; acceptedGaps: string[];
  };
  reviewEvidence: TransitionV2ReviewEvidence;
  acpCorrelation: TransitionV2Correlation;
  git: { source: TransitionV2GitObservation; vault: TransitionV2GitObservation };
  rowEvidence: TransitionV2RowEvidence[];
  receipts: { codeChecks: 'unknown'; merge: 'unknown'; deployment: 'unknown' };
  remainingQuestions: string[];
  outcome: 'accepted_unverified' | 'accepted_partial' | 'accepted_complete' | 'rejected' | 'deferred' | 'unknown';
  recordDigest: Sha256;
}

export type MeaningTransitionV2Input = Omit<MeaningTransitionV2, 'schema' | 'outcome' | 'recordDigest' | 'proposal'> & {
  proposal: Omit<MeaningTransitionV2['proposal'], 'rowManifestDigest'>;
};

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([key, child]) => [key, stable(child)]));
  return value;
}
function proposalStable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(proposalStable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, proposalStable(child)]));
  return value;
}
async function hash(value: unknown): Promise<Sha256> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(stable(value)))));
  return `sha256:${[...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
async function proposalBindingDigest(binding: TransitionV2ProposalBinding): Promise<Sha256> {
  const { digest: _, ...content } = binding;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(proposalStable(content)))));
  return `sha256:${[...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
async function hashText(value: string): Promise<Sha256> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return `sha256:${[...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
export const meaningTransitionV2TextDigest = hashText;
const nonblank = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const exactTime = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const sha = (value: unknown): value is Sha256 => typeof value === 'string' && DIGEST.test(value);
function requestId(value: unknown): value is RequestId { return typeof value === 'string' || Number.isSafeInteger(value); }
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function plainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function jsonValue(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(jsonValue);
  return plainRecord(value) && Object.values(value).every(jsonValue);
}
function sameIdentity(left: TransitionV2Identity, right: TransitionV2Identity): boolean {
  return left.vaultId === right.vaultId && left.sessionGeneration === right.sessionGeneration && left.userEventId === right.userEventId
    && typeof left.requestId === typeof right.requestId && left.requestId === right.requestId && left.toolCallId === right.toolCallId;
}
function same(value: unknown, other: unknown): boolean { return JSON.stringify(stable(value)) === JSON.stringify(stable(other)); }
function deriveOutcome(record: Omit<MeaningTransitionV2, 'outcome' | 'recordDigest'>): MeaningTransitionV2['outcome'] {
  if (record.meaningDecision.action === 'reject_meaning') return 'rejected';
  if (record.meaningDecision.action === 'defer_meaning') return 'deferred';
  if (record.meaningDecision.action !== 'accept_meaning') return 'unknown';
  if (record.phase === 'decision') return 'accepted_unverified';
  const evidence = new Map(record.rowEvidence.map((row) => [row.rowId, row]));
  if (record.reviewEvidence.status === 'observed'
    && record.acpCorrelation.status === 'observed' && record.acpCorrelation.executionPermission === 'allowed'
    && record.proposal.rows.every((row) => {
    const observed = evidence.get(row.rowId);
    return observed?.execution === 'completed' && observed.readback === 'matched'
      && observed.persistedDigest === row.expectedPersistedDigest;
  })) return 'accepted_complete';
  return record.rowEvidence.some((row) => row.execution !== 'not_run' && row.execution !== 'unknown') ? 'accepted_partial' : 'accepted_unverified';
}
async function reviewEvidenceMatchesProposal(record: Pick<MeaningTransitionV2, 'identity' | 'task' | 'proposal' | 'reviewEvidence'>): Promise<boolean> {
  if (record.reviewEvidence.status === 'unavailable') return true;
  const binding = record.reviewEvidence.proposalBinding;
  const row = record.proposal.rows[0];
  return Boolean(row
    && binding.digest === record.proposal.digest
    && binding.contentDigest === row.rawGuardDigest
    && binding.rawInput.slug === row.target
    && record.task.label === binding.request.outcome
    && record.task.digest === await hashText(JSON.stringify(binding.request))
    && sameIdentity(binding.identity, record.identity));
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { for (const child of Object.values(value as Record<string, unknown>)) freeze(child); Object.freeze(value); }
  return value;
}

function validate(record: MeaningTransitionV2): void {
  if (record.schema !== SCHEMA || !UUID.test(record.eventId) || !UUID.test(record.decisionId) || record.decisionId !== record.meaningDecision.decisionId) throw new Error('Meaning transition v2 identity is invalid.');
  if (!exactTime(record.createdAt) || !exactTime(record.meaningDecision.actionAt)) throw new Error('Snapshot and action timestamps must be exact UTC times.');
  if (!['decision', 'terminal'].includes(record.phase)) throw new Error('Meaning transition v2 phase is invalid.');
  const identity = record.identity;
  if (!nonblank(identity.vaultId) || !Number.isSafeInteger(identity.sessionGeneration) || identity.sessionGeneration < 0 || !nonblank(identity.userEventId) || !requestId(identity.requestId) || !nonblank(identity.toolCallId)) throw new Error('Task identity is invalid.');
  if (!nonblank(record.task.label) || !sha(record.task.digest) || !sha(record.proposal.digest) || !sha(record.proposal.rowManifestDigest) || !nonblank(record.proposal.operation) || record.proposal.rows.length === 0 || record.proposal.rows.length > 100) throw new Error('Proposal is invalid.');
  const rowIds = new Set<string>();
  for (const row of record.proposal.rows) {
    if (!nonblank(row.rowId) || !nonblank(row.operation) || !nonblank(row.target) || !sha(row.rawGuardDigest) || !sha(row.expectedPersistedDigest) || rowIds.has(row.rowId)) throw new Error('Proposal row is invalid.');
    rowIds.add(row.rowId);
  }
  for (const artifact of Object.values(record.proposal.artifacts)) if (!nonblank(artifact.ref) || !sha(artifact.contentDigest)) throw new Error('Retained artifact is invalid.');
  if (!['accept_meaning', 'reject_meaning', 'defer_meaning'].includes(record.meaningDecision.action)
    || record.meaningDecision.actor !== 'user_action' || record.meaningDecision.authentication !== 'unverified'
    || (record.meaningDecision.rationale !== null && !nonblank(record.meaningDecision.rationale))
    || !Array.isArray(record.meaningDecision.acceptedGaps) || record.meaningDecision.acceptedGaps.some((gap) => !nonblank(gap))) throw new Error('Meaning decision is invalid.');
  const review = record.reviewEvidence;
  if (!plainRecord(review) || !['observed', 'unavailable'].includes(String(review.status))) throw new Error('Meaning review evidence status is invalid.');
  if (review.status === 'unavailable') {
    if (!exactKeys(review, ['status', 'reason']) || !nonblank(review.reason)) throw new Error('Unavailable meaning review evidence is invalid.');
  } else {
    if (!exactKeys(review, ['status', 'proposalBinding', 'source']) || !plainRecord(review.proposalBinding) || !plainRecord(review.source)) throw new Error('Observed meaning review evidence shape is invalid.');
    const binding = review.proposalBinding;
    const source = review.source;
    if (!exactKeys(binding, ['identity', 'request', 'sourceRevision', 'meaningRevision', 'contentDigest', 'rawInput', 'digest'])
      || !plainRecord(binding.identity) || !exactKeys(binding.identity, ['vaultId', 'sessionGeneration', 'userEventId', 'requestId', 'toolCallId'])
      || !sameIdentity(binding.identity as unknown as TransitionV2Identity, identity)
      || !plainRecord(binding.request) || !exactKeys(binding.request, ['outcome', 'nonGoals']) || !nonblank(binding.request.outcome)
      || (binding.request.nonGoals !== null && (!Array.isArray(binding.request.nonGoals) || binding.request.nonGoals.some((item) => !nonblank(item))))
      || !nonblank(binding.sourceRevision) || !nonblank(binding.meaningRevision) || !sha(binding.contentDigest)
      || !plainRecord(binding.rawInput) || !jsonValue(binding.rawInput) || !sha(binding.digest)) throw new Error('Observed proposal binding is invalid.');
    if (!exactKeys(source, ['status', 'rootPath', 'sourceId', 'kind', 'revision', 'fingerprint', 'dirty', 'sourceBasisId'])
      || source.status !== 'observed' || !nonblank(source.rootPath) || !sha(source.sourceId)
      || !['git', 'folder'].includes(source.kind) || !nonblank(source.revision) || !sha(source.fingerprint)
      || (source.dirty !== null && typeof source.dirty !== 'boolean')
      || typeof source.sourceBasisId !== 'string' || !/^source:sha256:[0-9a-f]{64}$/.test(source.sourceBasisId)
      || binding.sourceRevision !== source.sourceBasisId) throw new Error('Observed source review evidence is invalid.');
  }
  const correlation = record.acpCorrelation;
  if (!['observed', 'unavailable'].includes(correlation.status)) throw new Error('ACP correlation status is invalid.');
  if (correlation.status === 'observed') {
    if (!nonblank(correlation.sessionId) || !requestId(correlation.requestId) || !nonblank(correlation.toolCallId)
      || correlation.evidence !== 'structured_mcp_approval' || correlation.toolCallId !== identity.toolCallId
      || !['pending', 'allowed', 'rejected'].includes(correlation.executionPermission)
      || typeof correlation.requestId !== typeof identity.requestId || correlation.requestId !== identity.requestId) throw new Error('ACP correlation does not match task identity.');
  } else if (!nonblank(correlation.reason) || correlation.executionPermission !== 'unknown') throw new Error('Unavailable ACP correlation is invalid.');
  for (const observation of [record.git.source, record.git.vault]) {
    if (!['observed', 'unavailable'].includes(observation.status)
      || (observation.status === 'observed' ? !nonblank(observation.repositoryId) || !nonblank(observation.revision) || typeof observation.dirty !== 'boolean' : !nonblank(observation.reason))) throw new Error('Git observation is invalid.');
  }
  if (record.receipts.codeChecks !== 'unknown' || record.receipts.merge !== 'unknown' || record.receipts.deployment !== 'unknown') throw new Error('Unsupported authority receipt.');
  const evidenceIds = new Set<string>();
  for (const row of record.rowEvidence) {
    if (!rowIds.has(row.rowId) || evidenceIds.has(row.rowId) || !['completed', 'failed', 'not_run', 'unknown'].includes(row.execution)
      || !['matched', 'mismatched', 'missing', 'unknown'].includes(row.readback) || (row.persistedDigest !== null && !sha(row.persistedDigest))
      || (row.error !== null && !nonblank(row.error)) || (row.readback === 'matched' && (row.persistedDigest === null || row.execution !== 'completed'))
      || ((row.execution === 'not_run' || row.execution === 'unknown') && (row.readback !== 'unknown' || row.persistedDigest !== null))) throw new Error('Row evidence is invalid.');
    evidenceIds.add(row.rowId);
  }
  if (record.phase === 'decision') {
    if (record.previous !== null || record.rowEvidence.length !== record.proposal.rows.length
      || record.rowEvidence.some((row) => row.execution !== 'not_run' || row.readback !== 'unknown' || row.persistedDigest !== null)) throw new Error('Decision snapshot must precede execution.');
  } else {
    if (!record.previous || !UUID.test(record.previous.eventId) || !exactTime(record.previous.createdAt) || !sha(record.previous.recordDigest)
      || record.previous.eventId === record.eventId) throw new Error('Terminal snapshot previous link is invalid.');
    if (record.rowEvidence.length !== record.proposal.rows.length) throw new Error('Terminal snapshot row coverage is incomplete.');
  }
  if (record.phase === 'decision' && correlation.status === 'observed' && correlation.executionPermission !== 'pending') throw new Error('Decision snapshot cannot claim an execution permission result.');
  if (record.phase === 'terminal' && correlation.status === 'observed' && correlation.executionPermission === 'pending') throw new Error('Terminal snapshot requires an actual execution permission result.');
  if (correlation.status === 'observed' && correlation.executionPermission === 'rejected'
    && record.rowEvidence.some((row) => row.execution !== 'not_run')) throw new Error('Rejected execution permission cannot report writer execution.');
  if (!Array.isArray(record.remainingQuestions) || record.remainingQuestions.some((question) => !nonblank(question)) || !sha(record.recordDigest)) throw new Error('Transition remainder or digest is invalid.');
  const { recordDigest: _, outcome: __, ...content } = record;
  if (record.outcome !== deriveOutcome(content)) throw new Error('Meaning transition v2 outcome is inconsistent.');
}

export function prepareMeaningTransitionV2(input: { meaningDecision: null }): Promise<{ status: 'not_created'; reason: 'meaning_decision_unavailable' }>;
export function prepareMeaningTransitionV2(input: MeaningTransitionV2Input): Promise<{ status: 'snapshot'; record: MeaningTransitionV2 }>;
export async function prepareMeaningTransitionV2(input: MeaningTransitionV2Input | { meaningDecision: null }): Promise<{ status: 'snapshot'; record: MeaningTransitionV2 } | { status: 'not_created'; reason: 'meaning_decision_unavailable' }> {
  if (input.meaningDecision === null) return { status: 'not_created', reason: 'meaning_decision_unavailable' };
  const raw = structuredClone(input);
  const proposal = { ...raw.proposal, rowManifestDigest: await hash({ operation: raw.proposal.operation, rows: raw.proposal.rows }) };
  const content = { schema: SCHEMA, ...raw, proposal } as Omit<MeaningTransitionV2, 'outcome' | 'recordDigest'>;
  if (content.reviewEvidence.status === 'observed'
    && content.reviewEvidence.proposalBinding.digest !== await proposalBindingDigest(content.reviewEvidence.proposalBinding)) {
    throw new Error('Meaning transition v2 proposal binding digest is invalid.');
  }
  if (proposal.rows.length !== 1 || proposal.artifacts.retainedBefore.contentDigest !== proposal.rows[0].rawGuardDigest
    || proposal.artifacts.preview.contentDigest !== proposal.rows[0].expectedPersistedDigest
    || proposal.artifacts.decision.contentDigest !== await hashText(meaningTransitionV2DecisionArtifact(content))) {
    throw new Error('Meaning transition v2 artifact roles are not bound to the sealed row and decision bytes.');
  }
  const withoutDigest = { ...content, outcome: deriveOutcome(content) };
  const record = { ...withoutDigest, recordDigest: await hash(withoutDigest) } as MeaningTransitionV2;
  validate(record);
  if (!await reviewEvidenceMatchesProposal(record)) throw new Error('Meaning transition v2 review evidence does not match its task and proposal.');
  return { status: 'snapshot', record: freeze(record) };
}

export function assertMeaningTransitionV2Link(previous: MeaningTransitionV2, next: MeaningTransitionV2): void {
  validate(previous); validate(next);
  if (next.phase !== 'terminal' || !next.previous
    || next.previous.eventId !== previous.eventId || next.previous.createdAt !== previous.createdAt || next.previous.recordDigest !== previous.recordDigest
    || next.decisionId !== previous.decisionId || !sameIdentity(next.identity, previous.identity)
    || !same(next.task, previous.task) || !same(next.proposal, previous.proposal)
    || !same(next.meaningDecision, previous.meaningDecision) || !same(next.reviewEvidence, previous.reviewEvidence)
    || !sameCorrelationBasis(next.acpCorrelation, previous.acpCorrelation)) throw new Error('Meaning transition v2 chain changed or lost its sealed basis.');
}

function sameCorrelationBasis(left: TransitionV2Correlation, right: TransitionV2Correlation): boolean {
  if (left.status !== right.status) return false;
  if (left.status === 'unavailable' || right.status === 'unavailable') return same(left, right);
  return left.sessionId === right.sessionId && left.toolCallId === right.toolCallId
    && typeof left.requestId === typeof right.requestId && left.requestId === right.requestId
    && left.evidence === right.evidence;
}

export async function verifyMeaningTransitionV2(record: MeaningTransitionV2): Promise<boolean> {
  try {
    validate(record); const { recordDigest, ...content } = record;
    return record.proposal.artifacts.retainedBefore.contentDigest === record.proposal.rows[0]?.rawGuardDigest
      && record.proposal.artifacts.preview.contentDigest === record.proposal.rows[0]?.expectedPersistedDigest
      && record.proposal.artifacts.decision.contentDigest === await hashText(meaningTransitionV2DecisionArtifact(record))
      && record.proposal.rowManifestDigest === await hash({ operation: record.proposal.operation, rows: record.proposal.rows })
      && (record.reviewEvidence.status !== 'observed' || record.reviewEvidence.proposalBinding.digest === await proposalBindingDigest(record.reviewEvidence.proposalBinding))
      && await reviewEvidenceMatchesProposal(record)
      && await hash(content) === recordDigest;
  } catch { return false; }
}

export function meaningTransitionV2DecisionArtifact(record: Pick<MeaningTransitionV2, 'decisionId' | 'identity' | 'task' | 'meaningDecision' | 'reviewEvidence'> & { proposal: Pick<MeaningTransitionV2['proposal'], 'digest' | 'operation' | 'rows'> }): string {
  return JSON.stringify(stable({ decisionId: record.decisionId, identity: record.identity, task: record.task,
    proposal: { digest: record.proposal.digest, rowManifest: { operation: record.proposal.operation, rows: record.proposal.rows } },
    meaningDecision: record.meaningDecision, reviewEvidence: record.reviewEvidence }));
}

export function serializeMeaningTransitionV2(record: MeaningTransitionV2): string {
  validate(record);
  const { remainingQuestions, ...headers } = record;
  const lines = Object.entries(headers).map(([key, value]) => `${key === 'eventId' ? 'event_id' : key === 'createdAt' ? 'created_at' : key === 'decisionId' ? 'decision_id' : key === 'recordDigest' ? 'record_digest' : key}: ${JSON.stringify(value)}`);
  const body = remainingQuestions.length ? remainingQuestions.map((question) => `- ${JSON.stringify(question)}`).join('\n') : 'None recorded.';
  const markdown = `---\n${lines.join('\n')}\n---\n## Remaining questions\n\n${body}\n`;
  if (new TextEncoder().encode(markdown).byteLength > LIMIT) throw new Error('Meaning transition v2 exceeds the byte budget.');
  return markdown;
}

export async function parseMeaningTransitionV2(markdown: string): Promise<MeaningTransitionV2> {
  if (new TextEncoder().encode(markdown).byteLength > LIMIT) throw new Error('Meaning transition v2 exceeds the byte budget.');
  const match = /^---\n([\s\S]*?)\n---\n## Remaining questions\n\n([\s\S]*)\n$/.exec(markdown);
  if (!match) throw new Error('Meaning transition v2 envelope is invalid.');
  const headers: Record<string, unknown> = {};
  for (const line of match[1].split('\n')) {
    const pair = /^([a-zA-Z][a-zA-Z0-9_]*): (.*)$/.exec(line); if (!pair) throw new Error('Meaning transition v2 metadata is invalid.');
    const key = pair[1] === 'event_id' ? 'eventId' : pair[1] === 'created_at' ? 'createdAt' : pair[1] === 'decision_id' ? 'decisionId' : pair[1] === 'record_digest' ? 'recordDigest' : pair[1];
    if (Object.hasOwn(headers, key)) throw new Error('Meaning transition v2 metadata repeats a field.');
    headers[key] = JSON.parse(pair[2]);
  }
  const remainingQuestions = match[2] === 'None recorded.' ? [] : match[2].split('\n').map((line) => { if (!line.startsWith('- ')) throw new Error('Meaning transition v2 questions are invalid.'); return JSON.parse(line.slice(2)); });
  const record = { ...headers, remainingQuestions } as unknown as MeaningTransitionV2;
  if (!await verifyMeaningTransitionV2(record)) throw new Error('Meaning transition v2 digest is invalid.');
  return freeze(record);
}
