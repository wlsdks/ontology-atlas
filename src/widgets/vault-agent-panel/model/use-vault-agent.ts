'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { VaultManifest } from '@/entities/docs-vault';
import type { KnowledgeProjectInsight } from '@/entities/knowledge-graph';
import { useLocalVault } from '@/entities/vault-session';
import {
  AGENT_TOOLS,
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
}

export function useVaultAgent(args: UseVaultAgentArgs) {
  const vault = useLocalVault();
  const [turns, setTurns] = useState<AgentTurn[]>([]);
  const [proposal, setProposal] = useState<AgentProposal | null>(null);
  const [running, setRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(null);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
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
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
    setElapsedSeconds(null);
    setRunStartedAt(null);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const provider = args.provider;
      const vaultPath = args.vaultPath;
      const adapter = provider ? resolveProviderAdapter(provider) : null;
      // A frame with only the path restored is not a state that has a vault to send
      // to. Even if the UI gate is out of step, the execution path under the button
      // closes it again.
      if (!provider || !vaultPath || !adapter || !args.manifest) return;

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
      abortRef.current = controller;
      const execute = createToolExecutor(port);

      const result = await runTurn(
        {
          adapter,
          tools: AGENT_TOOLS,
          system: systemPrompt,
          // The address path has no default model — only that computer knows what is
          // installed on it. The name the user chose in settings arrives here.
          model: args.localEndpoint?.model || adapter.defaultModel,
          notices: args.notices,
          execute,
          async send({ body, scope, question, model }) {
            const echo = await llmChat({
              provider,
              vaultPath,
              model,
              question,
              body,
              scope,
              baseUrl: args.localEndpoint?.baseUrl ?? null,
            });
            if (!echo) throw new Error('데스크톱 앱에서만 보낼 수 있어요.');
            return echo;
          },
        },
        turn,
        {
          signal: controller.signal,
          onProgress: (next) =>
            setTurns((current) =>
              current.map((existing) => (existing.id === next.id ? next : existing)),
            ),
        },
      );

      setTurns((current) =>
        current.map((existing) => (existing.id === result.turn.id ? result.turn : existing)),
      );
      setRunning(false);
      setElapsedSeconds(null);
      setRunStartedAt(null);
      abortRef.current = null;

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
        if (built) setProposal(built);
      }
    },
    [args, port, systemPrompt],
  );

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
    if (!proposal || proposal.status !== 'pending') return;
    // **Lock first, then write.** Without moving the state before the `await`, that
    // gap is a re-entrancy window outright — one double-click meant two vault writes.
    setProposal((current) =>
      current && current.status === 'pending' ? { ...current, status: 'applying' } : current,
    );
    const outcome = await applyProposal(
      proposal,
      {
        createDoc: (slug, content) => vault.createDoc(slug, content),
        saveDoc: (slug, content, options) => vault.saveDoc(slug, content, options ?? {}),
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
      current
        ? {
            ...current,
            status:
              outcome.status === 'applied'
                ? 'applied'
                : outcome.status === 'conflict'
                  ? 'conflict'
                  : 'pending',
            appliedSnapshotSha:
              outcome.status === 'applied' ? (outcome.snapshotSha ?? undefined) : undefined,
          }
        : current,
    );
  }, [args.manifest, args.snapshotLabel, proposal, vault]);

  const copyProposal = useCallback(() => {
    if (!proposal) return;
    void navigator.clipboard?.writeText(proposalToClipboardPacket(proposal));
  }, [proposal]);

  const reset = useCallback(() => {
    stop();
    setTurns([]);
    setProposal(null);
    setSessionSummary({ concepts: 0, relations: 0 });
  }, [stop]);

  return {
    turns,
    proposal,
    running,
    elapsedSeconds,
    systemPrompt,
    hasAppliedOnce,
    sessionSummary,
    send,
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
