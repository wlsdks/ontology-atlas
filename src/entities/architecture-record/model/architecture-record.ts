const RECORD_CONTRACT = 'architectureRecord:v1' as const;
const BRIEF_CONTRACT = 'architectureBrief:v1' as const;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_PREFIXED = /^sha256:[0-9a-f]+$/;
const STATUSES = ['conforms', 'violated', 'unknown'] as const;

export type ArchitectureRecordStatus = (typeof STATUSES)[number];

/** Git sources carry a short sha and dirty flag; folder sources a `sha256:` fingerprint, never shown as a revision. */
export type ArchitectureRecordSource =
  | { kind: 'git'; revision: string; dirty: boolean }
  | { kind: 'folder'; fingerprint: string };

interface ArchitectureRecordMeasured {
  at: string;
  tool: { name: string; version: string };
  source: ArchitectureRecordSource;
}

/** Imports observed from one role to another; same-role edges are legal and dominate, so rankings exclude them. */
export interface ArchitectureRoleEdge {
  fromRole: string;
  toRole: string;
  count: number;
}

interface ArchitectureRecordConformance {
  status: ArchitectureRecordStatus;
  violationCount: number;
  violations: unknown[];
  /** Optional for older records; rows' undeclared `evidence` passes through unvalidated. */
  observedRoleEdges?: ArchitectureRoleEdge[];
  /** Edges a profile's `dependency_usages` removed from the verdict (formerly `typeOnlyEdgeCount`). */
  excludedByUsage?: number;
  unknown?: {
    coverageIncomplete?: boolean;
    unmappedEdges?: number;
    unruledEdges?: number;
    emptyRoles?: string[];
  };
}

export interface ArchitectureRecord {
  contract: typeof RECORD_CONTRACT;
  /** Identity and hash of the reviewed profile, never its body. */
  profile: { uid: string; slug: string; contentHash: string };
  /** The persisted `architectureBrief:v1`. */
  brief: {
    contract: typeof BRIEF_CONTRACT;
    measured: ArchitectureRecordMeasured;
    conformance: ArchitectureRecordConformance;
  } & Record<string, unknown>;
}

function fail(message: string): never {
  throw new Error(message);
}

function asObject(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${name} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function nonBlank(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${name} must be a non-empty string.`);
  }
  return value as string;
}

function countOf(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    fail(`${name} must be a non-negative integer.`);
  }
  return value as number;
}

/** No absolute machine path may persist in a receipt; a rootPath anywhere makes it invalid. */
function assertNoRootPath(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRootPath(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'rootPath') {
      fail(`rootPath must not appear in an ${RECORD_CONTRACT} record (found at ${path}.${key}).`);
    }
    assertNoRootPath(child, `${path}.${key}`);
  }
}

function parseMeasured(value: unknown): ArchitectureRecordMeasured {
  const measured = asObject(value, 'brief.measured');
  const at = nonBlank(measured.at, 'brief.measured.at');
  if (Number.isNaN(Date.parse(at))) fail('brief.measured.at must be an ISO date-time string.');
  const tool = asObject(measured.tool, 'brief.measured.tool');
  nonBlank(tool.name, 'brief.measured.tool.name');
  nonBlank(tool.version, 'brief.measured.tool.version');
  const source = asObject(measured.source, 'brief.measured.source');
  if (source.kind === 'git') {
    nonBlank(source.revision, 'brief.measured.source.revision');
    if (typeof source.dirty !== 'boolean') fail('brief.measured.source.dirty must be a boolean.');
  } else if (source.kind === 'folder') {
    const fingerprint = nonBlank(source.fingerprint, 'brief.measured.source.fingerprint');
    if (!SHA256_PREFIXED.test(fingerprint)) {
      fail('brief.measured.source.fingerprint must be a sha256:<hex> fingerprint.');
    }
  } else {
    fail('brief.measured.source.kind must be git or folder.');
  }
  return measured as unknown as ArchitectureRecordMeasured;
}

function assertRoleEdges(value: unknown, name: string): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) fail(`${name} must be an array.`);
  value.forEach((row, index) => {
    const edge = asObject(row, `${name}[${index}]`);
    nonBlank(edge.fromRole, `${name}[${index}].fromRole`);
    nonBlank(edge.toRole, `${name}[${index}].toRole`);
    countOf(edge.count, `${name}[${index}].count`);
  });
}

function parseConformance(value: unknown): ArchitectureRecordConformance {
  const conformance = asObject(value, 'brief.conformance');
  if (!STATUSES.includes(conformance.status as ArchitectureRecordStatus)) {
    fail('brief.conformance.status must be conforms, violated, or unknown.');
  }
  countOf(conformance.violationCount, 'brief.conformance.violationCount');
  if (!Array.isArray(conformance.violations)) fail('brief.conformance.violations must be an array.');
  assertRoleEdges(conformance.observedRoleEdges, 'brief.conformance.observedRoleEdges');
  if (conformance.excludedByUsage !== undefined) {
    countOf(conformance.excludedByUsage, 'brief.conformance.excludedByUsage');
  }
  if (conformance.unknown !== undefined) {
    const unknown = asObject(conformance.unknown, 'brief.conformance.unknown');
    if (unknown.unmappedEdges !== undefined) countOf(unknown.unmappedEdges, 'brief.conformance.unknown.unmappedEdges');
    if (unknown.unruledEdges !== undefined) countOf(unknown.unruledEdges, 'brief.conformance.unknown.unruledEdges');
  }
  return conformance as unknown as ArchitectureRecordConformance;
}

/** Parses an `architectureRecord:v1` receipt; a profile-shaped document is rejected, as the profile parser rejects receipts. */
export function parseArchitectureRecord(value: unknown): ArchitectureRecord {
  const record = asObject(value, 'architecture record');
  if (
    'architecture_schema' in record ||
    'profile_uid' in record ||
    Object.keys(record).some((key) => key.startsWith('role_'))
  ) {
    fail(
      `This document is architecture-profile shaped, not an ${RECORD_CONTRACT} record. ` +
        'A reviewed profile is never a measurement receipt.',
    );
  }
  if (record.contract !== RECORD_CONTRACT) {
    fail(`contract must be ${RECORD_CONTRACT}.`);
  }
  const profile = asObject(record.profile, 'profile');
  const uid = nonBlank(profile.uid, 'profile.uid');
  if (!UUID_V4.test(uid)) fail('profile.uid must be a lowercase UUIDv4.');
  nonBlank(profile.slug, 'profile.slug');
  const contentHash = nonBlank(profile.contentHash, 'profile.contentHash');
  if (!SHA256_PREFIXED.test(contentHash)) fail('profile.contentHash must be a sha256:<hex> hash.');

  const brief = asObject(record.brief, 'brief');
  if (brief.contract !== BRIEF_CONTRACT) fail(`brief.contract must be ${BRIEF_CONTRACT}.`);
  parseMeasured(brief.measured);
  parseConformance(brief.conformance);
  assertNoRootPath(record, 'record');

  // Validated structurally and returned as persisted.
  return record as unknown as ArchitectureRecord;
}
