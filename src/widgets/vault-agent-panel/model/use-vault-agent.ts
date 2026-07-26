'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { VaultManifest } from '@/entities/docs-vault';
import type { KnowledgeProjectInsight } from '@/entities/knowledge-graph';
import { useLocalVault } from '@/features/docs-vault-local';
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
} from '@/features/vault-agent';
import { applyProposal, proposalToClipboardPacket } from '@/features/vault-agent/model/proposal-applier';
import { buildProposal } from '@/features/vault-agent/model/proposal-builder';
import { llmChat, llmChatErrorMessage } from '@/shared/lib/tauri-llm';
import type { SecretProvider } from '@/shared/lib/tauri-secrets';

/**
 * 패널의 상태 — 턴 목록, 진행 중 요청, pending 제안 하나.
 *
 * **살아 있는 제안은 항상 최대 1개다.** 새 턴을 보내면 앞의 pending 제안은
 * 자동으로 `cancelled` 가 된다(적용도 취소도 안 된 카드가 쌓이면 "뭐가
 * 반영됐지" 가 흐려진다). 미적용 제안을 위한 보관함·대기열은 만들지 않는다 —
 * 볼트 밖 제2 진실원이 된다.
 */

export interface VaultAgentNotices {
  roundCap: string;
  aborted: string;
  networkFailed: string;
  rateLimited: string;
  rejected: string;
  auditBlocked: string;
  providerRefused: string;
  failed: string;
}

export interface UseVaultAgentArgs {
  provider: SecretProvider | null;
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
  /** 세션 첫 적용은 diff 펼친 상태가 기본 — 도장 찍기 방지. */
  const [hasAppliedOnce, setHasAppliedOnce] = useState(false);

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
   * 경과 초 — 5초 넘는 침묵부터 화면이 숫자를 말한다. 가짜 진행이 아니라
   * **실제로 얼마나 기다렸는지**다.
   *
   * 시작 시각은 [보내기] 핸들러에서 정해진다(효과가 아니라 사건에서). 효과는
   * 타이머라는 외부 시스템을 구독할 뿐이라 렌더를 한 번 더 돌리지 않는다.
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
      if (!provider || !vaultPath || !adapter) return;

      // 새 턴을 보내면 살아 있던 제안은 지나간 제안이 된다.
      setProposal((current) =>
        current && current.status === 'pending'
          ? { ...current, status: 'cancelled' }
          : current,
      );

      // 누른 그 프레임 — 네트워크를 기다리지 않는다.
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
          model: adapter.defaultModel,
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
    // 취소 = 파일 0개 변경. 여기서는 상태만 바뀐다.
    setProposal((current) => (current ? { ...current, status: 'cancelled' } : current));
  }, []);

  const apply = useCallback(async () => {
    if (!proposal || proposal.status !== 'pending') return;
    const outcome = await applyProposal(
      proposal,
      {
        createDoc: (slug, content) => vault.createDoc(slug, content),
        saveDoc: (slug, content, options) => vault.saveDoc(slug, content, options ?? {}),
        currentMtime: (slug) =>
          args.manifest?.docs.find((doc) => doc.slug === slug)?.mtime,
        refresh: () => vault.refresh(),
        // git 저장점은 위젯 밖(설정/Atlas Git 표면)의 일이라 v1 에서는
        // 잡지 않는다 — 잡을 수 없으면 없다고 말한다.
        snapshot: async () => null,
      },
      { snapshotLabel: args.snapshotLabel },
    );
    setHasAppliedOnce(true);
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
  }, [stop]);

  return {
    turns,
    proposal,
    running,
    elapsedSeconds,
    systemPrompt,
    hasAppliedOnce,
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
