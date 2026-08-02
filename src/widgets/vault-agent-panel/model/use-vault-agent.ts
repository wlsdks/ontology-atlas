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
import type { ConnectionProvider } from '@/shared/lib/tauri-secrets';

/**
 * 패널의 상태 — 턴 목록, 진행 중 요청, pending 제안 하나.
 *
 * **살아 있는 제안은 항상 최대 1개다.** 새 턴을 보내면 앞의 pending 제안은
 * 자동으로 `cancelled` 가 된다(적용도 취소도 안 된 카드가 쌓이면 "뭐가
 * 반영됐지" 가 흐려진다). 미적용 제안을 위한 보관함·대기열은 만들지 않는다 —
 * 볼트 밖 제2 진실원이 된다.
 */

/**
 * 헤더 부제 자리에 앉는 **이 대화의 진전**. 자리·크기가 바뀌지 않게 두 수를
 * 항상 함께 말한다 — 숫자만 치환되므로 레이아웃이 튀지 않는다.
 */
export interface AgentSessionSummary {
  /** 만들거나 고친 개념 수. */
  concepts: number;
  /** 이은 연결 수. */
  relations: number;
}

export interface VaultAgentNotices {
  roundCap: string;
  /** 도구를 한 번도 안 부르고 멈춘 턴 — 상한 도달과 대칭인 한 줄. */
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
   * 「주소로 연결」 갈래에서만 값이 있다 — 사용자가 적은 러너 주소와 목록에서
   * 고른 모델. 명명 벤더에서는 둘 다 null 이고, 그때 모델은 어댑터의 기본값이다.
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
  /** 세션 첫 적용은 diff 펼친 상태가 기본 — 도장 찍기 방지. */
  const [hasAppliedOnce, setHasAppliedOnce] = useState(false);
  /**
   * 이 대화에서 실제로 반영된 것 — **로컬 카운트**다. 적용이 성공한 변경만
   * 센다(취소·충돌은 파일을 하나도 바꾸지 않았으므로 진전이 아니다).
   * 대화가 사라져도 이 숫자가 가리키는 사실은 frontmatter 와 git 에 남는다.
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
      // 경로만 복원된 프레임은 보낼 볼트가 있는 상태가 아니다.
      // UI 게이트가 어긋나더라도 버튼 아래의 실행 경로에서 다시 닫는다.
      if (!provider || !vaultPath || !adapter || !args.manifest) return;

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
          // 주소 갈래에는 기본 모델이 없다 — 그 컴퓨터에 무엇이 설치돼
          // 있는지는 그 컴퓨터만 알기 때문이다. 사용자가 설정에서 고른 이름이
          // 여기로 온다.
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
          // 이 초안을 쓴 것은 이 제공자의 모델이다 — 화면이 웹이라고 사람이
          // 쓴 것이 되지 않는다(2026-07-31 원장). 감사 로그가 이미 남기는
          // 같은 이름을 그대로 넘긴다.
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
    // 취소 = 파일 0개 변경. 여기서는 상태만 바뀐다.
    setProposal((current) => (current ? { ...current, status: 'cancelled' } : current));
  }, []);

  const apply = useCallback(async () => {
    if (!proposal || proposal.status !== 'pending') return;
    // **먼저 잠그고 나서 쓴다.** `await` 앞에 상태를 옮기지 않으면 그 사이가
    // 통째로 재진입 창이 된다 — 더블클릭 한 번에 볼트 쓰기가 둘이었다.
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
        // git 저장점은 위젯 밖(설정/Atlas Git 표면)의 일이라 v1 에서는
        // 잡지 않는다 — 잡을 수 없으면 없다고 말한다.
        snapshot: async () => null,
      },
      { snapshotLabel: args.snapshotLabel },
    );
    setHasAppliedOnce(true);
    if (outcome.status === 'applied') {
      // 무엇이 몇 개 반영됐나 — 선택된 변경만, 도구 종류로 센다. 파일 수가
      // 아니라 **개념/연결 수**로 세는 이유: 사용자가 세는 단위가 그것이다.
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
