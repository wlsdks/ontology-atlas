'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { VaultManifest } from '@/entities/docs-vault';
import type { KnowledgeProjectInsight } from '@/entities/knowledge-graph';
import { useLocalVault } from '@/entities/vault-session';
import {
  AGENT_TOOLS,
  CONSTRUCTION_TOOLS,
  CONSTRUCTION_SYSTEM,
  constructionAdapter,
  createConstructionExecutor,
  buildSystemPrompt,
  createToolExecutor,
  resolveProviderAdapter,
  runTurn,
  startTurn,
  type AgentProposal,
  type AgentTurn,
  type ScreenContextSnapshot,
  type VaultReadDoc,
  type VaultReadPort,
  applyProposal,
  proposalToClipboardPacket,
  buildProposal,
} from '@/features/vault-agent';
import { previewConstructionSource, readConstructionSource, type ConstructionSourcePreview, type ConstructionSourceRange } from '@/shared/lib/tauri-local-construction';
import { llmChat, llmChatErrorMessage } from '@/shared/lib/tauri-llm';
import type { ConnectionProvider } from '@/shared/lib/tauri-secrets';

/**
 * The panel's state — the turn list, the in-flight request, and one pending
 * proposal.
 *
 * **There is always at most one live proposal.** Sending a new turn automatically
 * marks the previous pending proposal `cancelled` (a pile of cards neither applied
 * nor cancelled blurs 「what actually landed」). No inbox or queue is built for
 * unapplied proposals — that would be a second source of truth outside the vault.
 */

/**
 * **This conversation's progress**, seated in the header's subtitle slot. The two
 * numbers are always stated together so position and size never change — only the
 * digits are substituted, so the layout does not jump.
 */
export interface AgentSessionSummary {
  /** Concepts created or edited. */
  concepts: number;
  /** Connections made. */
  relations: number;
}

interface VaultAgentNotices {
  roundCap: string;
  /** A turn that stopped without calling a tool once — the line symmetric with hitting the cap. */
  noToolCall: (args: { round: number; cap: number }) => string;
  aborted: string;
  networkFailed: string;
  timedOut: string;
  rateLimited: string;
  rejected: string;
  auditBlocked: string;
  providerRefused: string;
  failed: string;
}

export interface ConstructionTrace {
  preview: ConstructionSourcePreview;
  reads: ConstructionSourceRange[];
  sourceBytes: number;
  issues: { code: string; target: string }[];
  status: 'running' | 'draft' | 'incomplete' | 'failed' | 'sourceChanged' | 'stopped';
}
interface ConstructionProof {
  proposalId: string;
  resourceKey: string;
  generation: number;
  preview: ConstructionSourcePreview;
  reads: ConstructionSourceRange[];
}

export interface UseVaultAgentArgs {
  provider: ConnectionProvider | null;
  /**
   * Only set on the "Connect by address" (connect by address) path — the runner address the
   * user typed and the model chosen from the list. Both are null for a named vendor,
   * and the model is then the adapter's default.
   */
  localEndpoint: { baseUrl: string; model: string } | null;
  vaultPath: string | null;
  insight: KnowledgeProjectInsight | null;
  manifest: VaultManifest | null;
  screenContext: ScreenContextSnapshot;
  locale: string;
  vaultIsGit: boolean;
  projectInstructions: string | null;
  notices: VaultAgentNotices;
  proposalLabels: {
    createFile: (path: string) => string;
    modifyFile: (path: string) => string;
    addRelation: (args: { from: string; to: string; type: string }) => string;
  };
  snapshotLabel: string;
  constructionNotices?: { incomplete: string };
}

export function isLocalConstructionEndpoint(baseUrl: string): boolean {
  try {
    const address = new URL(baseUrl);
    return ['http:', 'https:'].includes(address.protocol) && !address.username && !address.password && !address.search && !address.hash &&
      (address.hostname.toLowerCase() === 'localhost' || /^127\.\d+\.\d+\.\d+$/.test(address.hostname) || address.hostname === '[::1]');
  } catch { return false; }
}

export function useVaultAgent(args: UseVaultAgentArgs) {
  const vault = useLocalVault();
  const [turns, setTurns] = useState<AgentTurn[]>([]);
  const [proposal, setProposal] = useState<AgentProposal | null>(null);
  const [running, setRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(null);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const applyLockRef = useRef(false);
  const sourceProofRef = useRef<ConstructionProof | null>(null);
  const [construction, setConstruction] = useState<ConstructionTrace | null>(null);
  const resourceKey = JSON.stringify([args.vaultPath, args.provider, args.localEndpoint?.model, args.localEndpoint?.baseUrl]);
  const resourceRef = useRef(resourceKey);
  useLayoutEffect(() => { resourceRef.current = resourceKey; }, [resourceKey]);
  /** The session's first apply defaults to an expanded diff — it prevents rubber-stamping. */
  const [hasAppliedOnce, setHasAppliedOnce] = useState(false);
  /**
   * What this conversation actually landed — **a local count**. Only successful
   * applies are counted (cancels and conflicts changed no file at all, so they are
   * not progress). Even if the conversation disappears, the fact this number points
   * at survives in frontmatter and git.
   */
  const [sessionSummary, setSessionSummary] = useState<AgentSessionSummary>({
    concepts: 0,
    relations: 0,
  });

  const systemPrompt = useMemo(
    () => buildSystemPrompt(args.projectInstructions),
    [args.projectInstructions],
  );

  const docs: VaultReadDoc[] = useMemo(() => {
    const rows = args.manifest?.docs ?? [];
    return rows
      .filter((doc) => typeof doc.frontmatter?.kind === 'string')
      .map((doc) => ({
        slug: doc.slug,
        path: doc.path,
        title: doc.title,
        kind: String(doc.frontmatter.kind),
        domain:
          typeof doc.frontmatter.domain === 'string' ? doc.frontmatter.domain : undefined,
        frontmatter: doc.frontmatter,
        excerpt: doc.excerpt,
        mtime: doc.mtime,
      }));
  }, [args.manifest]);

  const readDocText = useCallback(
    async (slug: string) => {
      const handle = vault.fileHandles.get(slug);
      if (!handle) return null;
      return (await handle.getFile()).text();
    },
    [vault.fileHandles],
  );

  const port: VaultReadPort = useMemo(
    () => ({
      nodes: args.insight?.nodes ?? [],
      edges: args.insight?.edges ?? [],
      docs,
      readDocText,
    }),
    [args.insight, docs, readDocText],
  );

  /**
   * Elapsed seconds — the screen states a number only once the silence passes 5
   * seconds. Not fake progress but **how long you have actually waited**.
   *
   * The start time is set in the [Send] (send) handler — from the event, not from an
   * effect. The effect only subscribes to the timer as an external system, so it
   * does not cost another render.
   */
  useEffect(() => {
    if (runStartedAt === null) return;
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - runStartedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [runStartedAt]);

  const stop = useCallback(() => {
    generationRef.current += 1;
    setConstruction((current) => current?.status === 'running' ? { ...current, status: 'stopped' } : current);
    const sourceProof = sourceProofRef.current;
    sourceProofRef.current = null;
    if (sourceProof) setProposal((current) => current?.id === sourceProof.proposalId && (current.status === 'pending' || current.status === 'applying')
      ? { ...current, status: 'cancelled' } : current);
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
    setElapsedSeconds(null);
    setRunStartedAt(null);
  }, []);

  useEffect(() => () => stop(), [stop, resourceKey]);

  const sourceCurrent = useCallback(async (preview: ConstructionSourcePreview, reads: readonly ConstructionSourceRange[] = []) => {
    try {
      const current = await previewConstructionSource(preview.sourcePath, preview.destinationPath);
      if (current.sourcePath !== preview.sourcePath || current.destinationPath !== preview.destinationPath || current.fingerprint !== preview.fingerprint) return false;
      for (const witness of reads) {
        const fresh = await readConstructionSource(preview, witness.path, witness.startLine);
        if (fresh.fullFileSha256 !== witness.fullFileSha256 || fresh.endLine !== witness.endLine || fresh.text !== witness.text) return false;
      }
      return true;
    } catch { return false; }
  }, []);

  const sendTurn = useCallback(
    async (text: string, sourcePreview?: ConstructionSourcePreview) => {
      const provider = args.provider;
      const vaultPath = args.vaultPath;
      const adapter = provider ? resolveProviderAdapter(provider) : null;
      // A frame with only the path restored is not a state that has a vault to send
      // to. Even if the UI gate is out of step, the execution path under the button
      // closes it again.
      if (!provider || !vaultPath || !adapter || !args.manifest || abortRef.current || applyLockRef.current) return;
      if (sourcePreview && (provider !== 'local' || !args.localEndpoint?.model || !isLocalConstructionEndpoint(args.localEndpoint.baseUrl) || sourcePreview.destinationPath !== vaultPath || sourcePreview.files.length === 0)) return;
      const capturedResource = resourceKey;
      const generation = generationRef.current;
      sourceProofRef.current = null;
      setConstruction(sourcePreview ? { preview: sourcePreview, reads: [], sourceBytes: 0, issues: [], status: 'running' } : null);

      // Sending a new turn makes any live proposal a past one.
      setProposal((current) =>
        current && current.status === 'pending'
          ? { ...current, status: 'cancelled' }
          : current,
      );

      // The frame it was pressed in — it does not wait for the network.
      const turn = startTurn({ text, screenContext: args.screenContext });
      setTurns((current) => [...current, turn]);
      setRunning(true);
      setElapsedSeconds(0);
      setRunStartedAt(Date.now());

      const controller = new AbortController();
      let constructionRequests = 0;
      let requestIssue: string | null = null;
      abortRef.current = controller;
      const active = () => !controller.signal.aborted && abortRef.current === controller && resourceRef.current === capturedResource && generationRef.current === generation;
      const constructionExecutor = sourcePreview ? createConstructionExecutor(port, {
        preview: sourcePreview,
        read: (path, startLine) => readConstructionSource(sourcePreview, path, startLine),
        current: async () => active() && await sourceCurrent(sourcePreview),
      }) : null;
      const execute = constructionExecutor ? async (call: Parameters<typeof constructionExecutor.execute>[0]) => {
        if (!active()) throw new Error('construction_cancelled');
        const result = await constructionExecutor.execute(call);
        if (!active()) throw new Error('construction_cancelled');
        setConstruction({ preview: sourcePreview!, reads: [...constructionExecutor.reads], sourceBytes: constructionExecutor.sourceBytes, issues: [...constructionExecutor.issues], status: 'running' });
        return result;
      } : createToolExecutor(port);

      // ⚠️ **Everything from here down runs inside try/finally.** `runTurn` reaches the
      // network, the Tauri bridge and the tool executor; any of the three can reject.
      // Without this the reset below was simply skipped and the panel stayed
      // "running" forever — the send button dead, the elapsed clock counting up, and
      // the only escape a reload. A failed turn is a turn that ended.
      try {
        if (sourcePreview && !await sourceCurrent(sourcePreview)) throw new Error('source_changed');
        if (!active()) return;
        const result = await runTurn(
          {
            adapter: sourcePreview ? constructionAdapter : adapter,
            tools: sourcePreview ? CONSTRUCTION_TOOLS : AGENT_TOOLS,
            system: sourcePreview ? CONSTRUCTION_SYSTEM : systemPrompt,
            ...(sourcePreview ? { roundCap: 8 } : {}),
            // The address path has no default model — only that computer knows what is
            // installed on it. The name the user chose in settings arrives here.
            model: args.localEndpoint?.model || adapter.defaultModel,
            notices: args.notices,
            execute,
            async send({ body, scope, question, model }) {
              if (!active()) throw new Error('construction_cancelled');
              if (sourcePreview) {
                if (constructionRequests >= 8 || new TextEncoder().encode(body).byteLength > 65536) {
                  requestIssue = 'construction_request_limit';
                  throw new Error(requestIssue);
                }
                constructionRequests += 1;
              }
              const echo = await llmChat({
                signal: controller.signal,
                provider,
                vaultPath,
                model,
                question,
                body,
                scope,
                baseUrl: args.localEndpoint?.baseUrl ?? null,
                ...(sourcePreview ? { sourceConstruction: true } : {}),
              });
              if (!echo) throw new Error('desktop_bridge_unavailable');
              return echo;
            },
          },
          turn,
          {
            signal: controller.signal,
            onProgress: (next) => {
              if (active()) setTurns((current) => current.map((existing) => (existing.id === next.id ? next : existing)));
            },
          },
        );

        const issues = [...(constructionExecutor?.issues ?? []), ...(requestIssue ? [{ code: requestIssue, target: sourcePreview!.sourcePath }] : [])];
        const invalidSource = issues.some((issue) => /source_changed|source_not_listed|source_evidence_invalid/.test(issue.code));
        const finalTurn = requestIssue ? { ...result.turn, events: [
          ...result.turn.events.filter((event) => !(event.kind === 'notice' && event.code === 'network-failed')),
          { kind: 'notice' as const, code: 'round-cap' as const, text: `${args.constructionNotices?.incomplete ?? args.notices.roundCap} (${requestIssue})` },
        ] } : result.turn;
        setTurns((current) => current.map((existing) => (existing.id === finalTurn.id ? finalTurn : existing)));
        if (!active()) return;
        setRunning(false);
        setElapsedSeconds(null);
        setRunStartedAt(null);

        if (sourcePreview && constructionExecutor && invalidSource) {
          setConstruction({ preview: sourcePreview, reads: [...constructionExecutor.reads], sourceBytes: constructionExecutor.sourceBytes, issues, status: 'sourceChanged' });
          return;
        }
        if (result.writeIntents.length > 0) {
          const built = await buildProposal({
            intents: result.writeIntents,
            port,
            readNodesThisTurn: result.readSlugs,
            vaultIsGit: args.vaultIsGit,
            locale: args.locale,
            labels: args.proposalLabels,
            // This draft was written by this provider's model — a web screen does not
            // make it something a person wrote (ledger 2026-07-31). The same name the
            // audit log already records is passed straight through.
            agentName: provider,
          });
          if (built && active()) {
            if (sourcePreview && constructionExecutor) {
              if (!await sourceCurrent(sourcePreview, constructionExecutor.reads) || !active()) {
                if (active()) setConstruction({ preview: sourcePreview, reads: [...constructionExecutor.reads], sourceBytes: constructionExecutor.sourceBytes, issues: [...issues, { code: 'source_changed', target: sourcePreview.sourcePath }], status: 'sourceChanged' });
                return;
              }
              sourceProofRef.current = { proposalId: built.id, resourceKey: capturedResource, generation, preview: sourcePreview, reads: [...constructionExecutor.reads] };
            }
            setProposal(built);
          }
        }
        if (sourcePreview && constructionExecutor && active()) {
          setConstruction({ preview: sourcePreview, reads: [...constructionExecutor.reads], sourceBytes: constructionExecutor.sourceBytes, issues,
            status: issues.length > 0 ? 'incomplete' : sourceProofRef.current ? finalTurn.status === 'done' && !finalTurn.events.some((event) => event.kind === 'notice' && event.code === 'round-cap') ? 'draft' : 'incomplete' : 'failed' });
        }
      } catch (error) {
        const cancelled = controller.signal.aborted || resourceRef.current !== capturedResource || generationRef.current !== generation;
        if (sourcePreview && !cancelled) setConstruction((current) => current ? { ...current, issues: [...current.issues, { code: requestIssue ?? (String(error).includes('source_changed') ? 'source_changed' : 'construction_failed'), target: sourcePreview.sourcePath }], status: requestIssue ? 'incomplete' : String(error).includes('source_changed') ? 'sourceChanged' : 'failed' } : current);
        if (!cancelled) console.error('[vault-agent] turn failed', error);
        setTurns((current) =>
          current.map((existing) =>
            existing.id === turn.id
              ? {
                  ...existing,
                  status: cancelled ? 'aborted' : 'failed',
                  events: [
                    ...existing.events,
                    { kind: 'notice', code: cancelled ? 'aborted' : requestIssue ? 'round-cap' : 'failed', text: cancelled ? args.notices.aborted : requestIssue ? `${args.constructionNotices?.incomplete ?? args.notices.roundCap} (${requestIssue})` : args.notices.failed },
                  ],
                }
              : existing,
          ),
        );
      } finally {
        if (abortRef.current === controller) {
          setRunning(false);
          setElapsedSeconds(null);
          setRunStartedAt(null);
          abortRef.current = null;
        }
      }
    },
    [args, port, systemPrompt, resourceKey, sourceCurrent],
  );
  const send = useCallback((text: string) => sendTurn(text), [sendTurn]);
  const sendConstruction = useCallback((preview: ConstructionSourcePreview, text: string) => sendTurn(text, preview), [sendTurn]);

  const toggleChange = useCallback((changeId: string, selected: boolean) => {
    setProposal((current) =>
      current
        ? {
            ...current,
            changes: current.changes.map((change) =>
              change.id === changeId ? { ...change, selected } : change,
            ),
          }
        : current,
    );
  }, []);

  const toggleSnapshot = useCallback((snapshotRequested: boolean) => {
    setProposal((current) => (current ? { ...current, snapshotRequested } : current));
  }, []);

  const cancelProposal = useCallback(() => {
    // Cancel = 0 files changed. Only the state changes here.
    setProposal((current) => (current ? { ...current, status: 'cancelled' } : current));
  }, []);

  const apply = useCallback(async () => {
    if (!proposal || proposal.status !== 'pending' || applyLockRef.current || abortRef.current) return;
    applyLockRef.current = true;
    const proof = sourceProofRef.current;
    const capturedResource = resourceKey;
    const generation = generationRef.current;
    const applyCurrent = () => resourceRef.current === capturedResource && generationRef.current === generation;
    // **Lock first, then write.** Without moving the state before the `await`, that
    // gap is a re-entrancy window outright — one double-click meant two vault writes.
    setProposal((current) =>
      current && current.status === 'pending' ? { ...current, status: 'applying' } : current,
    );
    try {
      if (proof && (proof.proposalId !== proposal.id || proof.resourceKey !== capturedResource || proof.generation !== generation || !await sourceCurrent(proof.preview, proof.reads))) {
        setConstruction((current) => current ? { ...current, issues: [...current.issues, { code: 'source_changed', target: proof.preview.sourcePath }], status: 'sourceChanged' } : current);
        setProposal((current) => current?.id === proposal.id && current.status === 'applying' ? { ...current, status: 'conflict' } : current);
        return;
      }
      if (!applyCurrent()) {
        setProposal((current) => current?.id === proposal.id && current.status === 'applying' ? { ...current, status: 'cancelled' } : current);
        return;
      }
      const guardWrite = () => { if (!applyCurrent()) throw new Error('construction_scope_changed'); };
      const outcome = await applyProposal(
        proposal,
        {
          createDoc: (slug, content) => { guardWrite(); return vault.createDoc(slug, content); },
          saveDoc: (slug, content, options) => { guardWrite(); return vault.saveDoc(slug, content, options ?? {}); },
          currentMtime: (slug) =>
            args.manifest?.docs.find((doc) => doc.slug === slug)?.mtime,
          refresh: () => vault.refresh(),
        // A git save point is the business of surfaces outside this widget (settings,
        // Atlas Git), so v1 does not take one — when it cannot be taken, it says so.
          snapshot: async () => null,
        },
        { snapshotLabel: args.snapshotLabel },
      );
      setHasAppliedOnce(true);
      if (outcome.status === 'applied') {
        // What landed and how many — only the selected changes, counted by tool kind.
        // Counted in **concepts and connections** rather than files, because that is
        // the unit the user counts in.
        const applied = proposal.changes.filter((change) => change.selected);
        const concepts = applied.filter((change) => change.tool !== 'add_relation' && change.tool !== 'add_relations').length;
        const relations = applied.length - concepts;
        setSessionSummary((current) => ({
          concepts: current.concepts + concepts,
          relations: current.relations + relations,
        }));
      }
      setProposal((current) =>
        current?.id === proposal.id
          ? {
              ...current,
              // 'failed' stays 'failed' — mapping it back to 'pending' discarded
              // the error and made a failed write look like "not yet applied"
              // while files may already have changed (bug sweep 2026-09-01).
              status:
                outcome.status === 'applied'
                  ? 'applied'
                  : outcome.status === 'conflict'
                    ? 'conflict'
                    : 'failed',
              appliedSnapshotSha:
                outcome.status === 'applied' ? (outcome.snapshotSha ?? undefined) : undefined,
              applyErrorMessage: outcome.status === 'failed' ? outcome.message : undefined,
              writtenPaths: outcome.status === 'conflict' ? [] : outcome.writtenPaths,
              refreshErrorMessage: outcome.status === 'failed' ? outcome.refreshError : undefined,
            }
          : current,
      );
    } finally { applyLockRef.current = false; }
  }, [args.manifest, args.snapshotLabel, proposal, vault, resourceKey, sourceCurrent]);

  const copyProposal = useCallback(() => {
    if (!proposal) return;
    void navigator.clipboard?.writeText(proposalToClipboardPacket(proposal));
  }, [proposal]);

  const reset = useCallback(() => {
    stop();
    setTurns([]);
    setProposal(null);
    setConstruction(null);
    setSessionSummary({ concepts: 0, relations: 0 });
  }, [stop]);

  return {
    turns,
    proposal,
    construction,
    running,
    elapsedSeconds,
    systemPrompt: construction ? CONSTRUCTION_SYSTEM : systemPrompt,
    hasAppliedOnce,
    sessionSummary,
    send,
    sendConstruction,
    stop,
    reset,
    apply,
    cancelProposal,
    copyProposal,
    toggleChange,
    toggleSnapshot,
    errorMessage: llmChatErrorMessage,
  };
}
