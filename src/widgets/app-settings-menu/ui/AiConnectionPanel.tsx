'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import {
  secretClear,
  secretErrorMessage,
  secretSet,
  secretVerify,
  SECRET_PROVIDERS,
  SECRET_PROVIDER_HOSTS,
  type SecretProvider,
  type SecretStatus,
} from '@/shared/lib/tauri-secrets';
import type { LlmAuditEntry } from '@/shared/lib/llm-audit-log';
import { openTauriVaultInFinder } from '@/shared/lib/tauri-vault-fs';
import { useToast } from '@/shared/ui/toast';
import { cn } from '@/shared/lib/cn';
import { AI_PROVIDER_LABEL_KEY } from '../model/ai-providers';
import type { AiConnectionState } from '../model/use-ai-connection';

/**
 * [AI 연결] 서브뷰 (#80 S1·S2) — 내 API 키를 이 컴퓨터의 키체인에 두고,
 * 그 키가 살아 있는지 1클릭으로 확인하고, 나간 호출을 볼트 안 기록으로 본다.
 *
 * 이 화면이 지키는 것:
 * - **전체 키를 다시 그리는 경로가 없다.** 저장 성공 즉시 입력 상태를 비우고,
 *   그 뒤로 화면이 아는 것은 `last4` 뿐이다(Rust 계약 그대로).
 * - **정직한 웹 강등.** 브리지가 없으면 입력 필드를 렌더하지 않고 "왜 데스크톱
 *   전용인가" 를 그대로 설명한다. 숨기는 것보다 설명하는 것이 신뢰 자산이다.
 * - **정직한 빈 소비자.** 지금 이 키로 할 수 있는 일은 연결 확인뿐이라고
 *   화면에 적는다 — 볼트 질문 기능은 아직 없고, 있는 척하지 않는다.
 * - **보안 주장은 코드가 증명하는 범위까지만.** "절대 안전" 류 문구를 쓰지
 *   않는다(신뢰 헌장 ⑥). 명명 벤더에서 우리가 증명할 수 있는 것은 "코드에 박힌
 *   공식 주소로만 간다" 까지다 — 그래서 확인 범위 문구가 그 주소를 이름으로
 *   말한다.
 * - **미등록 행은 접혀 있다.** 입력칸 셋이 동시에 쌓이면 설정 시트가 폼 관문처럼
 *   읽힌다. 접힌 행도 상태(미등록)는 그대로 말하고, 시각 무게만 줄인다.
 * - **펼침은 되돌릴 수 있다.** [키 등록]을 눌러 본 사람이 마음을 바꿀 자리가
 *   화면에 있어야 한다 — 보이는 [취소] 와 Esc, 둘 다.
 *
 * ## 이 화면의 시각 위계 (2026-07-26 소유자 지적)
 *
 * 채워진 테두리 상자는 **벤더 목록 하나뿐**이다. 사람이 여기 오는 이유가
 * 대개 "키를 넣으려고" 인데, 벤더 목록·나가는 것 표·보낸 기록이 똑같은
 * 테두리+표면으로 쌓여 있으면 그 이유가 첫 번째로 읽히지 않는다(잉크가
 * 위계를 만드는 대신 상자 카탈로그를 만든다). 그래서 조작하는 블록만 상자를
 * 갖고, 읽는 블록(신뢰 고지·나가는 것·보낸 기록)은 구분선 + 라벨로 내려간다.
 * 정보는 하나도 줄이지 않는다 — 무게만 다르게 준다.
 */

const CLEAR_ARM_MS = 3000;

/** 감사 기록 파일의 볼트 상대 경로 — 경로만 mono, 곁의 한국어는 본문 서체. */
const LLM_AUDIT_RELATIVE_PATH = '.ontology-atlas/llm-audit.jsonl';

type VerifyState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ok' }
  | { kind: 'denied'; status: number | null }
  | { kind: 'failed'; message: string };

export interface AiConnectionPanelProps {
  connection: AiConnectionState;
  /** 데스크톱에서 알려진 볼트 절대 경로 — 감사 기록을 남길 곳. */
  vaultRootPath: string | null;
  downloadHref: string;
  onDownloadNavigate: () => void;
}

export function AiConnectionPanel({
  connection,
  vaultRootPath,
  downloadHref,
  onDownloadNavigate,
}: AiConnectionPanelProps) {
  const t = useTranslations('settings.ai');
  const { bridgeAvailable, statuses, applyStatus, auditEntries, refreshAudit } =
    connection;
  // 한 번에 하나만 펼친다 — 어느 키를 넣는 중인지가 화면에 하나뿐이어야
  // 붙여넣기 직전의 안전 문구가 그 키에 대한 말로 읽힌다.
  const [expanded, setExpanded] = useState<SecretProvider | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  /**
   * 펼침 취소 — [취소] 버튼과 Esc 가 공유하는 단 하나의 경로.
   *
   * 접기만으로 초안 키는 사라진다(`KeyDraftForm` 이 언마운트되므로). 여기서
   * 추가로 하는 일은 **포커스 복귀** 하나다: 방금 눌렀던 [키 등록] 으로
   * 돌려보내지 않으면 포커스가 body 로 떨어져, 사용자가 있던 자리를 잃는 데다
   * Esc 사다리의 다음 칸(서브뷰 → 루트)까지 죽는다 — 다이얼로그 밖으로 나간
   * 포커스에서는 시트의 keydown 이 더 이상 오지 않는다.
   */
  const cancelDraft = (provider: SecretProvider) => {
    setExpanded(null);
    window.setTimeout(() => {
      listRef.current
        ?.querySelector<HTMLButtonElement>(`[data-testid="ai-register-${provider}"]`)
        ?.focus({ preventScroll: true });
    }, 0);
  };

  const handleStatusChange = (provider: SecretProvider, next: SecretStatus) => {
    // 저장이 끝났거나 키를 지웠다면 그 행은 도로 접힌다. 특히 **지운 직후** —
    // 방금 비운 자리에 입력칸이 다시 열려 있으면 화면이 다시 넣으라고
    // 재촉하는 것처럼 읽힌다.
    setExpanded((current) => (current === provider ? null : current));
    applyStatus(provider, next);
  };

  if (!bridgeAvailable) {
    return (
      <div className="grid content-start gap-3" data-testid="ai-connection-view">
        <TrustHeadline>{t('principle')}</TrustHeadline>
        <div
          className="rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2.5"
          data-testid="ai-connection-web-degraded"
        >
          <p className="text-label font-medium text-[color:var(--color-text-secondary)]">
            {t('webDegradedTitle')}
          </p>
          <p className="mt-1 break-keep text-caption leading-4 text-[color:var(--color-text-tertiary)]">
            {t('webDegradedBody')}
          </p>
          <Link
            href={downloadHref}
            onClick={onDownloadNavigate}
            data-testid="ai-connection-download-link"
            className="mt-2 inline-flex h-8 items-center rounded-md border border-[color:var(--color-indigo-line-a32)] px-2.5 text-label text-[color:var(--color-indigo-accent)] transition-colors hover:border-[color:var(--color-indigo-line-a45)] hover:bg-[color:var(--color-indigo-line-a13)]"
          >
            {t('webDegradedCta')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="grid content-start gap-3"
      data-testid="ai-connection-view"
      onKeyDown={(event) => {
        // Esc 사다리의 **가장 안쪽 칸**. 펼친 입력 카드가 있으면 그것부터
        // 접고, 같은 keypress 가 위로 새지 않게 막는다 — 가로채지 않으면 설정
        // 시트가 같은 Esc 로 루트 뷰까지 물러나서, 키 하나 취소하려던 사람이
        // 서브뷰까지 잃는다("one overlay owns one Escape" 의 안쪽 확장).
        if (event.key !== 'Escape' || expanded === null) return;
        event.preventDefault();
        event.stopPropagation();
        cancelDraft(expanded);
      }}
    >
      <TrustHeadline>{t('principle')}</TrustHeadline>

      {/* 이 패널에서 채워진 테두리 상자를 갖는 유일한 블록 — 조작하는 곳. */}
      <div
        ref={listRef}
        className="divide-y divide-[color:var(--color-divider)] overflow-hidden rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]"
      >
        {SECRET_PROVIDERS.map((provider) => (
          <ProviderCard
            key={provider}
            provider={provider}
            status={statuses[provider]}
            vaultRootPath={vaultRootPath}
            expanded={expanded === provider}
            onExpand={() => setExpanded(provider)}
            onCancel={() => cancelDraft(provider)}
            onStatusChange={handleStatusChange}
            onVerified={refreshAudit}
          />
        ))}
      </div>

      {/* 위 목록에 딸린 캡션 — "키를 넣으면 무슨 일이 되나" 에 대한 정직한
          답이라 각주(4차 잉크)로 내려두지 않는다. */}
      <p className="break-keep px-1 text-caption leading-4 text-[color:var(--color-text-tertiary)]">
        {t('emptyConsumer')}
      </p>

      <SupportingSection title={t('scopeTitle')}>
        <dl className="grid gap-1.5">
          {[
            { label: t('scopeWhatLabel'), value: t('scopeWhatValue') },
            { label: t('scopeWhenLabel'), value: t('scopeWhenValue') },
            { label: t('scopeLogLabel'), value: t('scopeLogValue') },
          ].map((row) => (
            <div key={row.label} className="flex gap-3">
              <dt className="w-12 shrink-0 text-caption leading-4 text-[color:var(--color-text-tertiary)]">
                {row.label}
              </dt>
              <dd className="min-w-0 break-keep text-caption leading-4 text-[color:var(--color-text-quaternary)]">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </SupportingSection>

      <AuditTail
        entries={auditEntries}
        vaultRootPath={vaultRootPath}
      />
    </div>
  );
}

/**
 * 신뢰 고지 한 줄 — 이 패널에서 가장 먼저 읽혀야 하는 문장이다.
 *
 * 구 스타일은 `text-label` + tertiary 로 화면에서 **가장 흐린 잉크**였다.
 * 키체인·전송 시점·기록이라는 이 제품의 핵심 약속을 각주 크기로 적어 두면,
 * 정보를 지운 것과 실질이 같다. 상자를 주지 않고 본문 크기·2차 잉크로만
 * 올린다 — 아래 벤더 목록(1차 잉크 + 테두리)이 여전히 시선의 승자다.
 */
function TrustHeadline({ children }: { children: ReactNode }) {
  return (
    <p className="break-keep px-1 text-body leading-5 text-[color:var(--color-text-secondary)]">
      {children}
    </p>
  );
}

/**
 * 읽는 블록 — 테두리와 표면 대신 얇은 구분선 + 평문 라벨.
 *
 * 라벨에 mono/uppercase/wide-tracking 아이브로를 쓰지 않는 이유: 그 조합은
 * 라틴 전용 관습이라 한글에는 대문자화가 적용되지 않고 **낱말 사이만 벌어진다**
 * (소유자가 "무엇이  나가는가" 로 읽은 것이 그 간극이다). 이 자리의 제목은
 * 문장형 한국어라 장식 대신 크기·잉크로만 낮춘다.
 */
function SupportingSection({
  title,
  action,
  children,
  testId,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section
      aria-label={title}
      data-testid={testId}
      className="border-t border-[color:var(--color-divider)] px-1 pt-3"
    >
      <div className="flex min-h-6 items-center justify-between gap-2">
        <h3 className="text-label text-[color:var(--color-text-tertiary)]">{title}</h3>
        {action}
      </div>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

function ProviderCard({
  provider,
  status,
  vaultRootPath,
  expanded,
  onExpand,
  onCancel,
  onStatusChange,
  onVerified,
}: {
  provider: SecretProvider;
  status: SecretStatus | null;
  vaultRootPath: string | null;
  /** 미등록 행이 입력칸을 펼치고 있나 — 펼침은 패널이 소유한다(한 번에 하나). */
  expanded: boolean;
  onExpand: () => void;
  /** 아무것도 넣지 않고 되돌아가기 — 펼침을 되돌릴 수 있게 하는 유일한 경로. */
  onCancel: () => void;
  onStatusChange: (provider: SecretProvider, next: SecretStatus) => void;
  onVerified: () => void;
}) {
  const t = useTranslations('settings.ai');
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [verify, setVerify] = useState<VerifyState>({ kind: 'idle' });
  const [clearArmed, setClearArmed] = useState(false);
  const clearTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (clearTimer.current !== null) window.clearTimeout(clearTimer.current);
    },
    [],
  );

  const label = t(AI_PROVIDER_LABEL_KEY[provider]);
  const stored = status?.stored === true;

  const handleVerify = async () => {
    if (!vaultRootPath || verify.kind === 'checking') return;
    setVerify({ kind: 'checking' });
    try {
      const result = await secretVerify(provider, vaultRootPath);
      if (!result) return;
      if (result.ok) setVerify({ kind: 'ok' });
      // 거부 판정은 Rust 가 한다 — 거부를 뜻하는 상태 코드는 벤더마다 다르고
      // (Gemini 는 400), 그 지식이 화면에도 복제되면 조용히 갈라진다.
      else if (result.denied) setVerify({ kind: 'denied', status: result.httpStatus });
      else
        setVerify({
          kind: 'failed',
          message: result.message ?? String(result.httpStatus ?? ''),
        });
    } catch (err) {
      setVerify({ kind: 'failed', message: secretErrorMessage(err) });
    } finally {
      // 성공이든 거부든 호출은 기록됐다 — 기록을 바로 보여준다.
      onVerified();
    }
  };

  const handleClear = async () => {
    if (!clearArmed) {
      // 2단 확정 — 모달을 띄울 만큼 무거운 판단이 아니고, 되돌리기도 쉽다.
      setClearArmed(true);
      clearTimer.current = window.setTimeout(() => setClearArmed(false), CLEAR_ARM_MS);
      return;
    }
    if (clearTimer.current !== null) window.clearTimeout(clearTimer.current);
    setClearArmed(false);
    try {
      const next = await secretClear(provider);
      if (next) onStatusChange(provider, next);
      setVerify({ kind: 'idle' });
      toast.show(t('cleared'));
    } catch (err) {
      setError(secretErrorMessage(err));
    }
  };

  // 접힌 미등록 행 — 이름과 [키 등록] 한 줄. 상태(미등록)는 그대로 말하되
  // 입력칸을 미리 펼쳐 두지 않는다.
  if (!stored && !expanded) {
    return (
      <div
        className="flex h-[var(--control-row-h)] items-center justify-between gap-3 px-3"
        data-testid={`ai-provider-${provider}`}
      >
        {/* 벤더 이름은 정체성이지 상태가 아니다 — 등록 여부와 무관하게 같은
            잉크로 그린다. 미등록이라는 사실은 뒤따르는 슬롯이 [키 등록] 버튼이냐
            끝 4자냐로 이미 오해 없이 말한다. 이름까지 어둡히면 같은 사실을 두 번
            부호화하면서, 이 화면의 1차 과업("내 벤더 찾기")만 어려워진다.
            이 목록이 패널의 시선 승자이므로 이름은 본문 크기 · 1차 잉크. */}
        <p className="text-body text-[color:var(--color-text-primary)]">{label}</p>
        <button
          type="button"
          data-testid={`ai-register-${provider}`}
          onClick={onExpand}
          className="inline-flex h-8 shrink-0 items-center rounded-md border border-[color:var(--color-border-soft)] px-2.5 text-label text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-indigo-line-a32)] hover:text-[color:var(--color-indigo-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset"
        >
          {t('keyRegister')}
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-2 px-3 pb-2.5" data-testid={`ai-provider-${provider}`}>
      {/* 접힌 행과 **같은 헤더 밴드**(`--control-row-h`) — 이름 열과 뒤따르는
          슬롯의 광학 중심이 행 상태와 무관하게 맞는다. 밴드가 없으면 등록 행의
          이름만 위로 떠서, 등록·미등록이 섞인 흔한 상태에서 세로 열이
          삐뚤어진다. 한 행이 펼쳐져도 나머지 행의 리듬이 그대로인 이유이기도
          하다(치수 규칙성). */}
      <div className="flex h-[var(--control-row-h)] items-center justify-between gap-3">
        <p className="text-body text-[color:var(--color-text-primary)]">{label}</p>
        {stored ? (
          // 상태어는 본문 서체, 마스킹된 끝 4자만 mono — 한 덩어리로 등폭
          // 처리하면 "등록됨" 뒤 공백이 벌어져 라벨과 값이 갈라져 보인다.
          <span className="flex items-baseline gap-1.5 text-caption text-[color:var(--color-text-tertiary)]">
            {t('storedLabel')}
            <span className="font-mono">···· {status?.last4 ?? ''}</span>
          </span>
        ) : null}
      </div>

      {stored ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid={`ai-verify-${provider}`}
            onClick={() => void handleVerify()}
            disabled={verify.kind === 'checking' || !vaultRootPath}
            className="inline-flex h-8 items-center rounded-md border border-[color:var(--color-indigo-line-a32)] px-2.5 text-label text-[color:var(--color-indigo-accent)] transition-colors hover:border-[color:var(--color-indigo-line-a45)] hover:bg-[color:var(--color-indigo-line-a13)] disabled:opacity-60"
          >
            {verify.kind === 'checking' ? t('verifying') : t('verify')}
          </button>
          <button
            type="button"
            data-testid={`ai-clear-${provider}`}
            onClick={() => void handleClear()}
            className={cn(
              'inline-flex h-8 items-center rounded-md border px-2.5 text-label transition-colors',
              clearArmed
                ? 'border-[color:var(--color-danger-a32)] text-[color:var(--color-status-danger)] hover:bg-[color:var(--color-danger-a10)]'
                : 'border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)] hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-secondary)]',
            )}
          >
            {clearArmed ? t('clearConfirm') : t('clear')}
          </button>
        </div>
      ) : (
        <KeyDraftForm
          provider={provider}
          label={label}
          onSaved={(next) => onStatusChange(provider, next)}
          onCancel={onCancel}
          onError={setError}
        />
      )}

      <ProviderCaption
        error={error}
        provider={label}
        host={SECRET_PROVIDER_HOSTS[provider]}
        stored={stored}
        verify={verify}
        vaultKnown={vaultRootPath !== null}
      />
    </div>
  );
}

/**
 * 붙여넣는 칸 — **펼쳐진 동안만 존재하는 컴포넌트다.**
 *
 * 초안 키를 부모가 아니라 여기서 들고 있는 것이 요점이다. 행이 접히면 이
 * 컴포넌트가 언마운트되면서 초안도 **함께 사라진다** — 지우는 코드가 따로 있는
 * 게 아니라, 남을 자리 자체가 없다.
 *
 * 왜 굳이 이렇게 하나: 행 접기는 "화면에서 사라졌으니 없어졌겠지" 라는 믿음을
 * 만든다. 초안을 부모가 들고 있으면 그 믿음이 틀리게 된다 — 붙여넣었다가 다른
 * 행으로 옮겨 그만둔 키가 시트가 닫힐 때까지 메모리에 남는다. 수명을 가시성에
 * 묶어 두면 "붙여넣은 키는 저장 전까지만 화면에 있다" 는 이 패널의 계약이
 * 규율이 아니라 구조가 된다.
 *
 * 그래서 [취소]는 여기서 지우는 일을 하지 않는다 — 부모에게 접으라고만 알린다.
 * 이 컴포넌트가 사라지는 것이 곧 초안이 사라지는 것이다.
 */
function KeyDraftForm({
  provider,
  label,
  onSaved,
  onCancel,
  onError,
}: {
  provider: SecretProvider;
  label: string;
  onSaved: (next: SecretStatus) => void;
  onCancel: () => void;
  onError: (message: string | null) => void;
}) {
  const t = useTranslations('settings.ai');
  const [draftKey, setDraftKey] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!draftKey.trim() || saving) return;
    setSaving(true);
    onError(null);
    try {
      const next = await secretSet(provider, draftKey);
      // 저장 성공 즉시 프런트 상태에서 키를 지운다 — 전체 키가 이 화면에
      // 남아 있을 수 있는 유일한 순간을 여기서 끝낸다.
      setDraftKey('');
      if (next) onSaved(next);
    } catch (err) {
      onError(secretErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="password"
        autoComplete="off"
        spellCheck={false}
        // 사용자가 방금 [키 등록]을 눌러 이 칸을 연 참이다 — 한 번 더
        // 클릭하게 만들지 않는다.
        autoFocus
        value={draftKey}
        aria-label={t('keyLabel', { provider: label })}
        placeholder={t('keyPlaceholder')}
        data-testid={`ai-key-input-${provider}`}
        onChange={(event) => setDraftKey(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void handleSave();
        }}
        // 값은 mono(기계 문자열), 안내 문구는 본문 서체 — 한국어 placeholder 까지
        // 등폭으로 그리면 "API  키  붙여넣기" 처럼 낱말 사이가 벌어진다.
        className="h-8 min-w-0 flex-1 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] px-2 font-mono text-caption text-[color:var(--color-text-primary)] transition-colors placeholder:font-sans placeholder:text-[color:var(--color-text-quaternary)] focus-visible:border-[color:var(--color-indigo-line-a45)] focus-visible:outline-none"
      />
      {/* 저장 왼쪽의 중립 컨트롤 — 눌러 보고 마음이 바뀐 사람의 출구다.
          Esc 로도 같은 일이 일어나지만 그건 보이지 않는다. 되돌릴 길이 화면에
          없는 펼침은 함정이라, 발견 가능한 컨트롤이 있어야 계약이 성립한다. */}
      <button
        type="button"
        data-testid={`ai-cancel-${provider}`}
        onClick={onCancel}
        className="inline-flex h-8 shrink-0 items-center rounded-md border border-[color:var(--color-border-soft)] px-2.5 text-label text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset"
      >
        {t('cancel')}
      </button>
      <button
        type="button"
        data-testid={`ai-save-${provider}`}
        onClick={() => void handleSave()}
        disabled={!draftKey.trim() || saving}
        className="inline-flex h-8 shrink-0 items-center rounded-md border border-[color:var(--color-indigo-line-a32)] px-2.5 text-label text-[color:var(--color-indigo-accent)] transition-colors hover:border-[color:var(--color-indigo-line-a45)] hover:bg-[color:var(--color-indigo-line-a13)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset disabled:opacity-60"
      >
        {saving ? t('saving') : t('save')}
      </button>
    </div>
  );
}

/** 카드마다 정확히 한 줄의 설명 — 상태가 바뀌어도 카드 높이 해부구조는 같다. */
function ProviderCaption({
  error,
  provider,
  host,
  stored,
  verify,
  vaultKnown,
}: {
  error: string | null;
  provider: string;
  /** 이 확인 요청이 향하는 호스트 — 우리가 증명할 수 있는 만큼의 목적지 주장. */
  host: string;
  stored: boolean;
  verify: VerifyState;
  vaultKnown: boolean;
}) {
  const t = useTranslations('settings.ai');

  if (error) {
    return (
      <p className="break-keep text-caption leading-4 text-[color:var(--color-status-danger)]">
        {error}
      </p>
    );
  }
  if (!stored) {
    // 붙여넣는 순간이 신뢰를 판단하는 순간이다 — 포커스 시에만 뜨는 툴팁이
    // 아니라 필드 아래 상시 노출.
    return (
      <p className="break-keep text-caption leading-4 text-[color:var(--color-text-quaternary)]">
        {t('pasteSafety', { provider })}
      </p>
    );
  }
  if (!vaultKnown) {
    return (
      <p className="break-keep text-caption leading-4 text-[color:var(--color-text-quaternary)]">
        {t('verifyNeedsVault')}
      </p>
    );
  }
  if (verify.kind === 'ok') {
    return (
      <p className="flex items-center gap-1.5 text-caption text-[color:var(--color-status-success)]">
        <StatusDot tone="success" />
        {t('verified')}
      </p>
    );
  }
  if (verify.kind === 'denied') {
    return (
      <p className="flex items-center gap-1.5 text-caption text-[color:var(--color-status-danger)]">
        <StatusDot tone="danger" />
        {t('verifyDenied', { status: verify.status ?? '' })}
      </p>
    );
  }
  if (verify.kind === 'failed') {
    return (
      <p className="flex items-center gap-1.5 break-keep text-caption leading-4 text-[color:var(--color-status-danger)]">
        <StatusDot tone="danger" />
        {t('verifyFailed', { message: verify.message })}
      </p>
    );
  }
  return (
    <p className="break-keep text-caption leading-4 text-[color:var(--color-text-quaternary)]">
      {t('verifyScope', { host })}
    </p>
  );
}

function StatusDot({ tone }: { tone: 'success' | 'danger' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-1.5 shrink-0 rounded-full',
        tone === 'success'
          ? 'bg-[color:var(--color-status-success)]'
          : 'bg-[color:var(--color-status-danger)]',
      )}
    />
  );
}

/** 보낸 기록 — 실제 JSONL 줄만 그린다. 없는 줄을 요약으로 지어내지 않는다. */
function AuditTail({
  entries,
  vaultRootPath,
}: {
  entries: LlmAuditEntry[];
  vaultRootPath: string | null;
}) {
  const t = useTranslations('settings.ai');

  return (
    <SupportingSection
      title={t('auditTitle')}
      testId="ai-audit-tail"
      action={
        vaultRootPath ? (
          <button
            type="button"
            data-testid="ai-audit-open"
            onClick={() => void openTauriVaultInFinder(vaultRootPath)}
            className="-mr-1 inline-flex h-6 items-center rounded-sm px-1 text-caption text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset"
          >
            {t('auditOpen')}
          </button>
        ) : null
      }
    >
      <div className="grid gap-1">
        {entries.length === 0 ? (
          <p className="break-keep text-caption leading-4 text-[color:var(--color-text-tertiary)]">
            {t('auditEmpty')}
          </p>
        ) : (
          [...entries].reverse().map((entry, index) => (
            <div
              key={`${entry.at}-${index}`}
              className="flex items-center gap-2"
              data-testid="ai-audit-row"
            >
              <span className="shrink-0 font-mono text-caption text-[color:var(--color-text-quaternary)]">
                {formatAuditTime(entry.at)}
              </span>
              <span className="min-w-0 flex-1 truncate text-caption text-[color:var(--color-text-tertiary)]">
                {entry.provider} ·{' '}
                {entry.purpose === 'verify' ? t('auditPurposeVerify') : t('auditPurposeAsk')}{' '}
                · {t('auditScope', { chars: entry.scope.vaultChars })}
              </span>
              <span
                className={cn(
                  'shrink-0 text-caption',
                  entry.outcome === 'ok'
                    ? 'text-[color:var(--color-status-success)]'
                    : entry.outcome === 'unknown'
                      ? 'text-[color:var(--color-text-quaternary)]'
                      : 'text-[color:var(--color-status-danger)]',
                )}
              >
                {entry.outcome === 'ok'
                  ? t('auditOutcomeOk')
                  : entry.outcome === 'denied'
                    ? t('auditOutcomeDenied')
                    : entry.outcome === 'error'
                      ? t('auditOutcomeError')
                      : t('auditOutcomeUnknown')}
              </span>
            </div>
          ))
        )}
      </div>
      {/* 경로만 mono, 곁의 한국어는 본문 서체 — 한 줄을 통째로 mono 로 두면
          한글 낱말 사이가 벌어져 "커밋할지는  당신의  선택이에요" 처럼 읽힌다
          (등폭 글리프 폭이 한글 자간에 그대로 들어오기 때문). 파일 경로는
          기계 문자열이라 mono 가 정보지만, 그 옆 문장은 아니다. */}
      <p className="mt-2 break-keep text-caption leading-4 text-[color:var(--color-text-quaternary)]">
        <span className="font-mono">{LLM_AUDIT_RELATIVE_PATH}</span>
        {' · '}
        {t('auditPathNote')}
      </p>
    </SupportingSection>
  );
}

/** 기록의 시각 — 로컬 타임존 기준 `MM.DD HH:mm`. 값이 이상하면 원문 그대로. */
function formatAuditTime(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return at;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
