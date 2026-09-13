export type ComparisonAvailability = 'comparable' | 'missing-before' | 'stale-before' | 'unknown';
type MeaningDeltaKind = 'added' | 'removed' | 'changed' | 'unchanged' | 'uncomparable';
type MeaningFacet = 'definition' | 'condition' | 'exception' | 'unit' | 'actor' | 'scope' | 'relation' | 'evidence' | 'unknown' | 'path' | 'cosmetic';

interface MeaningValuePresence {
  present: boolean;
  value?: unknown;
}

export interface TaskReviewIdentity {
  vaultId: string;
  sessionGeneration: number;
  userEventId: string;
  requestId: string | number;
  toolCallId: string;
}

export interface TaskReviewRequest {
  outcome: string;
  nonGoals: string[] | null;
}

export interface TrustedBeforeSnapshot {
  trust: 'vault_read' | 'model_claim';
  vaultId: string;
  target: string;
  mtime: number;
  contentDigest: string;
  sourceRevision: string | null;
  meaningRevision: string | null;
  completeRead: boolean;
  fields: Record<string, MeaningValuePresence>;
}

export interface MeaningClaimInput {
  claimId: string;
  facet: MeaningFacet;
  field: string;
  after: MeaningValuePresence;
  sourceRefs?: string[];
  counterevidence?: string[];
  unknowns?: string[];
}

export interface MeaningDiffItem {
  id: string;
  claimId: string;
  facet: MeaningFacet;
  kind: MeaningDeltaKind;
  before: MeaningValuePresence;
  after: MeaningValuePresence;
  sourceRefs: string[];
  counterevidence: string[];
  unknowns: string[];
  meaningImpact: 'review-required' | 'not-assessed';
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function delta(before: MeaningValuePresence, after: MeaningValuePresence): MeaningDeltaKind {
  if (!before.present && after.present) return 'added';
  if (before.present && !after.present) return 'removed';
  if (!before.present && !after.present) return 'unchanged';
  return equal(before.value, after.value) ? 'unchanged' : 'changed';
}

function stringMap(value: MeaningValuePresence): Map<string, string> | null {
  if (!value.present || !value.value || typeof value.value !== 'object' || Array.isArray(value.value)) return null;
  const entries = Object.entries(value.value as Record<string, unknown>);
  if (!entries.every(([, item]) => typeof item === 'string')) return null;
  return new Map(entries as Array<[string, string]>);
}

export interface ComparisonBasis {
  mtime: number;
  contentDigest: string;
  sourceRevision: string;
  meaningRevision: string;
}

function knownBasis(basis: ComparisonBasis): boolean {
  return Number.isFinite(basis.mtime)
    && /^sha256:[a-f0-9]{64}$/.test(basis.contentDigest)
    && basis.sourceRevision.trim().length > 0
    && basis.meaningRevision.trim().length > 0;
}

function availabilityFor(input: {
  identity: TaskReviewIdentity;
  target: string;
  expectedBefore: ComparisonBasis;
  snapshot: TrustedBeforeSnapshot | null;
}): ComparisonAvailability {
  const before = input.snapshot;
  if (!before) return 'missing-before';
  if (before.trust !== 'vault_read' || before.vaultId !== input.identity.vaultId || before.target !== input.target) return 'unknown';
  if (!before.completeRead || !knownBasis(input.expectedBefore)) return 'unknown';
  if (!Number.isFinite(before.mtime)
    || !/^sha256:[a-f0-9]{64}$/.test(before.contentDigest)
    || typeof before.sourceRevision !== 'string' || !before.sourceRevision.trim()
    || typeof before.meaningRevision !== 'string' || !before.meaningRevision.trim()) return 'unknown';
  if (before.mtime !== input.expectedBefore.mtime
    || before.contentDigest !== input.expectedBefore.contentDigest
    || before.sourceRevision !== input.expectedBefore.sourceRevision
    || before.meaningRevision !== input.expectedBefore.meaningRevision) return 'stale-before';
  return 'comparable';
}

export function buildMeaningDiff(input: {
  identity: TaskReviewIdentity;
  target: string;
  expectedBefore: ComparisonBasis;
  snapshot: TrustedBeforeSnapshot | null;
  claims: MeaningClaimInput[];
}): { availability: ComparisonAvailability; items: MeaningDiffItem[]; coverage: { total: number; inspected: number; omitted: number; complete: boolean } } {
  const availability = availabilityFor(input);
  const comparable = availability === 'comparable';
  const items: MeaningDiffItem[] = [];
  for (const claim of input.claims) {
    const before = comparable
      ? input.snapshot!.fields[claim.field] ?? { present: false }
      : { present: false };
    const previousMap = stringMap(before);
    const nextMap = stringMap(claim.after);
    const targets: Array<string | null> = previousMap !== null && nextMap !== null
      ? [...new Set([...(previousMap?.keys() ?? []), ...(nextMap?.keys() ?? [])])].sort()
      : [null];
    if (targets.length === 0) targets.push(null);
    for (const target of targets) {
      const previous = target === null ? before : previousMap?.has(target)
        ? { present: true, value: previousMap.get(target) }
        : { present: false };
      const next = target === null ? claim.after : nextMap?.has(target)
        ? { present: true, value: nextMap.get(target) }
        : { present: false };
      items.push({
        id: `${input.identity.userEventId}:${input.identity.requestId}:${claim.claimId}${target === null ? '' : `:${target}`}`,
        claimId: claim.claimId,
        facet: claim.facet,
        kind: comparable ? delta(previous, next) : 'uncomparable',
        before: previous,
        after: next,
        sourceRefs: [...(claim.sourceRefs ?? [])],
        counterevidence: [...(claim.counterevidence ?? [])],
        unknowns: [...(claim.unknowns ?? [])],
        meaningImpact: claim.facet === 'path' || claim.facet === 'cosmetic' ? 'not-assessed' : 'review-required',
      });
    }
  }
  const inspected = comparable ? items.length : 0;
  return {
    availability,
    items,
    coverage: { total: items.length, inspected, omitted: items.length - inspected, complete: inspected === items.length },
  };
}

function sameIdentity(left: TaskReviewIdentity, right: TaskReviewIdentity): boolean {
  return left.vaultId === right.vaultId
    && left.sessionGeneration === right.sessionGeneration
    && left.userEventId === right.userEventId
    && left.requestId === right.requestId
    && left.toolCallId === right.toolCallId;
}

export async function resolveTrustedBeforeSnapshot(input: {
  identity: TaskReviewIdentity;
  target: string;
  expectedBefore: ComparisonBasis;
  read: () => Promise<TrustedBeforeSnapshot | null>;
  currentIdentity: () => TaskReviewIdentity | null;
}): Promise<{ status: 'available' | 'missing' | 'untrusted' | 'stale' | 'identity-changed'; snapshot: TrustedBeforeSnapshot | null }> {
  const expectedIdentity = structuredClone(input.identity);
  const expectedBefore = structuredClone(input.expectedBefore);
  const expectedTarget = input.target;
  const snapshot = await input.read();
  const current = input.currentIdentity();
  if (!current || !sameIdentity(expectedIdentity, current)) return { status: 'identity-changed', snapshot: null };
  if (!snapshot) return { status: 'missing', snapshot: null };
  if (snapshot.trust !== 'vault_read' || snapshot.vaultId !== expectedIdentity.vaultId || snapshot.target !== expectedTarget) {
    return { status: 'untrusted', snapshot: null };
  }
  const availability = availabilityFor({
    identity: expectedIdentity,
    target: expectedTarget,
    expectedBefore,
    snapshot,
  });
  if (availability === 'stale-before') return { status: 'stale', snapshot: null };
  if (availability !== 'comparable') return { status: 'untrusted', snapshot: null };
  return { status: 'available', snapshot };
}

export async function buildProposalBinding(input: {
  identity: TaskReviewIdentity;
  request: TaskReviewRequest;
  sourceRevision: string | null;
  meaningRevision: string | null;
  contentDigest: string | null;
  rawInput: Record<string, unknown>;
}): Promise<typeof input & { digest: string }> {
  const frozen = structuredClone(input);
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(frozen)));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const deepFreeze = <Value>(value: Value): Value => {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
      Object.freeze(value);
    }
    return value;
  };
  return deepFreeze({ ...frozen, digest: `sha256:${hex}` });
}

interface AuthorityState<State extends string> { state: State; basisIds: string[]; scope: string; observedAt?: string }
export interface TaskReviewAuthority {
  meaning: AuthorityState<'unknown' | 'pending' | 'accepted' | 'rejected'>;
  codeVerification: AuthorityState<'unknown' | 'not-run' | 'passed' | 'failed'>;
  merge: AuthorityState<'unknown' | 'not-applicable' | 'pending' | 'merged'>;
  deployment: AuthorityState<'unknown' | 'not-applicable' | 'pending' | 'deployed' | 'failed'>;
}

export function canReuseMeaningDecision(input: {
  decision: { proposalDigest: string; identity: TaskReviewIdentity; sourceRevision: string | null; meaningRevision: string | null; contentDigest: string | null };
  proposalDigest: string;
  identity: TaskReviewIdentity;
  sourceRevision: string | null;
  meaningRevision: string | null;
  contentDigest: string | null;
}): boolean {
  const known = (value: string | null): value is string => typeof value === 'string' && value.trim().length > 0;
  const knownDigest = (value: string | null): value is string => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
  return knownDigest(input.decision.proposalDigest) && knownDigest(input.proposalDigest)
    && input.decision.proposalDigest === input.proposalDigest
    && sameIdentity(input.decision.identity, input.identity)
    && known(input.decision.sourceRevision) && known(input.sourceRevision)
    && known(input.decision.meaningRevision) && known(input.meaningRevision)
    && knownDigest(input.decision.contentDigest) && knownDigest(input.contentDigest)
    && input.decision.sourceRevision === input.sourceRevision
    && input.decision.meaningRevision === input.meaningRevision
    && input.decision.contentDigest === input.contentDigest;
}

export function createUnknownAuthority(): TaskReviewAuthority {
  return {
    meaning: { state: 'unknown', basisIds: [], scope: 'exact proposal meaning not assessed' },
    codeVerification: { state: 'unknown', basisIds: [], scope: 'no code-check receipt supplied' },
    merge: { state: 'unknown', basisIds: [], scope: 'no merge receipt supplied' },
    deployment: { state: 'unknown', basisIds: [], scope: 'no deployment receipt supplied' },
  };
}
