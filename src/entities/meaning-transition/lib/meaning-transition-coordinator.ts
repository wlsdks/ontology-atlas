import { previewDocumentPatch } from '@/shared/lib/document-patch.mjs';
import type { AcpWorkReceipt } from '@/shared/lib/acp-work-receipt';
import {
  meaningTransitionV2DecisionArtifact,
  meaningTransitionV2TextDigest,
  prepareMeaningTransitionV2,
  type MeaningTransitionV2,
  type MeaningTransitionV2Input,
} from '@/shared/lib/meaning-transition-v2';

import {
  meaningTransitionArtifactRef,
  type MeaningTransitionArtifactBytes,
} from './meaning-transition-store';

type Sha256 = `sha256:${string}`;
type MeaningAction = 'accept_meaning' | 'reject_meaning' | 'defer_meaning';
type Identity = MeaningTransitionV2['identity'];
type GitObservation = MeaningTransitionV2['git']['source'];

export interface MeaningTransitionDecisionInput {
  identity: Identity;
  sessionId: string;
  task: { label: string; digest: Sha256 };
  proposal: { digest: Sha256; operation: 'patch_concept'; rowId: string; target: string };
  rawBefore: string;
  patch: { frontmatter?: Record<string, unknown>; body?: string };
  action: MeaningAction;
  actionAt?: string;
  rationale: string | null;
  acceptedGaps: string[];
  reviewEvidence: MeaningTransitionV2['reviewEvidence'];
  acpCorrelation:
    | { status: 'observed'; server: string; tool: 'patch_concept' }
    | { status: 'unavailable'; reason: string };
  isCurrent: () => boolean;
}

export interface MeaningTransitionTerminalInput {
  decisionId: string;
  receipt: AcpWorkReceipt;
  isCurrent: () => boolean;
}

export type MeaningTransitionCoordinatorResult =
  | { status: 'not_created'; reason: 'no_semantic_delta' }
  | { status: 'archived'; record: MeaningTransitionV2; artifacts: readonly MeaningTransitionArtifactBytes[] };

export interface MeaningTransitionReadback {
  status: 'available' | 'missing';
  content?: string;
  mtime?: number;
  contextId?: string;
}

export interface MeaningTransitionCoordinatorDependencies {
  archive: (input: {
    record: MeaningTransitionV2;
    artifacts: readonly MeaningTransitionArtifactBytes[];
    isCurrent: () => boolean;
  }) => Promise<void>;
  readback: (input: {
    identity: Identity;
    target: string;
    expectedDigest: Sha256;
    isCurrent: () => boolean;
  }) => Promise<MeaningTransitionReadback>;
  now?: () => string;
  newId?: () => string;
  observeGit?: (input: { identity: Identity; isCurrent: () => boolean }) => Promise<{
    source: GitObservation;
    vault: GitObservation;
  }>;
  remainingSourceQuestions?: (input: {
    identity: Identity;
    isCurrent: () => boolean;
    phase: 'decision' | 'terminal';
  }) => Promise<string[]>;
}

interface SealedDecision {
  input: Omit<MeaningTransitionDecisionInput, 'rawBefore' | 'patch' | 'isCurrent'>;
  recordInput: MeaningTransitionV2Input;
  artifacts: readonly MeaningTransitionArtifactBytes[];
  eventId: string;
  createdAt: string;
  acpServer: string | null;
  record?: MeaningTransitionV2;
}

const unavailableGit = (reason: string): GitObservation => ({ status: 'unavailable', reason });
const assertCurrent = (isCurrent: () => boolean) => {
  if (!isCurrent()) throw new Error('Meaning transition task or context changed.');
};

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right, 'en')).map(([key, child]) => [key, stable(child)]));
  return value;
}

function decisionScopeKey(input: MeaningTransitionDecisionInput): string {
  const id = input.identity;
  return JSON.stringify([
    id.vaultId, id.sessionGeneration, id.userEventId, typeof id.requestId, id.requestId,
    id.toolCallId, input.proposal.digest, input.action,
  ]);
}

function decisionKey(input: MeaningTransitionDecisionInput): string {
  const { isCurrent: _, ...content } = input;
  return JSON.stringify(stable(content));
}

function terminalScopeKey(input: MeaningTransitionTerminalInput): string {
  return JSON.stringify([input.decisionId, input.receipt.id, input.receipt.updatedAt]);
}

function terminalKey(input: MeaningTransitionTerminalInput): string {
  return JSON.stringify(stable({ decisionId: input.decisionId, receipt: input.receipt }));
}

function exactOrigin(receipt: AcpWorkReceipt, sealed: SealedDecision): boolean {
  const origin = receipt.origin;
  const identity = sealed.input.identity;
  return Boolean(origin
    && origin.vaultId === identity.vaultId
    && origin.sessionGeneration === identity.sessionGeneration
    && origin.sessionId === sealed.input.sessionId
    && origin.userEventId === identity.userEventId
    && typeof origin.requestId === typeof identity.requestId
    && origin.requestId === identity.requestId
    && origin.toolCallId === identity.toolCallId);
}

function exactReceipt(receipt: AcpWorkReceipt, sealed: SealedDecision): void {
  if (!exactOrigin(receipt, sealed)) throw new Error('ACP receipt origin does not match the sealed meaning decision.');
  if (receipt.tool !== 'patch_concept' || receipt.items.length !== 1
    || receipt.items[0]?.operation !== 'patch' || receipt.items[0].target !== sealed.input.proposal.target) {
    throw new Error('ACP receipt does not describe the sealed single patch_concept row.');
  }
  if (receipt.result === 'pending') throw new Error('A pending ACP receipt cannot produce a terminal meaning snapshot.');
  if (receipt.decision === 'rejected' && receipt.result !== 'not-run') {
    throw new Error('Rejected ACP permission must retain the not-run writer result.');
  }
}

function writerVerified(receipt: AcpWorkReceipt): boolean {
  const correlation = receipt.writerCorrelation;
  return correlation?.status === 'verified'
    && correlation.tool === 'patch_concept'
    && correlation.toolCall === 'structured-mcp'
    && correlation.approval === 'structured-mcp';
}

function sameReadback(left: MeaningTransitionReadback, right: MeaningTransitionReadback): boolean {
  return left.status === right.status && left.content === right.content && left.mtime === right.mtime
    && left.contextId === right.contextId;
}

export function createMeaningTransitionCoordinator(dependencies: MeaningTransitionCoordinatorDependencies) {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const newId = dependencies.newId ?? (() => crypto.randomUUID());
  const decisionsByKey = new Map<string, SealedDecision>();
  const decisionsById = new Map<string, SealedDecision>();
  const terminalIdentity = new Map<string, { eventId: string; createdAt: string }>();
  const terminalSnapshots = new Map<string, MeaningTransitionV2>();
  const decisionInflight = new Map<string, Promise<MeaningTransitionCoordinatorResult>>();
  const terminalInflight = new Map<string, Promise<MeaningTransitionCoordinatorResult>>();
  const decisionBasis = new Map<string, string>();
  const terminalBasis = new Map<string, string>();

  async function performDecision(input: MeaningTransitionDecisionInput): Promise<MeaningTransitionCoordinatorResult> {
    // Clone all caller-owned values and allocate retry identity before the first await.
    const captured = structuredClone({ ...input, isCurrent: undefined }) as Omit<MeaningTransitionDecisionInput, 'isCurrent'>;
    const isCurrent = input.isCurrent;
    assertCurrent(isCurrent);
    if (!['accept_meaning', 'reject_meaning', 'defer_meaning'].includes(captured.action)) {
      throw new Error('An explicit meaning action is required.');
    }
    const key = decisionKey(input);
    let sealed = decisionsByKey.get(key);
    if (!sealed) {
      const currentCanonical = previewDocumentPatch({ rawBefore: captured.rawBefore });
      const preview = previewDocumentPatch({
        rawBefore: captured.rawBefore,
        frontmatterPatch: captured.patch.frontmatter,
        body: captured.patch.body,
      });
      if (currentCanonical.status !== 'available' || preview.status !== 'available') {
        throw new Error('A settled existing UID is required before a meaning decision can be archived.');
      }
      if (preview.frontmatter.uid !== currentCanonical.frontmatter.uid) {
        throw new Error('The canonical preview changed the existing concept UID.');
      }
      if (preview.markdown === currentCanonical.markdown) return { status: 'not_created', reason: 'no_semantic_delta' };

      const decisionId = newId();
      const eventId = newId();
      const createdAt = now();
      const actionAt = captured.actionAt ?? createdAt;

      const beforeDigest = await meaningTransitionV2TextDigest(captured.rawBefore);
      assertCurrent(isCurrent);
      const previewDigest = await meaningTransitionV2TextDigest(preview.markdown);
      assertCurrent(isCurrent);
      const retainedBefore = { digest: beforeDigest, content: captured.rawBefore };
      const previewArtifact = { digest: previewDigest, content: preview.markdown };
      const artifactRefs = {
        retainedBefore: { ref: meaningTransitionArtifactRef(beforeDigest), contentDigest: beforeDigest },
        preview: { ref: meaningTransitionArtifactRef(previewDigest), contentDigest: previewDigest },
        decision: { ref: '', contentDigest: beforeDigest },
      };
      const sourceQuestions = dependencies.remainingSourceQuestions
        ? await dependencies.remainingSourceQuestions({ identity: captured.identity, isCurrent, phase: 'decision' })
        : [];
      assertCurrent(isCurrent);
      const base: MeaningTransitionV2Input = {
        eventId, createdAt, decisionId, phase: 'decision', previous: null,
        identity: captured.identity,
        task: captured.task,
        proposal: {
          digest: captured.proposal.digest,
          operation: captured.proposal.operation,
          rows: [{ rowId: captured.proposal.rowId, operation: 'patch', target: captured.proposal.target,
            rawGuardDigest: beforeDigest, expectedPersistedDigest: previewDigest }],
          artifacts: artifactRefs,
        },
        meaningDecision: { decisionId, action: captured.action, actionAt, actor: 'user_action', authentication: 'unverified',
          rationale: captured.rationale, acceptedGaps: captured.acceptedGaps },
        reviewEvidence: captured.reviewEvidence,
        acpCorrelation: captured.acpCorrelation.status === 'observed'
          ? { status: 'observed', sessionId: captured.sessionId, requestId: captured.identity.requestId,
            toolCallId: captured.identity.toolCallId, evidence: 'structured_mcp_approval', executionPermission: 'pending' }
          : { status: 'unavailable', reason: captured.acpCorrelation.reason, executionPermission: 'unknown' },
        git: dependencies.observeGit ? await dependencies.observeGit({ identity: captured.identity, isCurrent }) : {
          source: unavailableGit('Implementation source continuity is unknown for this bounded meaning write.'),
          vault: unavailableGit('Vault Git revision was not observed for this bounded meaning write.'),
        },
        rowEvidence: [{ rowId: captured.proposal.rowId, execution: 'not_run', readback: 'unknown', persistedDigest: null, error: null }],
        receipts: { codeChecks: 'unknown', merge: 'unknown', deployment: 'unknown' },
        remainingQuestions: [
          'Implementation source continuity remains unknown.',
          'Next-task currentness and repeated reuse require separate evidence.',
          ...sourceQuestions,
        ],
      };
      const decisionContent = meaningTransitionV2DecisionArtifact(base);
      const decisionDigest = await meaningTransitionV2TextDigest(decisionContent);
      assertCurrent(isCurrent);
      base.proposal.artifacts.decision = { ref: meaningTransitionArtifactRef(decisionDigest), contentDigest: decisionDigest };
      assertCurrent(isCurrent);
      const nextSealed: SealedDecision = { input: captured, recordInput: base,
        artifacts: Object.freeze([retainedBefore, previewArtifact, { digest: decisionDigest, content: decisionContent }]
          .map((artifact) => Object.freeze(artifact))),
        eventId, createdAt, acpServer: captured.acpCorrelation.status === 'observed' ? captured.acpCorrelation.server : null };
      sealed = nextSealed;
      decisionsByKey.set(key, nextSealed);
      decisionsById.set(decisionId, nextSealed);
    }
    const prepared = await prepareMeaningTransitionV2(sealed.recordInput);
    assertCurrent(isCurrent);
    sealed.record = prepared.record;
    await dependencies.archive({ record: structuredClone(prepared.record), artifacts: structuredClone(sealed.artifacts), isCurrent });
    assertCurrent(isCurrent);
    return { status: 'archived', record: prepared.record, artifacts: sealed.artifacts };
  }

  function recordDecision(input: MeaningTransitionDecisionInput): Promise<MeaningTransitionCoordinatorResult> {
    const key = decisionKey(input);
    const scope = decisionScopeKey(input);
    const prior = decisionBasis.get(scope);
    if (prior && prior !== key) return Promise.reject(new Error('Meaning decision retry changed its sealed input.'));
    decisionBasis.set(scope, key);
    const existing = decisionInflight.get(key);
    if (existing) return existing;
    const pending = performDecision(input);
    decisionInflight.set(key, pending);
    const clear = () => { if (decisionInflight.get(key) === pending) decisionInflight.delete(key); };
    void pending.then(clear, clear);
    return pending;
  }

  async function performTerminal(input: MeaningTransitionTerminalInput): Promise<MeaningTransitionCoordinatorResult> {
    const receipt = structuredClone(input.receipt);
    const isCurrent = input.isCurrent;
    const sealed = decisionsById.get(input.decisionId);
    assertCurrent(isCurrent);
    if (!sealed?.record) throw new Error('The archived meaning decision is unavailable in this coordinator context.');
    exactReceipt(receipt, sealed);
    const terminalKey = JSON.stringify([input.decisionId, receipt.id, receipt.updatedAt, receipt.decision, receipt.result]);
    const cached = terminalSnapshots.get(terminalKey);
    if (cached) {
      await dependencies.archive({ record: structuredClone(cached), artifacts: structuredClone(sealed.artifacts), isCurrent });
      assertCurrent(isCurrent);
      return { status: 'archived', record: cached, artifacts: sealed.artifacts };
    }
    let identity = terminalIdentity.get(terminalKey);
    if (!identity) {
      identity = { eventId: newId(), createdAt: now() };
      terminalIdentity.set(terminalKey, identity);
    }
    const row = sealed.record.proposal.rows[0]!;
    let execution: MeaningTransitionV2['rowEvidence'][number]['execution'] = 'unknown';
    let readback: MeaningTransitionV2['rowEvidence'][number]['readback'] = 'unknown';
    let persistedDigest: Sha256 | null = null;
    let error: string | null = null;
    if (receipt.decision === 'rejected') execution = 'not_run';
    else if (receipt.result === 'failed' || receipt.result === 'cancelled') {
      execution = 'failed';
      error = receipt.result === 'cancelled' ? 'Writer was cancelled.' : 'Writer failed.';
    } else if (receipt.result === 'completed') {
      if (!writerVerified(receipt) || receipt.writerCorrelation?.terminal !== 'completed'
        || sealed.acpServer === null || receipt.writerCorrelation.server !== sealed.acpServer) {
        throw new Error('A completed meaning write requires the correlated allowed writer receipt.');
      }
      execution = 'completed';
      let first: MeaningTransitionReadback;
      let second: MeaningTransitionReadback;
      try {
        first = await dependencies.readback({ identity: sealed.input.identity, target: row.target,
          expectedDigest: row.expectedPersistedDigest, isCurrent });
        assertCurrent(isCurrent);
        second = await dependencies.readback({ identity: sealed.input.identity, target: row.target,
          expectedDigest: row.expectedPersistedDigest, isCurrent });
        assertCurrent(isCurrent);
      } catch (_cause) {
        assertCurrent(isCurrent);
        first = second = { status: 'missing' };
        // Keep adapter details out of the persisted record; the UI already labels this as
        // unavailable and diagnostics remain in the local console boundary.
        error = 'Fresh writer readback failed.';
      }
      if (!sameReadback(first, second)) {
        readback = 'mismatched'; error = 'Fresh readback changed between observations.';
      } else if (first.status === 'missing' || first.content === undefined) {
        readback = 'missing'; error ??= 'Fresh writer readback was unavailable.';
      } else {
        persistedDigest = await meaningTransitionV2TextDigest(first.content);
        assertCurrent(isCurrent);
        readback = persistedDigest === row.expectedPersistedDigest ? 'matched' : 'mismatched';
        if (readback === 'mismatched') error = 'Fresh writer readback did not match the sealed preview bytes.';
      }
    } else {
      throw new Error('ACP terminal receipt has no supported terminal result.');
    }
    const correlation: MeaningTransitionV2['acpCorrelation'] = sealed.record.acpCorrelation.status === 'observed'
      ? { ...sealed.record.acpCorrelation, executionPermission: receipt.decision === 'rejected' ? 'rejected' : 'allowed' }
      : sealed.record.acpCorrelation;
    const terminalGit = dependencies.observeGit
      ? await dependencies.observeGit({ identity: sealed.input.identity, isCurrent })
      : {
          source: unavailableGit('Terminal implementation source Git state was not observed.'),
          vault: unavailableGit('Terminal vault Git state was not observed.'),
        };
    assertCurrent(isCurrent);
    const sourceQuestions = dependencies.remainingSourceQuestions
      ? await dependencies.remainingSourceQuestions({ identity: sealed.input.identity, isCurrent, phase: 'terminal' })
      : [];
    assertCurrent(isCurrent);
    const terminalInput: MeaningTransitionV2Input = {
      ...sealed.recordInput,
      eventId: identity.eventId,
      createdAt: identity.createdAt,
      phase: 'terminal',
      previous: { eventId: sealed.record.eventId, createdAt: sealed.record.createdAt, recordDigest: sealed.record.recordDigest },
      acpCorrelation: correlation,
      git: terminalGit,
      remainingQuestions: [...sealed.recordInput.remainingQuestions, ...sourceQuestions],
      rowEvidence: [{ rowId: row.rowId, execution, readback, persistedDigest, error }],
    };
    const prepared = await prepareMeaningTransitionV2(terminalInput);
    assertCurrent(isCurrent);
    terminalSnapshots.set(terminalKey, prepared.record);
    await dependencies.archive({ record: structuredClone(prepared.record), artifacts: structuredClone(sealed.artifacts), isCurrent });
    assertCurrent(isCurrent);
    sealed.record = prepared.record;
    return { status: 'archived', record: prepared.record, artifacts: sealed.artifacts };
  }

  function recordTerminal(input: MeaningTransitionTerminalInput): Promise<MeaningTransitionCoordinatorResult> {
    const key = terminalKey(input);
    const scope = terminalScopeKey(input);
    const prior = terminalBasis.get(scope);
    if (prior && prior !== key) return Promise.reject(new Error('ACP terminal retry changed its immutable receipt.'));
    terminalBasis.set(scope, key);
    const existing = terminalInflight.get(key);
    if (existing) return existing;
    const pending = performTerminal(input);
    terminalInflight.set(key, pending);
    const clear = () => { if (terminalInflight.get(key) === pending) terminalInflight.delete(key); };
    void pending.then(clear, clear);
    return pending;
  }

  return { recordDecision, recordTerminal };
}
