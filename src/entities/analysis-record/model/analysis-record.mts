/**
 * The browser-safe authority for analysis Markdown. Node 24 MCP/CLI readers use
 * this same module through native type stripping. Keep it free of React, path
 * aliases and filesystem imports; an analysis is a diagnostic record, not a kind.
 */
export const ANALYSIS_SCHEMA = 'atlas-analysis/v1' as const;
export const ANALYSIS_DIRECTORY = '.ontology-atlas/analyses';
export const MAX_ANALYSIS_RECORD_BYTES = 2_000_000;

export interface AnalysisScope {
  projectSlug: string | null;
  projectUid: string | null;
  targetSlugs: string[];
  profileSlug: string | null;
}

export interface AnalysisBasis {
  graphHash: string | null;
  sourceFingerprint: string | null;
  profileHash: string | null;
  documents: Array<{ slug: string; digest: string }>;
}

export interface AnalysisEvidence {
  slug: string;
  uid: string | null;
  title: string;
  kind: string;
  body: string;
  frontmatter: Record<string, unknown>;
  digest: string;
  toolCallId: string;
}

export interface AnalysisFinding {
  id: string;
  category: 'definition' | 'boundary' | 'relation' | 'evidence' | 'architecture';
  title: string;
  detail: string;
  targetSlugs: string[];
  evidenceSlugs: string[];
  roleIds: string[];
  relation: { from: string; to: string; type: string } | null;
  suggestedAction: string;
}

export interface AnalysisRun {
  schema: typeof ANALYSIS_SCHEMA;
  recordType: 'run';
  id: string;
  createdAt: string;
  mode: 'meaning' | 'architecture';
  scope: AnalysisScope;
  request: { id: string; text: string; parentRunId: string | null };
  origin: {
    surface: 'map' | 'analysis' | 'architecture';
    runtimeId: string;
    sessionId: string | null;
    userEventId: string;
    answerEventId: string | null;
    startedAt: string;
    stopReason: string | null;
    outcome: 'completed' | 'cancelled' | 'failed';
  };
  basis: AnalysisBasis;
  evidence: AnalysisEvidence[];
  observations: Array<{ toolCallId: string; name: 'inspect_architecture'; digest: string; result: Record<string, unknown> }>;
  profileSnapshot: { slug: string; digest: string; markdown: string } | null;
  toolReads: Array<{ id: string; name: string; status: string }>;
  sourceAccess: 'atlas-only' | 'source-included' | 'unproven';
  findings: AnalysisFinding[];
  qualification: { status: 'grounded' | 'unverified'; reasons: string[] };
  /** Original final answer. It is the Markdown body, never a second JSON copy. */
  answer: string;
}

export interface AnalysisReview {
  schema: typeof ANALYSIS_SCHEMA;
  recordType: 'review';
  id: string;
  createdAt: string;
  runId: string;
  findingId: string;
  disposition: 'retain' | 'dismiss';
  /** A UI action path, not authentication of a person's identity. */
  actor: 'user-action';
  rationale: string;
}

export type AnalysisRecord = AnalysisRun | AnalysisReview;
export type AnalysisCompatibility = { status: 'current' | 'stale' | 'unknown'; reasons: string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const FILE_NAME = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.md$/;
const RUN_KEYS = ['schema', 'recordType', 'id', 'createdAt', 'mode', 'scope', 'request', 'origin', 'basis', 'evidence', 'observations', 'profileSnapshot', 'toolReads', 'sourceAccess', 'findings', 'qualification', 'answer'];
const REVIEW_KEYS = ['schema', 'recordType', 'id', 'createdAt', 'runId', 'findingId', 'disposition', 'actor', 'rationale'];

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`${name} must be a plain object.`);
  return value as Record<string, unknown>;
}

function fields(value: Record<string, unknown>, keys: readonly string[], name: string): void {
  if (keys.some((key) => !(key in value)) || Object.keys(value).some((key) => !keys.includes(key))) {
    throw new Error(`${name} has missing or unsupported fields.`);
  }
}

function text(value: unknown, name: string, allowEmpty = false, max = 100_000): asserts value is string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || value.length > max) {
    throw new Error(`${name} must be ${allowEmpty ? 'a' : 'a non-empty'} bounded string.`);
  }
}

function nullableText(value: unknown, name: string): void {
  if (value !== null) text(value, name);
}

function oneOf(value: unknown, values: readonly string[], name: string): void {
  if (typeof value !== 'string' || !values.includes(value)) throw new Error(`${name} is unsupported.`);
}

function uuid(value: unknown, name: string): void {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error(`${name} must be a UUIDv4.`);
}

function digest(value: unknown, name: string): void {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new Error(`${name} must be a SHA-256 digest.`);
}

function array(value: unknown, name: string, maximum = 200): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`${name} must be a bounded array.`);
  return value;
}

function strings(value: unknown, name: string, maximum = 200): string[] {
  const items = array(value, name, maximum);
  items.forEach((item) => text(item, name, false, 1024));
  if (new Set(items).size !== items.length) throw new Error(`${name} must not repeat values.`);
  return items as string[];
}

function timestamp(value: unknown): asserts value is string {
  text(value, 'createdAt', false, 24);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new Error('createdAt must be an exact UTC timestamp.');
  }
}

export function validateAnalysisRecord(value: unknown): AnalysisRecord {
  const row = object(value, 'analysis record');
  oneOf(row.schema, [ANALYSIS_SCHEMA], 'analysis schema');
  oneOf(row.recordType, ['run', 'review'], 'record type');
  uuid(row.id, 'record id');
  timestamp(row.createdAt);
  if (row.recordType === 'review') {
    fields(row, REVIEW_KEYS, 'review');
    uuid(row.runId, 'review run id');
    text(row.findingId, 'finding id', false, 200);
    oneOf(row.disposition, ['retain', 'dismiss'], 'review disposition');
    oneOf(row.actor, ['user-action'], 'review actor');
    text(row.rationale, 'review rationale', true);
    return row as unknown as AnalysisReview;
  }
  fields(row, RUN_KEYS, 'run');
  oneOf(row.mode, ['meaning', 'architecture'], 'analysis mode');
  const scope = object(row.scope, 'scope');
  fields(scope, ['projectSlug', 'projectUid', 'targetSlugs', 'profileSlug'], 'scope');
  nullableText(scope.projectSlug, 'project slug');
  if (scope.projectUid !== null) uuid(scope.projectUid, 'project uid');
  strings(scope.targetSlugs, 'scope targets', 5000);
  nullableText(scope.profileSlug, 'profile slug');
  const request = object(row.request, 'request');
  fields(request, ['id', 'text', 'parentRunId'], 'request');
  text(request.id, 'request id', false, 200);
  text(request.text, 'request text', true);
  if (request.parentRunId !== null) uuid(request.parentRunId, 'parent run id');
  const origin = object(row.origin, 'origin');
  fields(origin, ['surface', 'runtimeId', 'sessionId', 'userEventId', 'answerEventId', 'startedAt', 'stopReason', 'outcome'], 'origin');
  oneOf(origin.surface, ['map', 'analysis', 'architecture'], 'origin surface');
  text(origin.runtimeId, 'runtime id', false, 200);
  nullableText(origin.sessionId, 'session id');
  text(origin.userEventId, 'user event id', false, 200);
  nullableText(origin.answerEventId, 'answer event id');
  timestamp(origin.startedAt);
  nullableText(origin.stopReason, 'stop reason');
  oneOf(origin.outcome, ['completed', 'cancelled', 'failed'], 'turn outcome');
  const basis = object(row.basis, 'basis');
  fields(basis, ['graphHash', 'sourceFingerprint', 'profileHash', 'documents'], 'basis');
  if (basis.graphHash !== null) digest(basis.graphHash, 'graph hash');
  nullableText(basis.sourceFingerprint, 'source fingerprint');
  if (basis.profileHash !== null) digest(basis.profileHash, 'profile hash');
  const documentSlugs = new Set<string>();
  for (const item of array(basis.documents, 'basis documents', 5000)) {
    const doc = object(item, 'basis document');
    fields(doc, ['slug', 'digest'], 'basis document');
    text(doc.slug, 'basis slug', false, 1024);
    digest(doc.digest, 'basis document digest');
    if (documentSlugs.has(doc.slug)) throw new Error('Duplicate basis document.');
    documentSlugs.add(doc.slug);
  }
  const evidenceSlugs = new Set<string>();
  const evidenceCalls = new Set<string>();
  for (const item of array(row.evidence, 'evidence', 200)) {
    const ev = object(item, 'evidence');
    fields(ev, ['slug', 'uid', 'title', 'kind', 'body', 'frontmatter', 'digest', 'toolCallId'], 'evidence');
    text(ev.slug, 'evidence slug', false, 1024);
    if (ev.uid !== null) uuid(ev.uid, 'evidence uid');
    text(ev.title, 'evidence title');
    text(ev.kind, 'evidence kind', false, 100);
    text(ev.body, 'evidence body', true, 500_000);
    object(ev.frontmatter, 'evidence frontmatter');
    digest(ev.digest, 'evidence digest');
    text(ev.toolCallId, 'evidence tool call id', false, 200);
    if (evidenceSlugs.has(ev.slug)) throw new Error('Duplicate evidence slug.');
    evidenceSlugs.add(ev.slug);
    evidenceCalls.add(ev.toolCallId);
  }
  const completedReads = new Set<string>();
  if (row.profileSnapshot !== null) {
    const snapshot = object(row.profileSnapshot, 'profile snapshot');
    fields(snapshot, ['slug', 'digest', 'markdown'], 'profile snapshot');
    text(snapshot.slug, 'profile snapshot slug', false, 1024);
    digest(snapshot.digest, 'profile snapshot digest');
    text(snapshot.markdown, 'profile snapshot markdown', false, 500_000);
    if (basis.profileHash !== snapshot.digest) throw new Error('Profile snapshot and basis digest disagree.');
  }
  for (const item of array(row.observations, 'observations', 20)) {
    const observation = object(item, 'observation');
    fields(observation, ['toolCallId', 'name', 'digest', 'result'], 'observation');
    text(observation.toolCallId, 'observation call id', false, 200);
    oneOf(observation.name, ['inspect_architecture'], 'observation tool');
    digest(observation.digest, 'observation digest');
    const result = object(observation.result, 'observation result');
    if (result.contract !== 'architectureBrief:v1') throw new Error('Observation must be an architecture brief.');
  }
  for (const item of array(row.toolReads, 'tool reads', 1000)) {
    const read = object(item, 'tool read');
    fields(read, ['id', 'name', 'status'], 'tool read');
    text(read.id, 'tool read id', false, 200);
    text(read.name, 'tool name', false, 200);
    text(read.status, 'tool status', false, 100);
    if (read.status === 'completed' && ['get_concept', 'get_concepts'].includes(read.name)) completedReads.add(read.id);
  }
  oneOf(row.sourceAccess, ['atlas-only', 'source-included', 'unproven'], 'source access');
  const qualification = object(row.qualification, 'qualification');
  fields(qualification, ['status', 'reasons'], 'qualification');
  oneOf(qualification.status, ['grounded', 'unverified'], 'qualification status');
  const qualificationReasons = strings(qualification.reasons, 'qualification reasons');
  const findingIds = new Set<string>();
  for (const item of array(row.findings, 'findings', 100)) {
    const finding = object(item, 'finding');
    fields(finding, ['id', 'category', 'title', 'detail', 'targetSlugs', 'evidenceSlugs', 'roleIds', 'relation', 'suggestedAction'], 'finding');
    text(finding.id, 'finding id', false, 200);
    if (findingIds.has(finding.id)) throw new Error('Duplicate finding id.');
    findingIds.add(finding.id);
    oneOf(finding.category, ['definition', 'boundary', 'relation', 'evidence', 'architecture'], 'finding category');
    text(finding.title, 'finding title', false, 500);
    text(finding.detail, 'finding detail');
    strings(finding.targetSlugs, 'finding targets');
    const refs = strings(finding.evidenceSlugs, 'finding evidence');
    strings(finding.roleIds, 'finding roles');
    text(finding.suggestedAction, 'suggested action', true);
    if (finding.relation !== null) {
      const relation = object(finding.relation, 'finding relation');
      fields(relation, ['from', 'to', 'type'], 'finding relation');
      for (const key of ['from', 'to', 'type']) text(relation[key], `relation ${key}`, false, 1024);
    }
    if (qualification.status === 'grounded' && (refs.length === 0 || refs.some((slug) => !evidenceSlugs.has(slug)))) {
      throw new Error('A grounded finding requires its full-body evidence.');
    }
  }
  if (qualification.status === 'grounded' && (origin.outcome !== 'completed' || evidenceSlugs.size === 0 || [...evidenceCalls].some((id) => !completedReads.has(id)))) {
    throw new Error('Grounded evidence requires a completed turn and completed full-body reads.');
  }
  if (qualification.status === 'grounded' && (qualificationReasons.length !== 0 || origin.stopReason !== 'end_turn' || !row.answer || request.id !== origin.userEventId
    || (row.mode === 'meaning' && row.sourceAccess !== 'atlas-only')
    || (row.mode === 'architecture' && (!basis.sourceFingerprint || !basis.profileHash || row.profileSnapshot === null || array(row.observations, 'observations', 20).length === 0)))) {
    throw new Error('Grounded analysis has an incomplete or contradictory qualification basis.');
  }
  text(row.answer, 'answer', true, 1_500_000);
  return row as unknown as AnalysisRun;
}

/** JSON flow values are valid YAML, and preserve embedded line breaks exactly. */
export function serializeAnalysisRecord(value: AnalysisRecord): string {
  const record = validateAnalysisRecord(value);
  const bodyKey = record.recordType === 'run' ? 'answer' : 'rationale';
  const lines = Object.entries(record).filter(([key]) => key !== bodyKey).map(([key, item]) => {
    const header = key === 'schema' ? 'analysis_schema' : key === 'recordType' ? 'record_type' : key === 'createdAt' ? 'created_at' : key;
    return `${header}: ${JSON.stringify(item)}`;
  });
  const body = record.recordType === 'run' ? record.answer : record.rationale;
  const markdown = `---\n${lines.join('\n')}\n---\n${body}`;
  if (new TextEncoder().encode(markdown).byteLength > MAX_ANALYSIS_RECORD_BYTES) throw new Error('Analysis record exceeds the supported byte budget.');
  return markdown;
}

export function parseAnalysisRecord(markdown: string): AnalysisRecord {
  if (new TextEncoder().encode(markdown).byteLength > MAX_ANALYSIS_RECORD_BYTES) throw new Error('Analysis record exceeds the supported byte budget.');
  const opening = /^---\r?\n/.exec(markdown);
  if (!opening) throw new Error('Analysis frontmatter is missing.');
  const rest = markdown.slice(opening[0].length);
  const closing = /\r?\n---\r?\n/.exec(rest);
  if (!closing || closing.index > 1_500_000) throw new Error('Analysis frontmatter is incomplete.');
  const headers: Record<string, unknown> = Object.create(null);
  for (const line of rest.slice(0, closing.index).split(/\r?\n/)) {
    const pair = /^([a-zA-Z][a-zA-Z0-9_]*): (.*)$/.exec(line);
    if (!pair) throw new Error('Analysis metadata must use the supported JSON flow values.');
    const key = pair[1] === 'analysis_schema' ? 'schema' : pair[1] === 'record_type' ? 'recordType' : pair[1] === 'created_at' ? 'createdAt' : pair[1];
    if (Object.hasOwn(headers, key)) throw new Error(`Duplicate analysis metadata: ${key}.`);
    headers[key] = JSON.parse(pair[2]);
  }
  const body = rest.slice(closing.index + closing[0].length);
  headers[headers.recordType === 'review' ? 'rationale' : 'answer'] = body;
  return validateAnalysisRecord({ ...headers });
}

export function analysisRecordFileName(record: Pick<AnalysisRecord, 'id' | 'createdAt'>): string {
  uuid(record.id, 'record id');
  timestamp(record.createdAt);
  return `${record.createdAt.replace(/[:.]/g, '-')}-${record.id}.md`;
}

export function isAnalysisRecordFileName(name: string): boolean {
  return FILE_NAME.test(name);
}

/** Hashes are evidence identity, never a percentage of semantic correctness. */
export async function analysisDigest(value: unknown): Promise<string> {
  const stable = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(stable);
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([key, child]) => [key, stable(child)]));
    return item;
  };
  return analysisTextDigest(JSON.stringify(stable(value)));
}

/** Raw Markdown bytes use the same UTF-8 SHA-256 identity as architecture receipts. */
export async function analysisTextDigest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digestBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return `sha256:${Array.from(digestBytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export async function verifyAnalysisEvidence(record: AnalysisRun): Promise<string[]> {
  const problems: string[] = [];
  const basis = new Map(record.basis.documents.map((item) => [item.slug, item.digest]));
  if (record.profileSnapshot && await analysisTextDigest(record.profileSnapshot.markdown) !== record.profileSnapshot.digest) problems.push('profile_snapshot_digest_mismatch');
  for (const evidence of record.evidence) {
    const current = await analysisDigest({ frontmatter: evidence.frontmatter, body: evidence.body });
    if (current !== evidence.digest) problems.push(`evidence_digest_mismatch:${evidence.slug}`);
    if (basis.get(evidence.slug) !== evidence.digest) problems.push(`evidence_basis_mismatch:${evidence.slug}`);
  }
  if (record.qualification.status === 'grounded' && basis.size !== record.evidence.length) problems.push('evidence_basis_incomplete');
  for (const observation of record.observations) {
    if (await analysisDigest(observation.result) !== observation.digest) problems.push(`observation_digest_mismatch:${observation.toolCallId}`);
    if (!record.toolReads.some((read) => read.id === observation.toolCallId && read.name === observation.name && read.status === 'completed')) problems.push(`observation_read_missing:${observation.toolCallId}`);
  }
  return problems;
}

export function compareAnalysisBasis(recorded: AnalysisBasis, current: AnalysisBasis): AnalysisCompatibility {
  const stale: string[] = [];
  const unknown: string[] = [];
  for (const field of ['graphHash', 'sourceFingerprint', 'profileHash'] as const) {
    if (recorded[field] !== null && current[field] !== null && recorded[field] !== current[field]) stale.push(`${field}_changed`);
    else if (recorded[field] !== null && current[field] === null) unknown.push(`${field}_unavailable`);
    else if (recorded[field] === null && current[field] !== null) unknown.push(`${field}_unrecorded`);
    else if (field === 'graphHash' && recorded[field] === null) unknown.push('graphHash_unrecorded');
  }
  const docs = new Map(current.documents.map((doc) => [doc.slug, doc.digest]));
  for (const doc of recorded.documents) {
    const now = docs.get(doc.slug);
    if (!now) unknown.push(`document_unavailable:${doc.slug}`);
    else if (now !== doc.digest) stale.push(`document_changed:${doc.slug}`);
  }
  return stale.length ? { status: 'stale', reasons: [...stale, ...unknown] } : unknown.length ? { status: 'unknown', reasons: unknown } : { status: 'current', reasons: [] };
}

export function analysisScopeKey(mode: AnalysisRun['mode'], scope: AnalysisScope): string {
  return JSON.stringify([mode, scope.projectUid ?? scope.projectSlug, scope.profileSlug, [...scope.targetSlugs].sort()]);
}

export function latestFindingReview(records: readonly AnalysisRecord[], runId: string, findingId: string): AnalysisReview | null {
  return records.filter((row): row is AnalysisReview => row.recordType === 'review' && row.runId === runId && row.findingId === findingId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))[0] ?? null;
}
