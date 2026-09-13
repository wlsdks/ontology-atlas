import { describe, expect, it } from 'vitest';
import { buildMeaningDiff, buildProposalBinding, canReuseMeaningDecision, createUnknownAuthority, resolveTrustedBeforeSnapshot, type MeaningClaimInput, type TaskReviewIdentity, type TaskReviewRequest, type TrustedBeforeSnapshot } from './task-meaning-review';

const identity: TaskReviewIdentity = { vaultId: 'vault:a', sessionGeneration: 3, userEventId: 'event:7', requestId: 'request:9', toolCallId: 'tool:11' };
const request: TaskReviewRequest = { outcome: 'Change refund eligibility.', nonGoals: ['Do not change capture.'] };
const contentDigest = `sha256:${'a'.repeat(64)}`;
const expectedBefore = { mtime: 100, contentDigest, sourceRevision: 'source:before', meaningRevision: 'meaning:before' };
const snapshot = (overrides: Partial<TrustedBeforeSnapshot> = {}): TrustedBeforeSnapshot => ({
  trust: 'vault_read', vaultId: identity.vaultId, target: 'capabilities/refund', mtime: 100,
  contentDigest, sourceRevision: 'source:before', meaningRevision: 'meaning:before', completeRead: true,
  fields: {
    condition: { present: true, value: 'Refund only after settlement.' },
    exception: { present: true, value: '' },
    relation_notes: { present: true, value: { 'capabilities/ledger': 'Refund writes a compensating ledger entry.', 'capabilities/legacy': 'Legacy reconciliation owns retries.' } },
  }, ...overrides,
});

describe('task meaning review model', () => {
  it('distinguishes known empty, absent, removed-only, changed, and unchanged values', () => {
    const claims: MeaningClaimInput[] = [
      { claimId: 'condition', facet: 'condition', field: 'condition', after: { present: true, value: 'Refund only after capture.' } },
      { claimId: 'exception', facet: 'exception', field: 'exception', after: { present: true, value: '' } },
      { claimId: 'unit', facet: 'unit', field: 'currency', after: { present: true, value: 'USD' } },
      { claimId: 'relations', facet: 'relation', field: 'relation_notes', after: { present: true, value: { 'capabilities/ledger': 'Refund writes a compensating ledger entry.' } } },
    ];
    const result = buildMeaningDiff({ identity, target: 'capabilities/refund', expectedBefore, snapshot: snapshot(), claims });
    expect(result.availability).toBe('comparable');
    expect(result.coverage).toEqual({ total: 5, inspected: 5, omitted: 0, complete: true });
    expect(result.items.map((row) => [row.id, row.kind, row.before.present, row.after.present])).toEqual([
      ['event:7:request:9:condition', 'changed', true, true],
      ['event:7:request:9:exception', 'unchanged', true, true],
      ['event:7:request:9:unit', 'added', false, true],
      ['event:7:request:9:relations:capabilities/ledger', 'unchanged', true, true],
      ['event:7:request:9:relations:capabilities/legacy', 'removed', true, false],
    ]);
  });

  it('keeps conditions, negation, rationales, evidence, and unknowns literal', () => {
    const claims: MeaningClaimInput[] = [{
      claimId: 'policy', facet: 'condition', field: 'condition', after: { present: true, value: 'Do not notify private followers unless public is true.' },
      sourceRefs: ['source:policy.ts#L10-L20'], counterevidence: ['Retry behavior was not inspected.'], unknowns: ['Transport delivery is unknown.'],
    }];
    const [item] = buildMeaningDiff({ identity, target: 'capabilities/refund', expectedBefore, snapshot: snapshot(), claims }).items;
    expect(item.after.value).toBe('Do not notify private followers unless public is true.');
    expect(item.sourceRefs).toEqual(['source:policy.ts#L10-L20']);
    expect(item.counterevidence).toEqual(['Retry behavior was not inspected.']);
    expect(item.unknowns).toEqual(['Transport delivery is unknown.']);
  });

  it('fails closed for missing, forged, mismatched, and stale before snapshots', () => {
    const claims: MeaningClaimInput[] = [{ claimId: 'condition', facet: 'condition', field: 'condition', after: { present: true, value: 'new' } }];
    const cases = [
      [null, expectedBefore, 'missing-before'],
      [snapshot({ trust: 'model_claim' }), expectedBefore, 'unknown'],
      [snapshot({ vaultId: 'vault:b' }), expectedBefore, 'unknown'],
      [snapshot(), { ...expectedBefore, mtime: 99 }, 'stale-before'],
    ] as const;
    for (const [before, basis, availability] of cases) {
      const result = buildMeaningDiff({ identity, target: 'capabilities/refund', expectedBefore: basis, snapshot: before, claims });
      expect(result.availability).toBe(availability);
      expect(result.items[0].kind).toBe('uncomparable');
      expect(result.coverage).toEqual({ total: 1, inspected: 0, omitted: 1, complete: false });
    }
  });

  it('requires a known complete content-bound before basis without confusing expected source change', () => {
    const claims: MeaningClaimInput[] = [{ claimId: 'condition', facet: 'condition', field: 'condition', after: { present: true, value: 'Refund after capture.' } }];
    const unknown = buildMeaningDiff({
      identity,
      target: 'capabilities/refund',
      expectedBefore: { ...expectedBefore, contentDigest: '', sourceRevision: '', meaningRevision: '' },
      snapshot: snapshot({ contentDigest: '', sourceRevision: null, meaningRevision: null }),
      claims,
    });
    expect(unknown.availability).toBe('unknown');
    expect(unknown.coverage.complete).toBe(false);

    const partial = buildMeaningDiff({ identity, target: 'capabilities/refund', expectedBefore, snapshot: snapshot({ completeRead: false }), claims });
    expect(partial.availability).toBe('unknown');

    const expectedTaskChange = buildMeaningDiff({
      identity,
      target: 'capabilities/refund',
      expectedBefore,
      snapshot: snapshot(),
      claims,
    });
    expect(expectedTaskChange.availability).toBe('comparable');
    expect(expectedTaskChange.items[0].before.value).toBe('Refund only after settlement.');
  });

  it('keeps omitted fields unavailable unless a complete read proves absence', () => {
    const claims: MeaningClaimInput[] = [{ claimId: 'condition', facet: 'condition', field: 'condition', after: { present: true, value: 'new' } }];
    const incomplete = buildMeaningDiff({ identity, target: 'capabilities/refund', expectedBefore, snapshot: snapshot({ completeRead: false, fields: {} }), claims });
    expect(incomplete.items[0].kind).toBe('uncomparable');
    expect(incomplete.coverage.complete).toBe(false);
    const complete = buildMeaningDiff({ identity, target: 'capabilities/refund', expectedBefore, snapshot: snapshot({ fields: {} }), claims });
    expect(complete.items[0]).toMatchObject({ kind: 'added', before: { present: false }, after: { present: true, value: 'new' } });
  });

  it('preserves parent values for map shape changes and empty uncomparable claims', () => {
    const scalar = buildMeaningDiff({
      identity,
      target: 'capabilities/refund',
      expectedBefore,
      snapshot: snapshot(),
      claims: [{ claimId: 'relations', facet: 'relation', field: 'relation_notes', after: { present: true, value: 'Ledger rationale moved to prose.' } }],
    });
    expect(scalar.items).toEqual([expect.objectContaining({
      id: 'event:7:request:9:relations', kind: 'changed',
      before: { present: true, value: { 'capabilities/ledger': 'Refund writes a compensating ledger entry.', 'capabilities/legacy': 'Legacy reconciliation owns retries.' } },
      after: { present: true, value: 'Ledger rationale moved to prose.' },
    })]);
    const emptyUnknown = buildMeaningDiff({
      identity,
      target: 'capabilities/refund',
      expectedBefore,
      snapshot: null,
      claims: [{ claimId: 'relations', facet: 'relation', field: 'relation_notes', after: { present: true, value: {} } }],
    });
    expect(emptyUnknown.items).toEqual([expect.objectContaining({ id: 'event:7:request:9:relations', kind: 'uncomparable', after: { present: true, value: {} } })]);
    expect(emptyUnknown.coverage).toEqual({ total: 1, inspected: 0, omitted: 1, complete: false });
  });

  it('binds full raw guards and originating task identity', async () => {
    const rawInput = { slug: 'capabilities/refund', frontmatter: { title: 'Refund' }, confirm: true, expected_mtime: 100 };
    const basis = { sourceRevision: 'source:a', meaningRevision: 'meaning:a', contentDigest };
    const base = await buildProposalBinding({ identity, request, ...basis, rawInput });
    const guardChanged = await buildProposalBinding({ identity, request, ...basis, rawInput: { ...rawInput, confirm: false } });
    const taskChanged = await buildProposalBinding({ identity: { ...identity, requestId: 'request:10' }, request, ...basis, rawInput });
    const requestChanged = await buildProposalBinding({ identity, request: { ...request, nonGoals: ['Do not change settlement.'] }, ...basis, rawInput });
    expect(guardChanged.digest).not.toBe(base.digest);
    expect(taskChanged.digest).not.toBe(base.digest);
    expect(requestChanged.digest).not.toBe(base.digest);
    expect(base.rawInput).toEqual(rawInput);
    expect(Object.isFrozen(base)).toBe(true);
    expect(Object.isFrozen(base.rawInput)).toBe(true);
  });

  it('keeps numeric, string, and empty-string JSON-RPC ids distinct in the binding', async () => {
    const make = (requestId: string | number) => buildProposalBinding({
      identity: { ...identity, requestId }, request,
      sourceRevision: 'source:a', meaningRevision: 'meaning:a', contentDigest,
      rawInput: { slug: 'capabilities/refund' },
    });
    const [numericZero, stringZero, emptyString] = await Promise.all([make(0), make('0'), make('')]);
    expect(numericZero.identity.requestId).toBe(0);
    expect(stringZero.identity.requestId).toBe('0');
    expect(emptyString.identity.requestId).toBe('');
    expect(new Set([numericZero.digest, stringZero.digest, emptyString.digest]).size).toBe(3);
  });

  it('discards a late trusted read after the originating identity changes', async () => {
    let current: TaskReviewIdentity | null = identity;
    let release!: (value: TrustedBeforeSnapshot) => void;
    const pending = resolveTrustedBeforeSnapshot({
      identity,
      target: 'capabilities/refund',
      expectedBefore,
      read: () => new Promise((resolve) => { release = resolve; }),
      currentIdentity: () => current,
    });
    current = { ...identity, requestId: 'request:later' };
    release(snapshot());
    await expect(pending).resolves.toEqual({ status: 'identity-changed', snapshot: null });
  });

  it('does not call an incomplete or digest-mismatched vault read available', async () => {
    await expect(resolveTrustedBeforeSnapshot({
      identity, target: 'capabilities/refund', expectedBefore,
      read: async () => snapshot({ completeRead: false }), currentIdentity: () => identity,
    })).resolves.toEqual({ status: 'untrusted', snapshot: null });
    await expect(resolveTrustedBeforeSnapshot({
      identity, target: 'capabilities/refund', expectedBefore,
      read: async () => snapshot({ contentDigest: `sha256:${'b'.repeat(64)}` }), currentIdentity: () => identity,
    })).resolves.toEqual({ status: 'stale', snapshot: null });
  });

  it('snapshots identity and expected basis before an asynchronous vault read', async () => {
    for (const mutate of [
      (value: TaskReviewIdentity) => { value.requestId = 'request:mutated'; },
      (value: TaskReviewIdentity) => { value.sessionGeneration += 1; },
      (value: TaskReviewIdentity) => { value.vaultId = 'vault:mutated'; },
    ]) {
      const mutableIdentity = { ...identity };
      let release!: (value: TrustedBeforeSnapshot) => void;
      const pending = resolveTrustedBeforeSnapshot({
        identity: mutableIdentity, target: 'capabilities/refund', expectedBefore,
        read: () => new Promise((resolve) => { release = resolve; }), currentIdentity: () => mutableIdentity,
      });
      mutate(mutableIdentity);
      release(snapshot());
      await expect(pending).resolves.toEqual({ status: 'identity-changed', snapshot: null });
    }

    const mutableBasis = { ...expectedBefore };
    let releaseBasis!: (value: TrustedBeforeSnapshot) => void;
    const pendingBasis = resolveTrustedBeforeSnapshot({
      identity, target: 'capabilities/refund', expectedBefore: mutableBasis,
      read: () => new Promise((resolve) => { releaseBasis = resolve; }), currentIdentity: () => identity,
    });
    mutableBasis.contentDigest = `sha256:${'b'.repeat(64)}`;
    releaseBasis(snapshot({ contentDigest: mutableBasis.contentDigest }));
    await expect(pendingBasis).resolves.toEqual({ status: 'stale', snapshot: null });
  });

  it('rejects meaning-decision reuse across task, proposal, source, or meaning changes', async () => {
    const basis = { sourceRevision: 'source:a', meaningRevision: 'meaning:a', contentDigest };
    const binding = await buildProposalBinding({ identity, request, ...basis, rawInput: { slug: 'capabilities/refund', expected_mtime: 100 } });
    const decision = { proposalDigest: binding.digest, identity, ...basis };
    expect(canReuseMeaningDecision({ decision, proposalDigest: binding.digest, identity, ...basis })).toBe(true);
    expect(canReuseMeaningDecision({ decision, proposalDigest: `${binding.digest}:changed`, identity, ...basis })).toBe(false);
    expect(canReuseMeaningDecision({ decision, proposalDigest: binding.digest, identity: { ...identity, toolCallId: 'tool:other' }, ...basis })).toBe(false);
    expect(canReuseMeaningDecision({ decision, proposalDigest: binding.digest, identity, ...basis, sourceRevision: 'source:b' })).toBe(false);
    expect(canReuseMeaningDecision({ decision, proposalDigest: binding.digest, identity, ...basis, meaningRevision: 'meaning:b' })).toBe(false);
    expect(canReuseMeaningDecision({ decision: { ...decision, sourceRevision: null }, proposalDigest: binding.digest, identity, sourceRevision: null, meaningRevision: null, contentDigest: null })).toBe(false);
    expect(canReuseMeaningDecision({ decision: { ...decision, contentDigest: 'not-a-digest' }, proposalDigest: binding.digest, identity, sourceRevision: 'source:a', meaningRevision: 'meaning:a', contentDigest: 'not-a-digest' })).toBe(false);
    expect(canReuseMeaningDecision({ decision: { ...decision, proposalDigest: 'same-invalid' }, proposalDigest: 'same-invalid', identity, ...basis })).toBe(false);
  });

  it('starts four independent authority rows without inferred receipts', () => {
    expect(createUnknownAuthority()).toEqual({
      meaning: { state: 'unknown', basisIds: [], scope: 'exact proposal meaning not assessed' },
      codeVerification: { state: 'unknown', basisIds: [], scope: 'no code-check receipt supplied' },
      merge: { state: 'unknown', basisIds: [], scope: 'no merge receipt supplied' },
      deployment: { state: 'unknown', basisIds: [], scope: 'no deployment receipt supplied' },
    });
  });
});
