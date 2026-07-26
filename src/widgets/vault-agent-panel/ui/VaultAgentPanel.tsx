'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { X } from 'lucide-react';

import type { VaultManifest } from '@/entities/docs-vault';
import type { KnowledgeProjectInsight } from '@/entities/knowledge-graph';
import type { ScreenContextSnapshot } from '@/features/vault-agent';
import { LLM_AUDIT_LOG_RELATIVE_PATH } from '@/shared/lib/llm-audit-log';
import { requestSettingsView } from '@/shared/lib/settings-view-intent';
import { isLlmChatBridgeAvailable } from '@/shared/lib/tauri-llm';
import {
  SECRET_PROVIDER_HOSTS,
  SECRET_PROVIDERS,
  secretStatus,
  subscribeSecretChange,
  type SecretProvider,
} from '@/shared/lib/tauri-secrets';

import { useVaultAgent } from '../model/use-vault-agent';
import { AgentHandoffCard } from './AgentHandoffCard';
import { AgentLockedComposer, AgentLockedState } from './AgentLockedState';
import { AgentProposalCard } from './AgentProposalCard';
import { AgentPromptDisclosure } from './AgentPromptDisclosure';
import { AgentScopeSheet } from './AgentScopeSheet';
import { AgentTranscript } from './AgentTranscript';

/**
 * 에이전트 패널 — 지도 오른쪽에 자리를 내주는 세로 도크.
 *
 * ## 리플로우가 왜 이렇게 되어 있나
 *
 * 패널은 `<main>` 의 flex row 안에서 **폭만** 애니메이션한다. 폭 애니메이션
 * 하나가 두 컬럼(지도 flex-1 · 패널 고정폭)을 같은 프레임에 함께 움직이므로,
 * 지도 축소와 패널 진입이 **같은 시작·같은 곡선**이 된다 — 따로 맞춘 두
 * 애니메이션이 아니라 물리적으로 하나다. 그래야 "지도를 뺏겼다" 가 아니라
 * "자리를 내줬다" 로 읽힌다.
 *
 * ## 닫힘 = 중단
 *
 * 패널을 닫으면 진행 중 호출도 같은 경로로 끊긴다. 백그라운드 계속은 없다.
 */
export function VaultAgentPanel({
  open,
  onClose,
  vaultPath,
  insight,
  manifest,
  screenContext,
  vaultIsGit,
  canWrite,
  onFocusNode,
  onOpenFolder,
  downloadHref,
}: {
  open: boolean;
  onClose: () => void;
  vaultPath: string | null;
  insight: KnowledgeProjectInsight | null;
  manifest: VaultManifest | null;
  screenContext: ScreenContextSnapshot;
  vaultIsGit: boolean;
  canWrite: boolean;
  onFocusNode: (slug: string) => void;
  /** 폴더가 없을 때 이 패널이 직접 열 수 있는 경로 — 없으면 그 상태에 문이 없다. */
  onOpenFolder?: () => void;
  downloadHref: string;
}) {
  const t = useTranslations('vaultAgentPanel');
  const locale = useLocale();
  const [draft, setDraft] = useState('');
  const [scopeAccepted, setScopeAccepted] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const bridgeAvailable = isLlmChatBridgeAvailable();
  /**
   * 어느 벤더의 키가 이 컴퓨터에 있는지. 등록 순서(= `secrets.rs` 허용목록
   * 순서)로 첫 번째를 쓴다 — 모델 피커도 벤더 피커도 만들지 않는다.
   * 전체 키는 어떤 경로로도 오지 않으므로 여기서 아는 것은 "있다" 뿐이다.
   */
  const [provider, setProvider] = useState<SecretProvider | null>(null);
  /**
   * 키를 넣고 **돌아오는 길**. 설정 시트에서 키가 저장되면 그 순간 신호가 오고
   * 여기서 다시 조회한다 — 새로고침을 요구하지 않는다(요구하면 결함이다).
   * 조회 자체는 아래 effect 하나가 소유하고, 이 값은 그 effect 를 다시 돌리는
   * 방아쇠일 뿐이다.
   */
  const [secretNonce, setSecretNonce] = useState(0);
  useEffect(() => {
    if (!open || !bridgeAvailable) return undefined;
    return subscribeSecretChange(() => setSecretNonce((value) => value + 1));
  }, [open, bridgeAvailable]);
  useEffect(() => {
    if (!open || !bridgeAvailable) return;
    let cancelled = false;
    void (async () => {
      for (const candidate of SECRET_PROVIDERS) {
        const status = await secretStatus(candidate);
        if (cancelled) return;
        if (status?.stored) {
          setProvider(candidate);
          return;
        }
      }
      if (!cancelled) setProvider(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, bridgeAvailable, secretNonce]);

  const agent = useVaultAgent({
    provider,
    vaultPath,
    insight,
    manifest,
    screenContext,
    locale,
    vaultIsGit,
    projectInstructions: null,
    snapshotLabel: t('snapshotLabel'),
    notices: {
      roundCap: t('notice.roundCap'),
      aborted: t('notice.aborted'),
      networkFailed: t('notice.networkFailed'),
      rateLimited: t('notice.rateLimited'),
      rejected: t('notice.rejected'),
      auditBlocked: t('notice.auditBlocked'),
      providerRefused: t('notice.providerRefused'),
      failed: t('notice.failed'),
    },
    proposalLabels: {
      createFile: (path) => t('proposal.createFile', { path }),
      modifyFile: (path) => t('proposal.modifyFile', { path }),
      addRelation: ({ from, to, type }) =>
        t('proposal.addRelation', { from, to, type }),
    },
  });

  // 닫힘 = 중단. 열려 있지 않으면 진행 중인 것도 함께 끝난다.
  const { stop } = agent;
  useEffect(() => {
    if (!open) stop();
  }, [open, stop]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // 새 내용은 아래로만 자란다 — 스크롤 앵커 하단 고정.
  useEffect(() => {
    const node = scrollRef.current;
    // jsdom 에는 scrollTo 가 없다 — 없는 API 를 부르지 않고 그냥 넘어간다.
    if (!node || typeof node.scrollTo !== 'function') return;
    node.scrollTo({ top: node.scrollHeight });
  }, [agent.turns, agent.proposal]);

  const ready = bridgeAvailable && Boolean(provider) && Boolean(vaultPath);
  const canSend = ready && scopeAccepted && !agent.running && draft.trim().length > 0;

  /**
   * 이 패널이 지금 어느 상태인가 — 한 값으로 접는다. 같은 박스가 다른 상태가
   * 되는 것이므로, 이 값이 바뀔 때만 크로스페이드가 한 번 돈다.
   */
  const stage = !bridgeAvailable
    ? 'web'
    : !vaultPath
      ? 'no-folder'
      : !provider
        ? 'no-key'
        : !scopeAccepted
          ? 'scope'
          : 'chat';
  const lockedExamples = [t('locked.example1'), t('locked.example2'), t('locked.example3')];

  function submit() {
    if (!canSend) return;
    const text = draft.trim();
    // 누른 그 프레임에 입력칸이 비고 말풍선이 앉는다 — 네트워크를 기다리지
    // 않는다. `send` 는 동기 상태 전이 후 비동기로 이어진다.
    setDraft('');
    void agent.send(text);
  }

  return (
    <aside
      data-testid="vault-agent-panel"
      data-agent-panel-state={open ? 'open' : 'closed'}
      data-agent-panel-reflow-token="--agent-panel-reflow-duration"
      aria-label={t('title')}
      aria-hidden={!open}
      // 폭 하나가 두 컬럼을 함께 움직인다 — 지도 축소와 패널 진입이 같은
      // 곡선, 같은 시작. `--agent-panel-reflow-duration` 이 그 하나의 값.
      style={{
        width: open ? 'var(--agent-panel-width)' : '0px',
        transitionProperty: 'width',
        transitionDuration: 'var(--agent-panel-reflow-duration)',
        transitionTimingFunction: 'var(--topology-motion-ease-out)',
      }}
      className="relative flex h-full shrink-0 flex-col overflow-hidden border-l border-[color:var(--color-divider)] bg-[color:var(--color-canvas)]"
    >
      <div
        className="flex h-full w-[var(--agent-panel-width)] flex-col"
        // 열리는 동안에도 지도 조작을 막지 않는다 — 블로킹 표면이 아니다.
        inert={!open ? true : undefined}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-[color:var(--color-border-soft)] px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-semibold text-[color:var(--color-text-primary)]">
              {t('title')}
            </p>
            <p className="truncate text-label tracking-label text-[color:var(--color-text-quaternary)]">
              {t('subtitle')}
            </p>
          </div>
          <button
            type="button"
            data-testid="vault-agent-panel-close"
            onClick={onClose}
            aria-label={t('close')}
            className="flex size-[var(--overlay-close-size)] shrink-0 items-center justify-center rounded-chip text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </header>

        <div
          ref={scrollRef}
          data-agent-panel-stage={stage}
          // 이 스크롤러 자체를 세로 flex 로 둔다 — 잠긴 상태의 입력칸 자리가
          // 실제 입력칸과 **같은 위치**(패널 바닥)에 서려면 아래 래퍼가 남는
          // 높이를 받아야 하고, `min-h-full` 은 스크롤 컨테이너 안에서 신뢰할 수
          // 없다.
          className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3"
        >
          {/* 같은 박스가 다른 상태가 된다 — 상태 이름을 key 로 두어 짧은
              크로스페이드(--motion-base)가 한 번만 돌게 한다. 새 화면이 나타난
              것처럼 보이면 "여기가 열렸다" 가 아니라 "다른 데로 갔다" 로 읽힌다. */}
          <div key={stage} className="agent-panel-stage-swap flex grow flex-col">
          {!bridgeAvailable ? (
            // 브라우저에는 키를 둘 곳도 보낼 경로도 없다 — 설정으로 보내는 것이
            // 아니라 앱으로 보낸다(정직 강등).
            <AgentLockedState
              title={t('degraded.webTitle')}
              body={t('degraded.webBody')}
              examplesTitle={t('locked.examplesTitle')}
              examples={lockedExamples}
            />
          ) : !vaultPath ? (
            <AgentLockedState
              title={t('degraded.noVaultTitle')}
              body={t('degraded.noVaultBody')}
              examplesTitle={t('locked.examplesTitle')}
              examples={lockedExamples}
            />
          ) : !provider ? (
            // 소유자 판정 반전(2026-07-26) — 구 구조는 "왼쪽 아래 설정(톱니)의
            // 「AI 연결」에서…" 라고 **말로** 길을 알려줬다. 화면이 데려다 줄 수
            // 있는 자리를 사람에게 찾게 만드는 것은 안내가 아니라 숙제다.
            <AgentLockedState
              title={t('degraded.noKeyTitle')}
              body={t('degraded.noKeyBody')}
              examplesTitle={t('locked.examplesTitle')}
              examples={lockedExamples}
            />
          ) : !scopeAccepted ? (
            <AgentScopeSheet
              provider={t(`provider.${provider}`)}
              host={SECRET_PROVIDER_HOSTS[provider]}
              auditPath={LLM_AUDIT_LOG_RELATIVE_PATH}
              labels={{
                title: t('scope.title'),
                body: ({ provider: name, host }) => t('scope.body', { provider: name, host }),
                liveRows: t('scope.liveRows'),
                recorded: (path) => t('scope.recorded', { path }),
                accept: t('scope.accept'),
                cancel: t('scope.cancel'),
              }}
              onAccept={() => setScopeAccepted(true)}
              onCancel={onClose}
            />
          ) : (
            <>
              <AgentTranscript
                turns={agent.turns}
                providerLabel={t(`provider.${provider}`)}
                elapsedSeconds={agent.elapsedSeconds}
                onFocusNode={onFocusNode}
                labels={{
                  you: t('you'),
                  lookingAt: (title) => t('screenContext.lookingAt', { title }),
                  wholeMap: t('screenContext.wholeMap'),
                  unsupported: t('unsupported'),
                  charsLabel: (chars) => t('charsLabel', { chars }),
                  thinking: t('thinking'),
                  thinkingSeconds: (seconds) => t('thinkingSeconds', { seconds }),
                  footer: ({ provider: name, chars, rounds }) =>
                    t('footer', { provider: name, chars, rounds }),
                }}
                renderProposal={() => null}
              />
              {agent.proposal ? (
                <AgentProposalCard
                  proposal={agent.proposal}
                  canWrite={canWrite}
                  vaultIsGit={vaultIsGit}
                  expandedByDefault={!agent.hasAppliedOnce}
                  onApply={() => void agent.apply()}
                  onCancel={agent.cancelProposal}
                  onCopy={agent.copyProposal}
                  onToggleChange={agent.toggleChange}
                  onToggleSnapshot={agent.toggleSnapshot}
                  onFocusNode={onFocusNode}
                  labels={{
                    title: (count) => t('proposal.title', { count }),
                    readOnlyTitle: t('proposal.readOnlyTitle'),
                    volume: ({ files, added, removed }) =>
                      t('proposal.volume', { files, added, removed }),
                    apply: (count) => t('proposal.apply', { count }),
                    cancel: t('proposal.cancel'),
                    copy: t('proposal.copy'),
                    copied: t('proposal.copied'),
                    snapshot: t('proposal.snapshot'),
                    snapshotUnavailable: t('proposal.snapshotUnavailable'),
                    applied: (sha) => t('proposal.applied', { sha }),
                    appliedNoSnapshot: t('proposal.appliedNoSnapshot'),
                    cancelled: t('proposal.cancelled'),
                    conflict: t('proposal.conflict'),
                    unreadWarning: t('proposal.unreadWarning'),
                    showOnMap: t('proposal.showOnMap'),
                    expandHint: t('proposal.expandHint'),
                  }}
                />
              ) : null}
              {agent.turns.length === 0 ? (
                <p className="text-body leading-[1.65] text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
                  {t('empty')}
                </p>
              ) : null}
            </>
          )}
          </div>
        </div>

        {/* 잠긴 상태의 입력칸 자리 — 실제 입력칸과 **같은 띠**(패널 바닥, 같은
            구분선)에 선다. 두 상태가 같은 자리를 쓰므로 키가 들어오는 순간이
            "여기가 열렸다" 로 읽힌다. 상태마다 안내와 목적지만 다르다. */}
        {stage === 'web' ? (
          <AgentLockedComposer
            testId="vault-agent-download-link"
            hint={t('locked.composerHintWeb')}
            actionLabel={t('degraded.download')}
            actionHref={downloadHref}
          />
        ) : stage === 'no-folder' ? (
          <AgentLockedComposer
            testId="vault-agent-open-folder"
            hint={t('locked.composerHintNoVault')}
            actionLabel={t('degraded.noVaultAction')}
            onAction={onOpenFolder}
          />
        ) : stage === 'no-key' ? (
          <AgentLockedComposer
            testId="vault-agent-open-settings"
            hint={t('locked.composerHint')}
            actionLabel={t('degraded.noKeyAction')}
            onAction={() => requestSettingsView('ai')}
          />
        ) : null}

        {ready && scopeAccepted ? (
          <footer className="shrink-0 border-t border-[color:var(--color-border-soft)] p-2.5">
            <AgentPromptDisclosure
              systemPrompt={agent.systemPrompt}
              labels={{ summary: t('promptDisclosure.summary'), note: t('promptDisclosure.note') }}
            />
            <div className="mt-2 flex items-end gap-2">
              <textarea
                ref={inputRef}
                data-testid="vault-agent-input"
                value={draft}
                rows={2}
                disabled={agent.running}
                placeholder={t('placeholder')}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    submit();
                  }
                }}
                className="min-w-0 flex-1 resize-none rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-2.5 py-2 text-body leading-[1.5] text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)] disabled:opacity-60"
              />
              {agent.running ? (
                <button
                  type="button"
                  data-testid="vault-agent-stop"
                  onClick={agent.stop}
                  className="h-9 shrink-0 rounded-chip border border-[color:var(--color-border-strong)] px-3 text-label font-semibold tracking-label text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-overlay-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]"
                >
                  {t('stop')}
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="vault-agent-send"
                  disabled={!canSend}
                  onClick={submit}
                  className="h-9 shrink-0 rounded-chip bg-[color:var(--color-indigo-brand)] px-3 text-label font-semibold tracking-label text-white transition-colors hover:bg-[color:var(--color-indigo-hover)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]"
                >
                  {t('send')}
                </button>
              )}
            </div>
            <p className="mt-1.5 text-caption text-[color:var(--color-text-quaternary)] [word-break:keep-all]">
              {t('boundary')}
            </p>
            {/* 경계를 말한 다음 줄에 **갈 곳**을 준다. 문장만 있으면 "그럼 어디서
                하지" 가 남고, 폴더 절대경로를 손으로 찾게 만드는 것이 여기서
                흐름이 끊기는 실제 이유다. 접힌 채로 두는 이유: 대화가 주인공이고
                이 카드는 떠날 때만 필요하다. */}
            {vaultPath ? (
              <div className="mt-2">
                <AgentHandoffCard
                  vaultPath={vaultPath}
                  focusedSlug={screenContext.focusedSlug}
                  labels={{
                    summary: t('handoffSummary'),
                    note: t('handoffNote'),
                    copy: t('handoffCopy'),
                    copied: t('handoffCopied'),
                  }}
                />
              </div>
            ) : null}
          </footer>
        ) : null}
      </div>
    </aside>
  );
}

