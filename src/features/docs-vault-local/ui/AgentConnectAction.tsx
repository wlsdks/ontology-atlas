'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, CircleAlert, ClipboardCopy, FileText, Loader2 } from 'lucide-react';

import type { McpServerLaunch } from '@/shared/config';
import { buildAgentAnalyzePrompt } from '@/shared/config/agent-prompts';
import { useCopyFeedback } from '@/shared/lib/use-copy-feedback';
import { controlClass } from '@/shared/ui/control-class';
import { type AgentClientId, filesForClient } from '../lib/agent-clients';
import {
  planAgentConfig,
  verifyMcpServer,
  writeAgentConfig,
  type AgentConfigPlan,
  type McpVerifyResult,
} from '@/shared/lib/tauri-agent-setup';

import {
  agentConfigContents,
  vaultPathRelativeToConfigRoot,
} from '../lib/agent-config-contents';

/**
 * 「에이전트 연결」 — 미리보기 → 승인 → 쓰기 → 자가 검증.
 *
 * 이 컴포넌트의 존재 이유는 **중간의 두 단계**다. 앱이 사용자 디스크에 파일을
 * 쓴다면 무엇을 쓸지 먼저 보여주고 사용자가 눌러야 한다 (신뢰 헌장: 조용한
 * 쓰기 0, git diff 로 감사 가능). 그리고 쓴 다음에는 그게 실제로 붙는지
 * 그 자리에서 증명해야 한다 — 가짜 진행바 대신 진짜 왕복 한 번.
 *
 * 실패는 숨기지 않는다. 실패 사유 문장이 곧 사용자의 다음 행동이다.
 */

type Phase = 'idle' | 'planning' | 'preview' | 'writing' | 'verifying' | 'done' | 'failed';

export interface AgentConnectActionProps {
  /** vault 절대 경로. 없으면(웹) 이 컴포넌트는 아무것도 그리지 않는다. */
  vaultPath: string | null;
  /** 번들 서버 실행 계약. 없으면 그리지 않는다. */
  launch: McpServerLaunch | null;
  /** 쓰기가 끝난 뒤 vault 상태를 다시 읽게 하는 훅 (설정 배지 갱신). */
  onWritten?: (() => void | Promise<void>) | null;
  /**
   * **어느 도구를 연결하는가.** 이 값이 쓰는 파일을 정한다
   * (`lib/agent-clients.ts`).
   *
   * 2026-07-30 까지 이 prop 이 없었고, 그래서 `plan.targets` 전체를 순회했다 —
   * 「Claude Code에 연결」 한 번이 `.mcp.json` · `.mcp.json.example` ·
   * `.codex/config.toml` 셋을 썼다. 라벨이 거짓말하는 결함이고, 안 쓰는 도구의
   * 파일이 사용자 git diff 에 뜬다.
   *
   * 기본값을 두지 않는다 — 기본값이 있으면 다음에 이 컴포넌트를 쓰는 사람이
   * 도구를 안 넘겨도 조용히 동작하고, 그게 이 결함이 생긴 방식이다.
   */
  clientId: AgentClientId;
}

/**
 * 인디고 채움 주 행동의 **면과 호버.** 값 층(`controlClass`)은 모양·크기·글자색
 * 까지만 내고 틴트/호버는 소비처에 남긴다 — 이 표면의 두 자리(미리보기 · 확인)가
 * 같은 문자열이라 한 벌로 묶는다.
 */
const INDIGO_SOLID_SKIN =
  'w-full justify-center border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] font-medium hover:bg-[color:var(--color-indigo-a26)]';

export function AgentConnectAction({ vaultPath, launch, onWritten, clientId }: AgentConnectActionProps) {
  const t = useTranslations('agentConnect');
  const [phase, setPhase] = useState<Phase>('idle');
  const [plan, setPlan] = useState<AgentConfigPlan | null>(null);
  const [verification, setVerification] = useState<McpVerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { state: analyzeCopy, copy: copyAnalyze } = useCopyFeedback();

  const startPreview = useCallback(async () => {
    if (!vaultPath) return;
    setPhase('planning');
    setError(null);
    try {
      const next = await planAgentConfig(vaultPath);
      if (!next) {
        setError(t('connectDesktopOnly'));
        setPhase('failed');
        return;
      }
      setPlan(next);
      setPhase('preview');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setPhase('failed');
    }
  }, [vaultPath, t]);

  const confirmWrite = useCallback(async () => {
    if (!vaultPath || !launch || !plan) return;
    setPhase('writing');
    setError(null);
    try {
      const vaultRelative = vaultPathRelativeToConfigRoot(plan.configRoot, plan.vaultPath);
      /**
       * **이 도구가 선언한 파일만** 쓴다. `plan.targets` 는 앱이 쓸 수 **있는**
       * 것의 목록이고 이 클릭이 쓸 것의 목록이 아니다 — 그 둘을 같은 것으로 읽은
       * 것이 이 결함의 정체였다.
       */
      const wanted = new Set(filesForClient(clientId));
      await writeAgentConfig(
        vaultPath,
        plan.targets
          .filter((target) => wanted.has(target.fileName))
          .map((target) => ({
            fileName: target.fileName,
            contents: agentConfigContents({
              fileName: target.fileName,
              launch,
              vaultRelative,
              vaultAbsolute: plan.vaultPath,
            }),
          })),
      );
      await onWritten?.();
      setPhase('verifying');
      const result = await verifyMcpServer(vaultPath);
      setVerification(result);
      setPhase(result.ok ? 'done' : 'failed');
      if (!result.ok) setError(result.failure);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setPhase('failed');
    }
  }, [vaultPath, launch, plan, onWritten, clientId]);

  if (!vaultPath || !launch) return null;

  const busy = phase === 'planning' || phase === 'writing' || phase === 'verifying';

  return (
    <div className="flex flex-col gap-2.5" data-testid="agent-connect-action">
      {phase === 'idle' || phase === 'planning' ? (
        <button
          type="button"
          onClick={() => void startPreview()}
          disabled={busy}
          data-testid="agent-connect-preview"
          className={controlClass({
            shape: 'chip',
            size: 'lg',
            tone: 'strong',
            className: INDIGO_SOLID_SKIN,
          })}
        >
          {phase === 'planning' ? (
            <Loader2 size={13} aria-hidden className="animate-spin" />
          ) : (
            <FileText size={13} aria-hidden />
          )}
          {t('connectPreviewCta')}
        </button>
      ) : null}

      {plan && (phase === 'preview' || phase === 'writing') ? (
        <div
          data-testid="agent-connect-plan"
          className="rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2.5"
        >
          <p className="text-label font-medium text-[color:var(--color-text-secondary)]">
            {plan.rootKind === 'repo-root'
              ? t('connectPlanRepoRoot', { path: plan.configRoot })
              : t('connectPlanVaultFolder', { path: plan.configRoot })}
          </p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {/*
              * **미리보기는 쓸 것만 그린다.** 오늘 아침 `confirmWrite` 만 필터하고
              * 이 목록은 그대로 뒀더니, 화면이 5개를 약속하고 1개를 썼다 —
              * 「See what will be written」이라는 이름이 곧 거짓이 된다.
              * 원래 결함(라벨이 거짓말한다)의 다른 반쪽이었다.
              */}
            {plan.targets
              .filter((target) => filesForClient(clientId).includes(target.fileName))
              .map((target) => (
              <li
                key={target.fileName}
                className="flex items-baseline justify-between gap-2 font-mono text-caption text-[color:var(--color-text-tertiary)]"
              >
                <span className="truncate">{target.absolutePath}</span>
                <span className="shrink-0 text-[color:var(--color-text-quaternary)]">
                  {target.exists ? t('connectPlanOverwrite') : t('connectPlanCreate')}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-caption leading-relaxed text-[color:var(--color-text-quaternary)]">
            {t('connectPlanAuditNote')}
          </p>
          <button
            type="button"
            onClick={() => void confirmWrite()}
            disabled={busy}
            data-testid="agent-connect-confirm"
            className={controlClass({
              shape: 'chip',
              size: 'lg',
              tone: 'strong',
              className: `mt-2.5 ${INDIGO_SOLID_SKIN}`,
            })}
          >
            {phase === 'writing' ? <Loader2 size={13} aria-hidden className="animate-spin" /> : null}
            {t('connectConfirmCta')}
          </button>
        </div>
      ) : null}

      {phase === 'verifying' ? (
        <p
          data-testid="agent-connect-verifying"
          className="inline-flex items-center gap-1.5 text-label text-[color:var(--color-text-tertiary)]"
        >
          <Loader2 size={12} aria-hidden className="animate-spin" />
          {t('connectVerifying')}
        </p>
      ) : null}

      {phase === 'done' && verification ? (
        <div
          role="status"
          data-testid="agent-connect-verified"
          className="rounded-chip border border-[color:var(--color-success-a35)] bg-[color:var(--color-success-a10)] px-3 py-2.5"
        >
          <p className="inline-flex items-center gap-1.5 text-body font-medium text-[color:var(--color-text-primary)]">
            <Check size={13} aria-hidden className="text-[color:var(--color-status-success)]" />
            {t('connectVerifiedTitle')}
          </p>
          <p className="mt-1 text-label leading-relaxed text-[color:var(--color-text-tertiary)]">
            {t('connectVerifiedDesc', {
              tools: verification.toolCount ?? 0,
              node: verification.sampleTitle ?? verification.sampleSlug ?? '',
            })}
          </p>
          {/*
           * 재시작은 **조건이지 다음 걸음이 아니다** — 한 단 낮춰 CTA 가
           * 행동 승자로 남게 한다(위계 평결: 선행 조건은 행동보다 먼저 읽힌다).
           */}
          <p className="mt-1 text-label leading-relaxed text-[color:var(--color-text-quaternary)]">
            {t('connectVerifiedRestart')}
          </p>
          {/*
           * 연결만 하고 끝내면 사용자는 「이제 뭘 하지」에 그대로 남는다.
           * 카드의 마지막 줄이 다음 걸음을 손에 쥐여 준다 — 우리가 그 세션에
           * 명령을 밀어 넣을 수는 없으므로(MCP 는 에이전트가 서버를 띄우는
           * pull 모델이라 인바운드 채널이 없다), 붙여넣을 문장을 준다.
           * 라벨이 「재시작한 세션에」라고 말해 선행 조건까지 나른다.
           */}
          <button
            type="button"
            data-testid="agent-connect-copy-analyze"
            onClick={() => void copyAnalyze(buildAgentAnalyzePrompt({ vaultPath }))}
            className={controlClass({
              shape: 'chip',
              tone: 'secondary',
              className:
                'mt-2.5 border-[color:var(--color-overlay-3)] hover:border-[color:var(--color-indigo-line-a35)] hover:text-[color:var(--color-text-primary)]',
            })}
          >
            {analyzeCopy === 'failed' ? (
              <CircleAlert size={11} aria-hidden />
            ) : (
              <ClipboardCopy size={11} aria-hidden />
            )}
            {analyzeCopy === 'copied'
              ? t('connectVerifiedCopied')
              : analyzeCopy === 'failed'
                ? t('connectVerifiedCopyFailed')
                : t('connectVerifiedCopyAnalyze')}
          </button>
        </div>
      ) : null}

      {phase === 'failed' ? (
        <div
          role="status"
          data-testid="agent-connect-failed"
          className="rounded-chip border border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a10)] px-3 py-2.5"
        >
          <p className="inline-flex items-center gap-1.5 text-body font-medium text-[color:var(--color-text-primary)]">
            <CircleAlert size={13} aria-hidden className="text-[color:var(--color-status-danger)]" />
            {t('connectFailedTitle')}
          </p>
          <p className="mt-1 break-words text-label leading-relaxed text-[color:var(--color-text-tertiary)]">
            {error ?? t('connectFailedUnknown')}
          </p>
          <button
            type="button"
            onClick={() => {
              setPhase('idle');
              setPlan(null);
              setVerification(null);
              setError(null);
            }}
            data-testid="agent-connect-retry"
            className={controlClass({
              shape: 'link',
              tone: 'accentOnTint',
              className:
                'touch-hit-expand mt-2 font-medium hover:text-[color:var(--color-text-primary)]',
            })}
          >
            {t('connectRetry')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
