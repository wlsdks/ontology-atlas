import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { createMeaningTransitionCoordinator, appendMeaningTransitionV2 } from '@/entities/meaning-transition';
import type { AcpWorkReceipt } from '@/shared/lib/acp-work-receipt';
import { meaningTransitionV2TextDigest, type MeaningTransitionV2 } from '@/shared/lib/meaning-transition-v2';
import { canArchiveMeaningTransitions } from '@/shared/lib/tauri-meaning-transition-archive';
import { getTauriVaultRootPath, inspectTauriProjectSource, inspectTauriProjectSourceContinuity, type ProjectSourceContinuityInspection } from '@/shared/lib/tauri-vault-fs';

import type { TaskMeaningDecision } from './use-task-meaning-review';

interface CaptureContext {
  handle: FileSystemDirectoryHandle;
  fileHandles: ReadonlyMap<string, FileSystemFileHandle>;
  writable: boolean;
}
type Identity = MeaningTransitionV2['identity'];
const identityKey = (identity: Identity) => JSON.stringify([identity.vaultId, identity.sessionGeneration,
  identity.userEventId, typeof identity.requestId, identity.requestId, identity.toolCallId]);

/** Owns only local decision evidence; ACP execution permission remains in useAcpSession. */
export function useMeaningTransitionCapture(input: {
  context?: CaptureContext;
  vaultRoot: string | null;
  runtimeId: string;
}) {
  const token = useMemo(() => ({ handle: input.context?.handle, vaultRoot: input.vaultRoot, runtimeId: input.runtimeId, writable: input.context?.writable }), [input.context?.handle, input.context?.writable, input.vaultRoot, input.runtimeId]);
  const current = useRef({ input, token });
  useLayoutEffect(() => { current.current = { input, token }; }, [input, token]);
  const [error, setError] = useState<{ token: object; value: boolean } | null>(null);
  const state = useMemo(() => {
    const decisions = new Map<string, string>();
    const targets = new Map<string, { handle: FileSystemFileHandle; sourceRoot: string; slug: string;
      continuity: ProjectSourceContinuityInspection | null }>();
    const isCurrent = () => current.current.token === token;
    // The constructor retains callbacks; it does not invoke them during render.
    // eslint-disable-next-line react-hooks/refs
    const coordinator = createMeaningTransitionCoordinator({
      archive: async ({ record, artifacts, isCurrent: taskCurrent }) => {
        const handle = current.current.input.context?.handle;
        if (!handle || !isCurrent() || !taskCurrent()) throw new Error('Meaning transition context changed.');
        await appendMeaningTransitionV2({ capturedHandle: handle, record, artifacts, writable: current.current.input.context?.writable === true,
          isCurrent: () => isCurrent() && taskCurrent() });
        if (isCurrent()) window.dispatchEvent(new CustomEvent('atlas-meaning-transitions-changed', {
          detail: { vaultRoot: record.identity.vaultId },
        }));
      },
      readback: async ({ identity, target, isCurrent: taskCurrent }) => {
        const captured = targets.get(identityKey(identity));
        if (!captured || !isCurrent() || !taskCurrent()) throw new Error('Meaning readback context changed.');
        try {
          const file = await captured.handle.getFile();
          if (!isCurrent() || !taskCurrent()) throw new Error('Meaning readback context changed.');
          if (file.size > 500_000) return { status: 'missing' };
          const bytes = await file.arrayBuffer();
          if (!isCurrent() || !taskCurrent()) throw new Error('Meaning readback context changed.');
          // Preserve BOM and reject invalid UTF-8 so text hashing cannot silently change the bytes.
          const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
          return { status: 'available', content, mtime: file.lastModified,
            contextId: JSON.stringify([identity.vaultId, target]) };
        } catch {
          if (!isCurrent() || !taskCurrent()) throw new Error('Meaning readback context changed.');
          return { status: 'missing' };
        }
      },
      observeGit: async ({ identity, isCurrent: taskCurrent }) => {
        const sourceRoot = targets.get(identityKey(identity))?.sourceRoot;
        const observe = async (root: string | null | undefined): Promise<MeaningTransitionV2['git']['source']> => {
          if (!root) return { status: 'unavailable', reason: 'No repository root was supplied.' };
          try {
            const observation = await inspectTauriProjectSource(root);
            if (!isCurrent() || !taskCurrent()) throw new Error('Meaning Git context changed.');
            return observation?.kind === 'git' && !observation.truncated && typeof observation.dirty === 'boolean'
              ? { status: 'observed', repositoryId: observation.sourceId, revision: observation.revision, dirty: observation.dirty }
              : { status: 'unavailable', reason: 'A complete Git observation was unavailable.' };
          } catch {
            if (!isCurrent() || !taskCurrent()) throw new Error('Meaning Git context changed.');
            return { status: 'unavailable', reason: 'Git inspection failed.' };
          }
        };
        const [source, vault] = await Promise.all([observe(sourceRoot), observe(identity.vaultId)]);
        return { source, vault };
      },
      remainingSourceQuestions: async ({ identity, isCurrent: taskCurrent, phase }) => {
        const captured = targets.get(identityKey(identity));
        if (!captured?.continuity) return ['Task-owned code changes remain unverified; bounded source continuity was unavailable.'];
        let after: ProjectSourceContinuityInspection | null = null;
        try {
          after = phase === 'decision' ? captured.continuity : await inspectTauriProjectSourceContinuity({
            sourceRoot: captured.sourceRoot, vaultRoot: identity.vaultId, targetSlug: captured.slug,
          });
        } catch { /* Scope errors retain unknown currentness. */ }
        if (!isCurrent() || !taskCurrent()) throw new Error('Meaning source continuity context changed.');
        const before = captured.continuity;
        const matches = after && !after.truncated && after.scope === before.scope
          && after.sourceId === before.sourceId && after.rootPath === before.rootPath
          && after.revision === before.revision && after.fingerprint === before.fingerprint
          && JSON.stringify(after.exclusions) === JSON.stringify(before.exclusions);
        return [`Task-owned code changes remain unverified. Bounded source continuity ${phase === 'decision' ? 'baseline retained' : matches ? 'matched' : after ? 'changed' : 'unavailable'}; scope=${before.scope}; exclusions=${JSON.stringify(before.exclusions)}; before=${before.fingerprint}; after=${after?.fingerprint ?? 'unknown'}.`];
      },
    });
    return { decisions, targets, coordinator, isCurrent };
  }, [token]);
  const enabled = Boolean(input.context && input.vaultRoot && canArchiveMeaningTransitions());
  const saveDecision = useCallback(async (decision: TaskMeaningDecision): Promise<boolean> => {
    const live = current.current.input;
    if (!state.isCurrent() || !live.context || !live.vaultRoot
      || getTauriVaultRootPath(live.context.handle) !== live.vaultRoot) return false;
    const identity = decision.proposal.identity;
    const target = decision.request.rawInput.slug;
    const handle = typeof target === 'string' ? live.context.fileHandles.get(target) : null;
    const source = decision.current.sourceBasis;
    if (!handle || typeof target !== 'string' || identity.vaultId !== live.vaultRoot || !decision.origin.turn || !source) return false;
    const binding = decision.proposal;
    const sha = (value: string | null): value is `sha256:${string}` => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
    if (!binding.sourceRevision || !binding.meaningRevision || !sha(binding.contentDigest) || !sha(binding.digest)
      || !sha(source.sourceId) || !sha(source.fingerprint) || !/^source:sha256:[a-f0-9]{64}$/.test(source.sourceBasisId)) return false;
    const isAcceptedSource = (observation: Awaited<ReturnType<typeof inspectTauriProjectSource>>) => observation
      && !observation.truncated && observation.rootPath === source.rootPath && observation.sourceId === source.sourceId
      && observation.kind === source.kind && observation.revision === source.revision && observation.fingerprint === source.fingerprint;
    const firstSource = await inspectTauriProjectSource(source.rootPath);
    if (!state.isCurrent() || !isAcceptedSource(firstSource)) return false;
    let continuity: ProjectSourceContinuityInspection | null = null;
    try { continuity = await inspectTauriProjectSourceContinuity({ sourceRoot: source.rootPath, vaultRoot: identity.vaultId, targetSlug: target }); }
    catch { /* A folder source can retain meaning evidence without a Git continuity claim. */ }
    const secondSource = await inspectTauriProjectSource(source.rootPath);
    if (!state.isCurrent() || !isAcceptedSource(secondSource)) return false;
    state.targets.set(identityKey(identity), { handle, sourceRoot: source.rootPath, slug: target, continuity });
    const correlation = decision.request.writerCorrelation;
    const result = await state.coordinator.recordDecision({
      identity, sessionId: decision.origin.turn.sessionId,
      task: { label: decision.proposal.request.outcome,
        digest: await meaningTransitionV2TextDigest(JSON.stringify(decision.proposal.request)) },
      proposal: { digest: decision.proposal.digest as `sha256:${string}`, operation: 'patch_concept', rowId: target, target },
      rawBefore: decision.before,
      patch: { frontmatter: decision.request.rawInput.frontmatter as Record<string, unknown> | undefined,
        body: decision.request.rawInput.body as string | undefined },
      action: decision.action, actionAt: decision.actionAt,
      rationale: decision.rationale ?? null, acceptedGaps: [],
      reviewEvidence: { status: 'observed', proposalBinding: { ...binding, sourceRevision: binding.sourceRevision,
        meaningRevision: binding.meaningRevision, contentDigest: binding.contentDigest, digest: binding.digest },
        source: { status: 'observed', rootPath: source.rootPath, sourceId: source.sourceId,
          kind: source.kind, revision: source.revision, fingerprint: source.fingerprint,
          dirty: source.dirty, sourceBasisId: source.sourceBasisId as `source:sha256:${string}` } },
      acpCorrelation: correlation?.status === 'verified' && correlation.tool === 'patch_concept'
        ? { status: 'observed', server: correlation.server, tool: 'patch_concept' }
        : { status: 'unavailable', reason: 'The adapter did not supply a structured MCP approval chain.' },
      isCurrent: state.isCurrent,
    });
    if (!state.isCurrent()) return false;
    if (result.status === 'archived') state.decisions.set(identityKey(identity), result.record.decisionId);
    return result.status === 'archived';
  }, [state]);
  const recordReceipt = useCallback((receipt: AcpWorkReceipt) => {
    if (!receipt.origin || receipt.result === 'pending' || !state.isCurrent()) return;
    const decisionId = state.decisions.get(identityKey(receipt.origin));
    if (!decisionId) return;
    void state.coordinator.recordTerminal({ decisionId, receipt, isCurrent: state.isCurrent })
      .then(() => { if (state.isCurrent()) setError({ token, value: false }); })
      .catch(() => { if (state.isCurrent()) setError({ token, value: true }); });
  }, [state, token]);
  return { saveDecision: enabled ? saveDecision : undefined, recordReceipt,
    terminalSaveFailed: error?.token === token && error.value };
}
