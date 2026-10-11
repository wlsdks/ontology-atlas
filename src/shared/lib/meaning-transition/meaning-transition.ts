/**
 * Pure V4.1 transition evidence. This module validates and serializes an
 * inspectable candidate only; it does not authenticate a human, write a vault,
 * or turn ACP permission/tool completion into meaning acceptance.
 */
const MEANING_TRANSITION_SCHEMA = 'atlas-meaning-transition/v1' as const;
const MAX_MEANING_TRANSITION_BYTES = 1_000_000;

type Sha256 = `sha256:${string}`;
type TransitionOutcome = 'accepted_complete' | 'accepted_partial' | 'accepted_unverified' | 'rejected' | 'deferred' | 'unknown';

interface TaskIdentity {
  vaultId: string;
  sessionGeneration: number;
  userEventId: string;
  requestId: string | number;
  toolCallId: string;
}

interface MeaningDocumentIdentity {
  path: string;
  contentDigest: Sha256;
  sourceRevision: string | null;
  meaningRevision: string;
  graphRevision: string | null;
}

interface RetainedArtifactRef {
  ref: string;
  contentDigest: Sha256;
}

interface ProposalRow {
  rowId: string;
  operation: string;
  target: string;
  rawGuardDigest: Sha256;
  expectedPersistedDigest: Sha256;
}

interface RowEvidence {
  rowId: string;
  execution: 'completed' | 'failed' | 'not_run' | 'unknown';
  readback: 'matched' | 'mismatched' | 'missing' | 'unknown';
  persistedDigest: Sha256 | null;
  error: string | null;
}

interface MeaningDecision {
  /** A supplied UI action fact, not authentication of a person's identity. */
  actor: 'user_action';
  disposition: 'accepted' | 'rejected' | 'deferred' | 'unknown';
  proposalDigest: Sha256;
  rowManifestDigest: Sha256;
  taskDigest: Sha256;
  identity: TaskIdentity;
  acceptanceBasis: { vaultId: string; documents: MeaningDocumentIdentity[] };
  rationale: string;
  acceptedGaps: string[];
}

interface RepositoryIdentity {
  repositoryId: string;
  baseRevision: string | null;
  currentRevision: string | null;
}

export interface MeaningTransitionCandidate {
  schema: typeof MEANING_TRANSITION_SCHEMA;
  eventId: string;
  createdAt: string;
  identity: TaskIdentity;
  task: { label: string; digest: Sha256 };
  proposal: {
    digest: Sha256;
    rowManifestDigest: Sha256;
    operation: string;
    artifact: RetainedArtifactRef;
    rows: ProposalRow[];
  };
  decision: MeaningDecision;
  historicalBefore: MeaningDocumentIdentity[];
  currentAcceptance: {
    vaultId: string;
    proposalDigest: Sha256;
    taskDigest: Sha256;
    documents: MeaningDocumentIdentity[];
  };
  verifiedAfter: Array<MeaningDocumentIdentity & { rowId: string }>;
  rowEvidence: RowEvidence[];
  codeEvidence: {
    sourceRepository: RepositoryIdentity;
    vaultRepository: RepositoryIdentity;
    observedTaskPaths: string[];
    diffArtifact: RetainedArtifactRef | null;
  };
  receipts: {
    codeChecks: { status: 'passed' | 'failed' | 'not_run' | 'unknown'; refs: string[] };
    merge: { status: 'merged' | 'pending' | 'not_applicable' | 'unknown'; refs: string[] };
    deployment: { status: 'deployed' | 'failed' | 'pending' | 'not_applicable' | 'unknown'; refs: string[] };
  };
  outcome: TransitionOutcome;
  remainingQuestions: string[];
  recordDigest: Sha256;
}

export type MeaningTransitionInput = Omit<MeaningTransitionCandidate, 'schema' | 'outcome' | 'recordDigest' | 'proposal'> & {
  proposal: Omit<MeaningTransitionCandidate['proposal'], 'rowManifestDigest'>;
};
export type MeaningTransitionPreparation =
  | { status: 'not_created'; reason: 'no_semantic_delta' | 'meaning_preserving_refactor' | 'unrelated_task' }
  | { status: 'candidate'; record: MeaningTransitionCandidate };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)[^\0]+$/;

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new Error(`${name} must be a plain object.`);
  }
  return value as Record<string, unknown>;
}

function fields(value: Record<string, unknown>, keys: readonly string[], name: string): void {
  if (keys.some((key) => !(key in value)) || Object.keys(value).some((key) => !keys.includes(key))) {
    throw new Error(`${name} has missing or unsupported fields.`);
  }
}

function text(value: unknown, name: string, maximum = 10_000, allowEmpty = false): asserts value is string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || value.length > maximum) throw new Error(`${name} must be a bounded string.`);
}

function digest(value: unknown, name: string): asserts value is Sha256 {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new Error(`${name} must be a SHA-256 digest.`);
}

function oneOf(value: unknown, choices: readonly string[], name: string): void {
  if (typeof value !== 'string' || !choices.includes(value)) throw new Error(`${name} is unsupported.`);
}

function array(value: unknown, name: string, maximum = 500): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`${name} must be a bounded array.`);
  return value;
}

function strings(value: unknown, name: string): string[] {
  const result = array(value, name).map((item) => { text(item, name, 2_000); return item; });
  if (new Set(result).size !== result.length) throw new Error(`${name} must not contain duplicates.`);
  return result;
}

function identity(value: unknown, name: string): TaskIdentity {
  const row = object(value, name);
  fields(row, ['vaultId', 'sessionGeneration', 'userEventId', 'requestId', 'toolCallId'], name);
  for (const key of ['vaultId', 'userEventId', 'toolCallId']) text(row[key], `${name}.${key}`, 500);
  if (typeof row.requestId === 'string') text(row.requestId, `${name}.requestId`, 500);
  else if (!Number.isSafeInteger(row.requestId)) throw new Error(`${name}.requestId must be a bounded string or safe integer.`);
  if (!Number.isSafeInteger(row.sessionGeneration) || (row.sessionGeneration as number) < 0) throw new Error(`${name}.sessionGeneration must be a non-negative integer.`);
  return row as unknown as TaskIdentity;
}

function sameIdentity(left: TaskIdentity, right: TaskIdentity): boolean {
  return left.vaultId === right.vaultId && left.sessionGeneration === right.sessionGeneration
    && left.userEventId === right.userEventId && left.requestId === right.requestId && left.toolCallId === right.toolCallId;
}

function documentIdentity(value: unknown, name: string): MeaningDocumentIdentity {
  const row = object(value, name);
  fields(row, ['path', 'contentDigest', 'sourceRevision', 'meaningRevision', 'graphRevision'], name);
  text(row.path, `${name}.path`, 2_000);
  if (!SAFE_PATH.test(row.path as string)) throw new Error(`${name}.path must be vault-relative.`);
  digest(row.contentDigest, `${name}.contentDigest`);
  if (row.sourceRevision !== null) text(row.sourceRevision, `${name}.sourceRevision`, 500);
  text(row.meaningRevision, `${name}.meaningRevision`, 500);
  if (row.graphRevision !== null) text(row.graphRevision, `${name}.graphRevision`, 500);
  return row as unknown as MeaningDocumentIdentity;
}

function artifact(value: unknown, name: string): RetainedArtifactRef {
  const row = object(value, name);
  fields(row, ['ref', 'contentDigest'], name);
  text(row.ref, `${name}.ref`, 2_000);
  digest(row.contentDigest, `${name}.contentDigest`);
  return row as unknown as RetainedArtifactRef;
}

function sameDocuments(left: MeaningDocumentIdentity[], right: MeaningDocumentIdentity[]): boolean {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function deriveOutcome(record: Omit<MeaningTransitionCandidate, 'outcome' | 'recordDigest'>): TransitionOutcome {
  if (record.decision.disposition === 'rejected') return 'rejected';
  if (record.decision.disposition === 'deferred') return 'deferred';
  if (record.decision.disposition !== 'accepted') return 'unknown';
  const currentPaths = new Set(record.currentAcceptance.documents.map((document) => document.path));
  const bindingValid = sameIdentity(record.identity, record.decision.identity)
    && record.identity.vaultId === record.currentAcceptance.vaultId
    && record.task.digest === record.decision.taskDigest
    && record.task.digest === record.currentAcceptance.taskDigest
    && record.proposal.digest === record.decision.proposalDigest
    && record.proposal.digest === record.currentAcceptance.proposalDigest
    && record.proposal.rowManifestDigest === record.decision.rowManifestDigest
    && record.decision.acceptanceBasis.vaultId === record.currentAcceptance.vaultId
    && record.currentAcceptance.documents.length > 0
    && record.currentAcceptance.documents.every((document) => document.sourceRevision !== null)
    && record.proposal.rows.every((proposalRow) => currentPaths.has(proposalRow.target))
    && sameDocuments(record.decision.acceptanceBasis.documents, record.currentAcceptance.documents);
  if (!bindingValid) return 'accepted_unverified';
  const evidence = new Map(record.rowEvidence.map((row) => [row.rowId, row]));
  const after = new Map(record.verifiedAfter.map((document) => [document.rowId, document]));
  const complete = record.proposal.rows.length > 0 && evidence.size === record.proposal.rows.length
    && record.proposal.rows.every((row) => {
      const observed = evidence.get(row.rowId);
      const persisted = after.get(row.rowId);
      return observed?.execution === 'completed' && observed.readback === 'matched'
        && observed.persistedDigest === row.expectedPersistedDigest
        && persisted?.path === row.target && persisted.contentDigest === row.expectedPersistedDigest;
    });
  return complete && after.size === record.proposal.rows.length ? 'accepted_complete' : 'accepted_partial';
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([key, child]) => [key, stable(child)]));
  return value;
}

async function hash(value: unknown): Promise<Sha256> {
  const bytes = new TextEncoder().encode(JSON.stringify(stable(value)));
  const result = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return `sha256:${Array.from(result, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function validateMeaningTransition(value: unknown): MeaningTransitionCandidate {
  const row = object(value, 'meaning transition');
  fields(row, ['schema', 'eventId', 'createdAt', 'identity', 'task', 'proposal', 'decision', 'historicalBefore', 'currentAcceptance', 'verifiedAfter', 'rowEvidence', 'codeEvidence', 'receipts', 'outcome', 'remainingQuestions', 'recordDigest'], 'meaning transition');
  oneOf(row.schema, [MEANING_TRANSITION_SCHEMA], 'schema');
  if (typeof row.eventId !== 'string' || !UUID.test(row.eventId)) throw new Error('eventId must be a UUIDv4.');
  text(row.createdAt, 'createdAt', 24);
  if (new Date(row.createdAt as string).toISOString() !== row.createdAt) throw new Error('createdAt must be an exact UTC timestamp.');
  const taskIdentity = identity(row.identity, 'identity');
  const task = object(row.task, 'task'); fields(task, ['label', 'digest'], 'task'); text(task.label, 'task.label', 500); digest(task.digest, 'task.digest');
  const proposal = object(row.proposal, 'proposal'); fields(proposal, ['digest', 'rowManifestDigest', 'operation', 'artifact', 'rows'], 'proposal');
  digest(proposal.digest, 'proposal.digest'); digest(proposal.rowManifestDigest, 'proposal.rowManifestDigest'); text(proposal.operation, 'proposal.operation', 200); artifact(proposal.artifact, 'proposal.artifact');
  const proposalIds = new Set<string>();
  for (const value of array(proposal.rows, 'proposal.rows')) {
    const item = object(value, 'proposal row'); fields(item, ['rowId', 'operation', 'target', 'rawGuardDigest', 'expectedPersistedDigest'], 'proposal row');
    text(item.rowId, 'proposal row id', 500); text(item.operation, 'proposal row operation', 200); text(item.target, 'proposal row target', 2_000);
    digest(item.rawGuardDigest, 'proposal row raw guard'); digest(item.expectedPersistedDigest, 'proposal row persisted digest');
    if (proposalIds.has(item.rowId as string)) throw new Error('Duplicate proposal row id.'); proposalIds.add(item.rowId as string);
  }
  const decision = object(row.decision, 'decision'); fields(decision, ['actor', 'disposition', 'proposalDigest', 'rowManifestDigest', 'taskDigest', 'identity', 'acceptanceBasis', 'rationale', 'acceptedGaps'], 'decision');
  oneOf(decision.actor, ['user_action'], 'decision.actor'); oneOf(decision.disposition, ['accepted', 'rejected', 'deferred', 'unknown'], 'decision.disposition');
  digest(decision.proposalDigest, 'decision.proposalDigest'); digest(decision.rowManifestDigest, 'decision.rowManifestDigest'); digest(decision.taskDigest, 'decision.taskDigest'); identity(decision.identity, 'decision.identity');
  const acceptanceBasis = object(decision.acceptanceBasis, 'decision.acceptanceBasis'); fields(acceptanceBasis, ['vaultId', 'documents'], 'decision.acceptanceBasis');
  text(acceptanceBasis.vaultId, 'decision.acceptanceBasis.vaultId', 500);
  const decisionDocuments = array(acceptanceBasis.documents, 'decision.acceptanceBasis.documents').map((item) => documentIdentity(item, 'decision acceptance document'));
  if (new Set(decisionDocuments.map((item) => item.path)).size !== decisionDocuments.length) throw new Error('Duplicate decision acceptance document path.');
  text(decision.rationale, 'decision.rationale', 20_000); strings(decision.acceptedGaps, 'decision.acceptedGaps');
  const before = array(row.historicalBefore, 'historicalBefore').map((item) => documentIdentity(item, 'historicalBefore document'));
  if (new Set(before.map((item) => item.path)).size !== before.length) throw new Error('Duplicate historical document path.');
  const current = object(row.currentAcceptance, 'currentAcceptance'); fields(current, ['vaultId', 'proposalDigest', 'taskDigest', 'documents'], 'currentAcceptance');
  text(current.vaultId, 'currentAcceptance.vaultId', 500); digest(current.proposalDigest, 'currentAcceptance.proposalDigest'); digest(current.taskDigest, 'currentAcceptance.taskDigest');
  const currentDocs = array(current.documents, 'currentAcceptance.documents').map((item) => documentIdentity(item, 'currentAcceptance document'));
  if (new Set(currentDocs.map((item) => item.path)).size !== currentDocs.length) throw new Error('Duplicate current acceptance document path.');
  const after = array(row.verifiedAfter, 'verifiedAfter').map((item) => {
    const document = object(item, 'verifiedAfter document');
    fields(document, ['rowId', 'path', 'contentDigest', 'sourceRevision', 'meaningRevision', 'graphRevision'], 'verifiedAfter document');
    text(document.rowId, 'verifiedAfter row id', 500);
    documentIdentity({ path: document.path, contentDigest: document.contentDigest, sourceRevision: document.sourceRevision, meaningRevision: document.meaningRevision, graphRevision: document.graphRevision }, 'verifiedAfter document');
    return document as unknown as MeaningDocumentIdentity & { rowId: string };
  });
  if (new Set(after.map((item) => item.rowId)).size !== after.length) throw new Error('Duplicate verified after row id.');
  if (after.some((item) => !proposalIds.has(item.rowId))) throw new Error('Verified after document does not belong to the proposal.');
  const evidenceIds = new Set<string>();
  for (const value of array(row.rowEvidence, 'rowEvidence')) {
    const item = object(value, 'row evidence'); fields(item, ['rowId', 'execution', 'readback', 'persistedDigest', 'error'], 'row evidence');
    text(item.rowId, 'row evidence id', 500); oneOf(item.execution, ['completed', 'failed', 'not_run', 'unknown'], 'row execution'); oneOf(item.readback, ['matched', 'mismatched', 'missing', 'unknown'], 'row readback');
    if (item.persistedDigest !== null) digest(item.persistedDigest, 'row persisted digest'); if (item.error !== null) text(item.error, 'row error', 5_000);
    if (evidenceIds.has(item.rowId as string)) throw new Error('Duplicate row evidence id.'); evidenceIds.add(item.rowId as string);
    if (!proposalIds.has(item.rowId as string)) throw new Error('Row evidence does not belong to the proposal.');
    if (item.readback === 'matched' && item.persistedDigest === null) throw new Error('Matched readback requires a persisted digest.');
  }
  const code = object(row.codeEvidence, 'codeEvidence'); fields(code, ['sourceRepository', 'vaultRepository', 'observedTaskPaths', 'diffArtifact'], 'codeEvidence');
  for (const key of ['sourceRepository', 'vaultRepository']) {
    const repo = object(code[key], key); fields(repo, ['repositoryId', 'baseRevision', 'currentRevision'], key); text(repo.repositoryId, `${key}.repositoryId`, 1_000);
    if (repo.baseRevision !== null) text(repo.baseRevision, `${key}.baseRevision`, 500); if (repo.currentRevision !== null) text(repo.currentRevision, `${key}.currentRevision`, 500);
  }
  strings(code.observedTaskPaths, 'observedTaskPaths'); if (code.diffArtifact !== null) artifact(code.diffArtifact, 'diffArtifact');
  const receipts = object(row.receipts, 'receipts'); fields(receipts, ['codeChecks', 'merge', 'deployment'], 'receipts');
  for (const [key, choices] of [['codeChecks', ['passed', 'failed', 'not_run', 'unknown']], ['merge', ['merged', 'pending', 'not_applicable', 'unknown']], ['deployment', ['deployed', 'failed', 'pending', 'not_applicable', 'unknown']]] as const) {
    const receipt = object(receipts[key], `${key} receipt`); fields(receipt, ['status', 'refs'], `${key} receipt`); oneOf(receipt.status, choices, `${key} status`); strings(receipt.refs, `${key} refs`);
    if (['passed', 'merged', 'deployed'].includes(receipt.status as string) && (receipt.refs as string[]).length === 0) throw new Error(`${key} success requires evidence refs.`);
  }
  strings(row.remainingQuestions, 'remainingQuestions'); digest(row.recordDigest, 'recordDigest');
  oneOf(row.outcome, ['accepted_complete', 'accepted_partial', 'accepted_unverified', 'rejected', 'deferred', 'unknown'], 'outcome');
  const candidate = row as unknown as MeaningTransitionCandidate;
  const { outcome: _outcome, recordDigest: _recordDigest, ...candidateContent } = candidate;
  const derived = deriveOutcome(candidateContent);
  if (candidate.outcome !== derived) throw new Error(`Outcome must be derived as ${derived}.`);
  if (candidate.outcome === 'accepted_complete') {
    if (after.length !== proposalIds.size) throw new Error('Accepted completion requires one verified after document per proposal row.');
  }
  void taskIdentity;
  return candidate;
}

export async function prepareMeaningTransition(input: MeaningTransitionInput & { semanticDelta: 'present' } | { semanticDelta: 'none' | 'meaning_preserving_refactor' | 'unrelated' }): Promise<MeaningTransitionPreparation> {
  if (!['present', 'none', 'meaning_preserving_refactor', 'unrelated'].includes(input.semanticDelta)) throw new Error('semanticDelta is unsupported.');
  if (input.semanticDelta !== 'present') {
    return { status: 'not_created', reason: input.semanticDelta === 'none' ? 'no_semantic_delta' : input.semanticDelta === 'unrelated' ? 'unrelated_task' : 'meaning_preserving_refactor' };
  }
  const { semanticDelta: _, ...raw } = structuredClone(input);
  const proposal = { ...raw.proposal, rowManifestDigest: await hash({ operation: raw.proposal.operation, rows: raw.proposal.rows }) };
  const content = { schema: MEANING_TRANSITION_SCHEMA, ...raw, proposal };
  const withoutDigest = { ...content, outcome: deriveOutcome(content) };
  const record = { ...withoutDigest, recordDigest: await hash(withoutDigest) };
  return { status: 'candidate', record: deepFreeze(validateMeaningTransition(record)) };
}

export async function verifyMeaningTransitionDigest(value: MeaningTransitionCandidate): Promise<boolean> {
  try {
    const record = validateMeaningTransition(value);
    const { recordDigest, ...content } = record;
    return await hash({ operation: record.proposal.operation, rows: record.proposal.rows }) === record.proposal.rowManifestDigest
      && await hash(content) === recordDigest;
  } catch {
    return false;
  }
}

export function serializeMeaningTransition(value: MeaningTransitionCandidate): string {
  const record = validateMeaningTransition(value);
  const lines = Object.entries(record).filter(([key]) => !['remainingQuestions'].includes(key)).map(([key, item]) => `${key === 'eventId' ? 'event_id' : key === 'createdAt' ? 'created_at' : key === 'recordDigest' ? 'record_digest' : key}: ${JSON.stringify(item)}`);
  const body = record.remainingQuestions.length ? `## Remaining questions\n\n${record.remainingQuestions.map((item) => `- ${JSON.stringify(item)}`).join('\n')}\n` : '## Remaining questions\n\nNone recorded.\n';
  const markdown = `---\n${lines.join('\n')}\n---\n${body}`;
  if (new TextEncoder().encode(markdown).byteLength > MAX_MEANING_TRANSITION_BYTES) throw new Error('Meaning transition exceeds the supported byte budget.');
  return markdown;
}

export async function parseMeaningTransition(markdown: string): Promise<MeaningTransitionCandidate> {
  if (new TextEncoder().encode(markdown).byteLength > MAX_MEANING_TRANSITION_BYTES) throw new Error('Meaning transition exceeds the supported byte budget.');
  const opening = /^---\r?\n/.exec(markdown); if (!opening) throw new Error('Meaning transition frontmatter is missing.');
  const rest = markdown.slice(opening[0].length); const closing = /\r?\n---\r?\n/.exec(rest); if (!closing) throw new Error('Meaning transition frontmatter is incomplete.');
  const headers: Record<string, unknown> = Object.create(null);
  for (const line of rest.slice(0, closing.index).split(/\r?\n/)) {
    const pair = /^([a-zA-Z][a-zA-Z0-9_]*): (.*)$/.exec(line); if (!pair) throw new Error('Meaning transition metadata must use supported JSON flow values.');
    const key = pair[1] === 'event_id' ? 'eventId' : pair[1] === 'created_at' ? 'createdAt' : pair[1] === 'record_digest' ? 'recordDigest' : pair[1];
    if (Object.hasOwn(headers, key)) throw new Error(`Duplicate meaning transition metadata: ${key}.`);
    headers[key] = JSON.parse(pair[2]);
  }
  const body = rest.slice(closing.index + closing[0].length);
  const none = '## Remaining questions\n\nNone recorded.\n';
  if (body === none) headers.remainingQuestions = [];
  else {
    const match = /^## Remaining questions\r?\n\r?\n([\s\S]*)$/.exec(body); if (!match) throw new Error('Meaning transition body is unsupported.');
    const lines = match[1].replace(/\r?\n$/, '').split(/\r?\n/); if (lines.some((line) => !line.startsWith('- '))) throw new Error('Meaning transition questions are malformed.');
    headers.remainingQuestions = lines.map((line) => JSON.parse(line.slice(2)));
  }
  const record = validateMeaningTransition({ ...headers });
  if (await hash({ operation: record.proposal.operation, rows: record.proposal.rows }) !== record.proposal.rowManifestDigest) throw new Error('Meaning transition proposal manifest digest does not match its operation and rows.');
  if (!await verifyMeaningTransitionDigest(record)) throw new Error('Meaning transition record digest does not match its content.');
  return deepFreeze(record);
}
