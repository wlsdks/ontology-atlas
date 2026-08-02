'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import {
  secretClear,
  secretErrorMessage,
  secretSet,
  secretVerify,
  LOCAL_PROVIDER,
  SECRET_PROVIDERS,
  SECRET_PROVIDER_HOSTS,
  type ConnectionProvider,
  type SecretProvider,
  type SecretStatus,
} from '@/shared/lib/tauri-secrets';
import {
  clearLocalEndpoint,
  countChatCapableModels,
  hostOfBaseUrl,
  isEmbeddingOnlyModel,
  isLocalEndpointReady,
  readLocalEndpoint,
  readLocalVerdict,
  writeLocalEndpoint,
  type LocalEndpointSettings,
  type LocalVerifyReason,
} from '@/shared/lib/local-endpoint';
import type { LlmAuditEntry } from '@/shared/lib/llm-audit-log';
import { openTauriVaultInFinder } from '@/shared/lib/tauri-vault-fs';
import { Select } from '@/shared/ui/select';
import { useToast } from '@/shared/ui/toast';
import { cn } from '@/shared/lib/cn';
import { useRowDisclosure } from '@/shared/lib/use-row-disclosure';
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
 * - **연결이 무엇을 여는지 목록보다 먼저 적는다.** 여기 오는 사람의 첫 질문은
 *   "연결하면 뭐가 되나" 다. 그 답이 목록 아래 각주로 있던 동안 이 화면은
 *   **이미 출시된 에이전트를 "준비 중" 이라고 부정**하고 있었다 — 그 문장은
 *   기능이 없던 시절의 잔재였고, 정직함이 아니라 거짓말이 된 뒤였다. 지금
 *   문구가 말하는 것은 **오늘 동작하는 것만**이다.
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
  const [expanded, setExpanded] = useState<ConnectionProvider | null>(null);
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
  const cancelDraft = (provider: ConnectionProvider) => {
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
      <div
        className="grid max-w-[var(--settings-content-measure)] content-start gap-3"
        data-testid="ai-connection-view"
      >
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
          {/* 키 없는 갈래(주소로 연결)가 생긴 뒤로, 위 문단만 두면 강등이
              절반만 정직해진다 — "키가 문제라면 키가 필요 없는 Ollama 는
              되겠지" 로 읽히기 때문이다. 왜 그것도 안 되는지와 어디로 가면
              되는지를 같은 카드 안에서 말한다. */}
          <p
            className="mt-1.5 break-keep text-caption leading-4 text-[color:var(--color-text-tertiary)]"
            data-testid="ai-connection-web-degraded-local"
          >
            {t('webDegradedLocalBody')}
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
    // 폭은 **루트 얼굴의 행과 같은 값**으로 묶는다(`--settings-content-measure`).
    // 드릴인은 LNB 를 떼면서 그 180px 를 내용이 먹었고, 그 결과 같은 시트인데
    // 행이 846px 로 벌어져 「Anthropic ‥‥‥ [키 등록]」 사이가 통째로 빈 칸이
    // 됐다. 묶는 것은 시트가 아니라 행이다 — 시트는 고정 크기이고, 줄이면
    // 루트의 LNB 2단이 깨진다.
    <div
      className="grid max-w-[var(--settings-content-measure)] content-start gap-3"
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

      {/* 목록 **위**에 있는 이유: 여기 온 사람의 첫 질문은 "연결하면 뭐가
          되나" 이고 "어떻게 연결하나" 는 그다음이다. 이 문장이 목록 아래
          각주로 있던 동안에는 순서가 뒤집혀 있었고, 게다가 이미 출시된
          기능을 "준비 중" 이라고 부정하고 있었다 — 에이전트 패널의
          [설정에서 키 등록] 이 사람을 여기로 보내는데 도착 화면이 자기를
          보낸 CTA 를 무효화했다. 그래서 문구는 **오늘 되는 것만** 말한다:
          읽고 답한다(읽기 도구 10종) · 쓰기는 확인 뒤(`scope.consent` 가
          이미 그 계약이다). 미래 시제는 한 톨도 쓰지 않는다. */}
      {/* 크기는 `text-label`(11px) — 이 문장은 램프가 말하는 "마이크로 라벨·
          범례·타임스탬프"(9.5px)가 아니라 **읽히려고 있는 한 줄**이다. 행간은
          스텝이 자기 짝(16px)을 싣는다.
          폭은 산문 measure 안으로 — 도크의 산문 칼럼은 846px 이라 9.5px 로
          **한 줄에 74자**가 들어갔다(`--measure-prose: 70ch` 초과). 컨트롤 행은
          820px 를 쓰므로 이 상한은 **산문에만** 건다. */}
      <p
        data-testid="ai-what-it-unlocks"
        className="max-w-[var(--git-setup-measure)] break-keep px-1 text-label text-[color:var(--color-text-secondary)]"
      >
        {t('whatItUnlocks')}
      </p>

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
        {/* 네 번째 행 — 키가 아니라 **주소**를 적는 갈래. 같은 상자 안에 두는
            이유: 사람이 이 화면에 오는 이유("내 모델을 붙인다")가 같고, 별도
            상자를 하나 더 세우면 이 패널의 시선 승자가 둘이 되어 위계가
            무너진다(§ 이 화면의 시각 위계). */}
        <LocalEndpointCard
          vaultRootPath={vaultRootPath}
          expanded={expanded === LOCAL_PROVIDER}
          onExpand={() => setExpanded(LOCAL_PROVIDER)}
          onCancel={() => cancelDraft(LOCAL_PROVIDER)}
          onCollapse={() => setExpanded(null)}
          onVerified={refreshAudit}
        />
      </div>

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
    <p className="max-w-[var(--git-setup-measure)] break-keep px-1 text-body leading-5 text-[color:var(--color-text-secondary)]">
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

  const handleSaved = (next: SecretStatus) => {
    onStatusChange(provider, next);
    // 행이 스스로 바뀌는 것(입력칸 → 등록됨 ···· 끝4자)이 1차 증거이고, 토스트는
    // 그 사실을 말로 확인해 준다 — 삭제(`cleared`)와 같은 대칭. 둘 중 하나만
    // 있으면 "눌렀는데 뭐가 됐지" 가 남는다.
    toast.show(t('saved'));
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

  // 상세 영역이 열려 있어야 하는가 — 등록된 행(확인/지우기)이거나, 미등록 행이
  // 입력칸을 펼친 상태. 두 경우가 **같은 영역**을 쓰므로 저장 성공(입력 폼 →
  // 등록됨 액션)도 열고 닫는 것과 같은 하나의 높이 전이를 지난다.
  const detailOpen = stored || expanded;
  // 구조 분해로 받는다 — ref 를 담은 객체를 렌더에서 property 로 읽으면
  // React Compiler 린트가 "렌더 중 ref 접근" 으로 센다(실제 접근은 없다).
  const {
    mounted: detailMounted,
    boxRef: detailBoxRef,
    contentRef: detailContentRef,
  } = useRowDisclosure(detailOpen);

  return (
    <div data-testid={`ai-provider-${provider}`}>
      {/* 상태와 무관하게 **항상 같은 헤더 밴드**(`--control-row-h`). 상태별로
          다른 행을 그리면(구 구조) 펼침이 교체라서 전이할 대상이 없고, 이름 열도
          8px 씩 흔들린다. 하나의 밴드 + 그 아래 상세 영역으로 두면 이름은
          고정되고 아래만 자란다 — 접힌 행이 펼친 행으로 "변하는" 것이지 다른
          것으로 바뀌는 게 아니라는 사실이 움직임으로 읽힌다(치수 규칙성). */}
      <div className="flex h-[var(--control-row-h)] items-center justify-between gap-3 px-3">
        {/* 벤더 이름은 정체성이지 상태가 아니다 — 등록 여부와 무관하게 같은
            잉크로 그린다. 미등록이라는 사실은 뒤따르는 슬롯이 [키 등록] 버튼이냐
            끝 4자냐로 이미 오해 없이 말한다. 이름까지 어둡히면 같은 사실을 두 번
            부호화하면서, 이 화면의 1차 과업("내 벤더 찾기")만 어려워진다.
            이 목록이 패널의 시선 승자이므로 이름은 본문 크기 · 1차 잉크. */}
        <p className="text-body text-[color:var(--color-text-primary)]">{label}</p>
        {stored ? (
          // 상태어는 본문 서체, 마스킹된 끝 4자만 mono — 한 덩어리로 등폭
          // 처리하면 "등록됨" 뒤 공백이 벌어져 라벨과 값이 갈라져 보인다.
          // 저장 직후 이 조각이 페이드로 들어오는 것이 "저장됐다" 의 얼굴이다.
          <span
            key={status?.last4 ?? 'stored'}
            data-testid={`ai-stored-${provider}`}
            className="ai-row-swap flex items-baseline gap-1.5 text-caption text-[color:var(--color-text-tertiary)]"
          >
            {t('storedLabel')}
            <span className="font-mono">···· {status?.last4 ?? ''}</span>
          </span>
        ) : (
          <button
            type="button"
            data-testid={`ai-register-${provider}`}
            // `aria-expanded` 를 달았으면 다시 눌렀을 때 접혀야 한다 — 안 접히면
            // 스크린 리더에게 한 약속이 거짓말이 된다. 그래서 이 버튼도 [취소]·
            // Esc 와 **같은 경로**(`onCancel`)로 되돌린다.
            onClick={expanded ? onCancel : onExpand}
            aria-expanded={expanded}
            // 펼친 동안에도 사라지지 않고 **눌린 상태**로 남는다. 사라지면
            // 카드가 어디서 나왔는지 가리키는 것이 화면에서 없어져, 접힐 때
            // 돌아갈 자리도 같이 사라진다.
            className={cn(
              'inline-flex h-8 shrink-0 items-center rounded-md border px-2.5 text-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset',
              expanded
                ? 'border-[color:var(--color-indigo-line-a32)] bg-[color:var(--color-indigo-line-a13)] text-[color:var(--color-indigo-accent)]'
                : 'border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)] hover:border-[color:var(--color-indigo-line-a32)] hover:text-[color:var(--color-indigo-accent)]',
            )}
          >
            {t('keyRegister')}
          </button>
        )}
      </div>

      <div
        ref={detailBoxRef}
        className="ai-row-disclosure"
        data-state={detailOpen ? 'open' : 'closed'}
        data-testid={`ai-detail-${provider}`}
        // 접히는 동안(≈180ms)에도 DOM 에 남아 있으므로, 보이지 않는 입력칸이
        // 탭 순서와 스크린 리더에 남지 않게 즉시 비활성화한다 — 퇴장 모션의
        // 대가를 접근성으로 치르지 않는다.
        inert={!detailOpen}
      >
        {detailMounted ? (
          <div ref={detailContentRef} className="ai-row-disclosure-body px-3 pb-2.5">
            {/* 상태가 바뀌면 이 블록만 크로스페이드로 교체된다 — 높이는 바깥
                전이가 이어 주므로 둘이 한 동작으로 끝난다. */}
            <div key={stored ? 'stored' : 'draft'} className="ai-row-swap grid gap-2">
              {stored ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    data-testid={`ai-verify-${provider}`}
                    onClick={() => void handleVerify()}
                    disabled={verify.kind === 'checking' || !vaultRootPath}
                    className="inline-flex h-8 items-center rounded-md border border-[color:var(--color-indigo-line-a32)] px-2.5 text-label text-[color:var(--color-indigo-accent)] transition-colors hover:border-[color:var(--color-indigo-line-a45)] hover:bg-[color:var(--color-indigo-line-a13)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset disabled:opacity-60"
                  >
                    {verify.kind === 'checking' ? t('verifying') : t('verify')}
                  </button>
                  <button
                    type="button"
                    data-testid={`ai-clear-${provider}`}
                    onClick={() => void handleClear()}
                    className={cn(
                      'inline-flex h-8 items-center rounded-md border px-2.5 text-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset',
                      clearArmed
                        ? 'border-[color:var(--color-danger-a32)] text-[color:var(--color-status-danger)] hover:bg-[color:var(--color-danger-a10)]'
                        : 'border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)] hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-secondary)]',
                    )}
                  >
                    {clearArmed ? t('clearConfirm') : t('clear')}
                  </button>
                </div>
              ) : (
                // `key` 가 초안의 수명이다. 접히기 시작하는 커밋에 키가 바뀌어
                // 이 인스턴스가 언마운트되므로, 붙여넣던 값은 퇴장 모션을
                // 기다리지 않고 그 자리에서 사라진다 — 모션을 얻자고 "저장
                // 전까지만 화면에 있다" 를 "접힘이 끝날 때까지" 로 늘리지 않는다.
                <KeyDraftForm
                  key={expanded ? 'draft-open' : 'draft-closing'}
                  provider={provider}
                  label={label}
                  open={expanded}
                  onSaved={handleSaved}
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
          </div>
        ) : null}
      </div>
    </div>
  );
}

type LocalVerifyState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'done'; reason: LocalVerifyReason; models: string[]; detail: string };

/**
 * 네 번째 행 — **키가 아니라 주소를 적는 갈래** (Ollama · LM Studio ·
 * llama.cpp server · vLLM …).
 *
 * 위 세 행과 해부구조가 같다(헤더 밴드 + 상세 영역). 다른 것은 상세 영역에
 * 무엇이 들어가느냐뿐이다: 붙여넣는 키 대신 **주소 한 칸과 모델 하나**.
 *
 * ## 왜 모델을 손으로 타이핑하게 두지 않는가
 *
 * 러너의 모델 이름은 `qwen3:8b` 처럼 태그가 붙어 있어서 사람이 옮겨 적으면
 * 틀린다. 그리고 틀렸을 때 러너가 주는 답은 404 한 줄이라, 화면에는 "실패"
 * 밖에 안 남는다. 그래서 [연결 확인] 한 번이 목록까지 받아 오고, 고르는
 * 것은 목록에서만 한다 — 존재하지 않는 이름을 고를 방법 자체를 없앤다.
 *
 * ## 실패는 이유별로 다른 문장을 받는다
 *
 * 꺼져 있음 · 포트 다름 · 모델 없음이 구별되지 않으면 사용자는 셋 중 무엇을
 * 해야 하는지 모른다. 판정은 `readLocalVerdict` 한 곳에서 하고(상태 코드와
 * curl 종료 코드를 Rust 가 이미 갈라 놨다), 여기서는 그 판정에 문장을
 * 붙이기만 한다.
 */
function LocalEndpointCard({
  vaultRootPath,
  expanded,
  onExpand,
  onCancel,
  onCollapse,
  onVerified,
}: {
  vaultRootPath: string | null;
  expanded: boolean;
  onExpand: () => void;
  onCancel: () => void;
  onCollapse: () => void;
  onVerified: () => void;
}) {
  const t = useTranslations('settings.ai');
  const toast = useToast();
  const [settings, setSettings] = useState<LocalEndpointSettings>(() => readLocalEndpoint());
  const [draftUrl, setDraftUrl] = useState(() => readLocalEndpoint().baseUrl);
  const [verify, setVerify] = useState<LocalVerifyState>({ kind: 'idle' });

  const label = t(AI_PROVIDER_LABEL_KEY[LOCAL_PROVIDER]);
  const connected = isLocalEndpointReady(settings);
  const detailOpen = connected || expanded;
  const {
    mounted: detailMounted,
    boxRef: detailBoxRef,
    contentRef: detailContentRef,
  } = useRowDisclosure(detailOpen);

  /** 확인에 성공한 뒤 고를 수 있는 모델들. 저장하지 않는다 — 진실원은 러너다. */
  const models = verify.kind === 'done' ? verify.models : [];

  const handleVerify = async () => {
    if (!vaultRootPath || verify.kind === 'checking') return;
    setVerify({ kind: 'checking' });
    try {
      const result = await secretVerify(LOCAL_PROVIDER, vaultRootPath, draftUrl.trim());
      if (!result) return;
      const verdict = readLocalVerdict(result);
      setVerify({ kind: 'done', ...verdict });
      if (verdict.reason === 'ok') {
        // 주소는 응답한 그 순간 저장한다 — 모델을 아직 못 골랐어도 다음에
        // 다시 타이핑하게 만들지 않는다. 대화가 켜지는 조건은 여전히
        // "모델까지 골랐을 때" 다(`isLocalEndpointReady`).
        const model = verdict.models.includes(settings.model) ? settings.model : '';
        const next = { baseUrl: draftUrl.trim(), model };
        setSettings(next);
        writeLocalEndpoint(next);
      }
    } catch (err) {
      setVerify({
        kind: 'done',
        reason: 'failed',
        models: [],
        detail: secretErrorMessage(err),
      });
    } finally {
      // 성공이든 실패든 이 호출은 기록됐다 — 기록을 바로 보여준다.
      onVerified();
    }
  };

  const handlePickModel = (model: string) => {
    const next = { baseUrl: settings.baseUrl || draftUrl.trim(), model };
    setSettings(next);
    writeLocalEndpoint(next);
    if (model) {
      toast.show(t('localSaved'));
      onCollapse();
    }
  };

  const handleDisconnect = () => {
    clearLocalEndpoint();
    const cleared = readLocalEndpoint();
    setSettings(cleared);
    setDraftUrl(cleared.baseUrl);
    setVerify({ kind: 'idle' });
    toast.show(t('localDisconnected'));
  };

  const host = hostOfBaseUrl(settings.baseUrl || draftUrl);

  return (
    <div data-testid="ai-provider-local">
      <div className="flex h-[var(--control-row-h)] items-center justify-between gap-3 px-3">
        <p className="text-body text-[color:var(--color-text-primary)]">{label}</p>
        {connected ? (
          <span
            key={settings.model}
            data-testid="ai-local-connected"
            className="ai-row-swap flex min-w-0 items-baseline gap-1.5 text-caption text-[color:var(--color-text-tertiary)]"
          >
            {t('localConnected')}
            <span className="truncate font-mono">{settings.model}</span>
          </span>
        ) : (
          <button
            type="button"
            data-testid="ai-register-local"
            onClick={expanded ? onCancel : onExpand}
            aria-expanded={expanded}
            className={cn(
              'inline-flex h-8 shrink-0 items-center rounded-md border px-2.5 text-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset',
              expanded
                ? 'border-[color:var(--color-indigo-line-a32)] bg-[color:var(--color-indigo-line-a13)] text-[color:var(--color-indigo-accent)]'
                : 'border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)] hover:border-[color:var(--color-indigo-line-a32)] hover:text-[color:var(--color-indigo-accent)]',
            )}
          >
            {t('localConnect')}
          </button>
        )}
      </div>

      <div
        ref={detailBoxRef}
        className="ai-row-disclosure"
        data-state={detailOpen ? 'open' : 'closed'}
        data-testid="ai-detail-local"
        inert={!detailOpen}
      >
        {detailMounted ? (
          <div ref={detailContentRef} className="ai-row-disclosure-body grid gap-2 px-3 pb-2.5">
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                value={draftUrl}
                aria-label={t('localBaseUrlLabel')}
                placeholder={t('localBaseUrlPlaceholder')}
                data-testid="ai-local-url"
                onChange={(event) => setDraftUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void handleVerify();
                }}
                className="h-8 min-w-0 flex-1 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] px-2 font-mono text-caption text-[color:var(--color-text-primary)] transition-colors placeholder:font-sans placeholder:text-[color:var(--color-text-quaternary)] focus-visible:border-[color:var(--color-indigo-line-a45)] focus-visible:outline-none"
              />
              {!connected ? (
                <button
                  type="button"
                  data-testid="ai-cancel-local"
                  onClick={onCancel}
                  className="inline-flex h-8 shrink-0 items-center rounded-md border border-[color:var(--color-border-soft)] px-2.5 text-label text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset"
                >
                  {t('cancel')}
                </button>
              ) : null}
              <button
                type="button"
                data-testid="ai-verify-local"
                onClick={() => void handleVerify()}
                disabled={verify.kind === 'checking' || !vaultRootPath || !draftUrl.trim()}
                className="inline-flex h-8 shrink-0 items-center rounded-md border border-[color:var(--color-indigo-line-a32)] px-2.5 text-label text-[color:var(--color-indigo-accent)] transition-colors hover:border-[color:var(--color-indigo-line-a45)] hover:bg-[color:var(--color-indigo-line-a13)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset disabled:opacity-60"
              >
                {verify.kind === 'checking' ? t('verifying') : t('verify')}
              </button>
            </div>

            {/* 모델 칸은 **고를 것이 생겼을 때만** 나타난다. 빈 셀렉트를 미리
                그려 두면 "여기서 고르라" 는 지시가 고를 수 없는 상태에 걸린다. */}
            {models.length > 0 ? (
              <div className="flex items-center gap-2" data-testid="ai-local-model-row">
                <Select
                  size="md"
                  value={settings.model}
                  onChange={handlePickModel}
                  // 임베딩으로 판정된 행만 두 번째 줄을 받는다 — 이름만으로는
                  // `embeddinggemma:latest` 가 대화가 되는지 알 수 없고,
                  // 모르면 사람은 1번을 고른다(소유자가 실제로 그랬다).
                  // 지우지 않고 **적어 준다**: 지우면 화면이 사용자 기계에
                  // 있는 것을 없다고 말하게 된다.
                  options={models.map((model) => ({
                    value: model,
                    label: model,
                    description: isEmbeddingOnlyModel(model)
                      ? t('localModelEmbeddingOnly')
                      : undefined,
                  }))}
                  placeholder={t('localModelPlaceholder')}
                  ariaLabel={t('localModelLabel')}
                  className="min-w-0 flex-1"
                  data-testid="ai-local-model"
                />
                {connected ? (
                  <button
                    type="button"
                    data-testid="ai-local-disconnect"
                    onClick={handleDisconnect}
                    className="inline-flex h-8 shrink-0 items-center rounded-md border border-[color:var(--color-border-soft)] px-2.5 text-label text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset"
                  >
                    {t('localDisconnect')}
                  </button>
                ) : null}
              </div>
            ) : connected ? (
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-caption text-[color:var(--color-text-tertiary)]">
                  {settings.model}
                </span>
                <button
                  type="button"
                  data-testid="ai-local-disconnect"
                  onClick={handleDisconnect}
                  className="inline-flex h-8 shrink-0 items-center rounded-md border border-[color:var(--color-border-soft)] px-2.5 text-label text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset"
                >
                  {t('localDisconnect')}
                </button>
              </div>
            ) : null}

            <LocalCaption
              verify={verify}
              connected={connected}
              host={host}
              vaultKnown={vaultRootPath !== null}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * 이 행의 한 줄 — 상태마다 **다음에 할 일이 다르므로** 문장도 다르다.
 *
 * 로컬 갈래의 전송 범위 문구가 여기 산다. 루프백일 때와 아닐 때가 갈리는
 * 이유: "이 컴퓨터 밖으로 나가지 않아요" 는 `localhost` 에서만 참이고,
 * 사용자가 https 로 다른 기계를 가리킬 수도 있다(그것도 허용한다). 참이
 * 아닌 자리에 그 문장을 쓰면 이 제품의 신뢰 서사 자체가 거짓말이 된다.
 */
function LocalCaption({
  verify,
  connected,
  host,
  vaultKnown,
}: {
  verify: LocalVerifyState;
  connected: boolean;
  host: string;
  vaultKnown: boolean;
}) {
  const t = useTranslations('settings.ai');

  if (!vaultKnown) {
    return (
      <p className="break-keep text-caption leading-4 text-[color:var(--color-text-quaternary)]">
        {t('verifyNeedsVault')}
      </p>
    );
  }
  if (verify.kind === 'done' && verify.reason !== 'ok') {
    const message =
      verify.reason === 'unreachable'
        ? t('localFailUnreachable', { host })
        : verify.reason === 'not-compatible'
          ? t('localFailNotCompatible', { host })
          : verify.reason === 'no-models'
            ? t('localFailNoModels')
            : t('verifyFailed', { message: verify.detail });
    return (
      <p
        data-testid="ai-local-failure"
        className="flex items-start gap-1.5 break-keep text-caption leading-4 text-[color:var(--color-status-danger)]"
      >
        <StatusDot tone="danger" />
        {message}
      </p>
    );
  }
  if (verify.kind === 'done' && verify.reason === 'ok') {
    // 「설치된 모델 N개」만 말하면 그 N 이 전부 고를 만한 것처럼 읽힌다 —
    // 실측된 러너에서는 7개 중 4개가 임베딩 전용이었다. 임베딩이 하나도
    // 없으면 종전 문장 그대로다(없는 구분을 만들지 않는다).
    const chatCount = countChatCapableModels(verify.models);
    return (
      <p
        data-testid="ai-local-verified"
        className="flex items-center gap-1.5 break-keep text-caption leading-4 text-[color:var(--color-status-success)]"
      >
        <StatusDot tone="success" />
        {chatCount === verify.models.length
          ? t('localVerified', { count: verify.models.length })
          : t('localVerifiedWithEmbedding', {
              count: verify.models.length,
              chat: chatCount,
            })}
      </p>
    );
  }
  return (
    <p className="break-keep text-caption leading-4 text-[color:var(--color-text-quaternary)]">
      {connected
        ? isLoopbackHost(host)
          ? t('localScopeLoopback', { host })
          : t('localScopeRemote', { host })
        : t('localHint')}
    </p>
  );
}

/** 이 기계 자신인가 — Rust `is_loopback_authority` 와 같은 판정. */
function isLoopbackHost(authority: string): boolean {
  const host = authority.startsWith('[')
    ? (authority.slice(1).split(']')[0] ?? '')
    : (authority.split(':')[0] ?? '');
  return host === 'localhost' || host === '::1' || host.startsWith('127.');
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
 *
 * **퇴장 모션이 생겨도 그 계약은 늘어나지 않는다.** 접힘이 눈에 보이려면 접힌
 * 영역이 전이가 끝날 때까지(≈180ms) DOM 에 남아야 하는데, 그 김에 초안까지
 * 남으면 위 문장이 "행이 접히면" 에서 "접힘 애니메이션이 끝나면" 으로 슬며시
 * 늘어난다. 그래서 호출부가 `key` 를 펼침 상태에 묶어, 접히기 **시작하는
 * 커밋**에 이 인스턴스를 통째로 교체한다 — 여전히 "지우는 코드가 없고 남을
 * 자리가 없다". 모션을 얻자고 약속을 깎지 않는다.
 *
 * **입력한 내용이 있어도 확인창을 띄우지 않는다.** ① 잃는 것이 클립보드/벤더
 * 콘솔에서 다시 붙여넣으면 되는 값이고, ② 모달 위의 모달은 이 저장소가
 * 금지하는 스택 형태이며, ③ 이 카드의 확인 예산은 이미 [지우기] 2단 확정이
 * 쓰고 있다 — 되돌릴 수 있는 일과 없는 일에 같은 마찰을 물리면 진짜 경고가
 * 값싸진다.
 */
function KeyDraftForm({
  provider,
  label,
  open,
  onSaved,
  onCancel,
  onError,
}: {
  provider: SecretProvider;
  label: string;
  /** 이 행이 아직 펼쳐져 있나 — false 면 접히는 중(퇴장 전이). */
  open: boolean;
  onSaved: (next: SecretStatus) => void;
  onCancel: () => void;
  onError: (message: string | null) => void;
}) {
  const t = useTranslations('settings.ai');
  const [draftKey, setDraftKey] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    // 사용자가 방금 [키 등록]을 눌러 이 칸을 연 참이다 — 한 번 더 클릭하게
    // 만들지 않는다. `autoFocus` 대신 명시 호출인 이유는 `preventScroll`:
    // 마운트 시점의 컨테이너 높이는 0(전이 시작점)이라 브라우저가 스크롤로
    // 보정하려 들면 패널이 튄다.
    inputRef.current?.focus({ preventScroll: true });
  }, [open]);

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
        ref={inputRef}
        type="password"
        autoComplete="off"
        spellCheck={false}
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
