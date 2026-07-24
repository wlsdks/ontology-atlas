'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  HardDrive,
  Settings,
  X,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { LocaleSwitch } from '@/features/locale-switch';
import { useLocalVault } from '@/features/docs-vault-local';
import { isTauriVaultRuntime } from '@/shared/lib/tauri-vault-fs';
import { summarizeVaultValidation } from '@/shared/lib/validate-vault-document';
import { useCopyFeedback } from '@/shared/lib/use-copy-feedback';
import { cn } from '@/shared/lib/cn';
import { VaultAgentSetupPanel } from './VaultAgentSetupPanel';

/**
 * 단일 설정 표면 (설정 통합 2026-07-24, 소유자 지시) — 이전엔 설정이 두 곳에
 * 흩어져 있었다: ① 나브레일 톱니의 "지도 설정" 팝오버(TopologyV2SettingsGear —
 * 언어·보기 모드·INDEX 기본 상태·vault 바꾸기), ② 각 페이지 헤더 "설정" 필의
 * 5탭 "앱 설정" 모달(3탭이 사실상 링크 한 줄 + 거대한 빈 여백). 이 위젯이
 * 이제 유일한 설정의 집이다: 탭 폐지, 단일 컬럼 시트, "그룹 헤더 + 즉시 조작
 * 행" 문법(Toss 공개 발표 — 한 화면에 한 가지, 위계의 단순화).
 *
 * - [화면] 언어 · (호스트 주입 시) 보기 모드 · INDEX 기본 상태. 지도 화면
 *   상태(HomePage state)는 `screenControls` optional prop 으로 주입 — 미주입
 *   페이지(빌더 등)에서는 해당 행이 렌더되지 않는다.
 * - [작업공간] 현재 vault 이름/상태 1행 + 폴더 열기/바꾸기 + 문서함 링크.
 *   구 vault 탭의 LocalVaultPicker 전체 표면(Finder 열기·경로 복사·새로고침)은
 *   /docs vault 필이 담당 — 여기는 상태 확인과 교체라는 고빈도 경로만.
 * - [AI 에이전트] 상태 요약 1행 → "연결·검증" 드릴인 서브뷰(뒤로가기 헤더)로
 *   `VaultAgentSetupPanel` 이동. MCP 증명 장문·상태 카드 그리드·판정 순서
 *   문서는 기본 화면에 절대 노출하지 않는다.
 *
 * P3 결함⑥ 계약 유지 — `open`/`onOpenChange` optional controlled prop, ⌘K 는
 * 팔레트에 양보(settings demote), Escape 는 이 다이얼로그가 소유하고
 * stopPropagation 으로 지도 Esc 래더에 새지 않는다.
 */

type SettingsView = 'root' | 'agent';
type SettingsTriggerVariant = 'header-pill' | 'rail-tile' | 'chrome-tile';

const SETTINGS_LOCALE_FOCUS_KEY = 'ontology-atlas:settings-locale-focus';
const SETTINGS_LOCALE_FOCUS_MAX_AGE_MS = 10_000;

interface SettingsLocaleFocusIntent {
  locale: string;
  triggerVariant: SettingsTriggerVariant;
  createdAt: number;
}

function rememberSettingsLocaleFocus(
  locale: string,
  triggerVariant: SettingsTriggerVariant,
) {
  try {
    const intent: SettingsLocaleFocusIntent = {
      locale,
      triggerVariant,
      createdAt: Date.now(),
    };
    window.sessionStorage.setItem(SETTINGS_LOCALE_FOCUS_KEY, JSON.stringify(intent));
  } catch {
    // sessionStorage unavailable — navigation still proceeds without restoration.
  }
}

function consumeSettingsLocaleFocus(
  locale: string,
  triggerVariant: SettingsTriggerVariant,
): boolean {
  try {
    const raw = window.sessionStorage.getItem(SETTINGS_LOCALE_FOCUS_KEY);
    if (!raw) return false;
    const intent = JSON.parse(raw) as Partial<SettingsLocaleFocusIntent>;
    const age = Date.now() - Number(intent.createdAt);
    if (!Number.isFinite(age) || age < 0 || age > SETTINGS_LOCALE_FOCUS_MAX_AGE_MS) {
      window.sessionStorage.removeItem(SETTINGS_LOCALE_FOCUS_KEY);
      return false;
    }
    if (intent.locale !== locale || intent.triggerVariant !== triggerVariant) return false;
    window.sessionStorage.removeItem(SETTINGS_LOCALE_FOCUS_KEY);
    return true;
  } catch {
    try {
      window.sessionStorage.removeItem(SETTINGS_LOCALE_FOCUS_KEY);
    } catch {
      // sessionStorage unavailable — leave no in-memory focus contract behind.
    }
    return false;
  }
}

export interface AppSettingsScreenControls {
  audiencePlain: boolean;
  onAudiencePlainChange: (next: boolean) => void;
  indexCollapsed: boolean;
  onIndexCollapsedChange: (next: boolean) => void;
}

export interface AppSettingsMenuProps {
  mode: 'static' | 'local';
  /** controlled open state. 미지정 시 self-managed(기존 동작). */
  open?: boolean;
  /** controlled 모드에서 open 이 바뀔 때마다 호출 — 호출자가 실제 state 를 갱신한다. */
  onOpenChange?: (next: boolean) => void;
  /**
   * 지도(HomePage) 전용 화면 상태 주입 — 보기 모드(개발/일반)와 INDEX 기본
   * 상태. 주입한 페이지에서만 [화면] 그룹에 해당 행이 나타난다.
   */
  screenControls?: AppSettingsScreenControls;
  /**
   * 트리거 표면 계약. `header-pill`(기본) = 페이지 헤더의 "설정" 필.
   * `rail-tile` = 나브레일 하단 유틸 타일(활동·발자취와 같은
   * `--app-nav-rail-tile-*` 지오메트리). `chrome-tile` = <lg 상단 유틸리티
   * 레인의 `--chrome-tile-size` 타일. 구 TopologyV2SettingsGear 의 트리거
   * 문법을 그대로 승계한다 — 팝오버 대신 이 시트가 열리는 것만 다르다.
   */
  triggerVariant?: SettingsTriggerVariant;
}

/** AI 에이전트 첫 접촉 증명 패킷 — 사람이 읽는 카드 대신 에이전트에 그대로
 *  붙여넣는 typed handoff. 구 5탭 시절 mcpAgents 탭의 정적 교육 카드 그리드가
 *  하던 말이 전부 이 패킷 안에 있다(표면은 죽고 handoff 는 산다). */
const MCP_FIRST_CALLS_PACKET = [
  'Ontology Atlas MCP first-contact proof packet',
  '',
  'Direct MCP proof inside the current agent session:',
  '1. codex mcp list',
  '2. tools/list -> 24 tools including index_project and query_ontology',
  '3. query_ontology({"operation":"agent_brief"})',
  '4. query_ontology({"operation":"workspace_brief"})',
  '5. query_ontology({"operation":"health"})',
  '',
  'If direct MCP tools are missing, this is CLI fallback proof only:',
  'pnpm cli:mcp-verify docs/ontology --timeout-ms 15000',
  '',
  'Stale client cache hint:',
  'If the client still says 23 tools or query_ontology is not callable, reload/restart the agent or refresh cached MCP tools.',
  '',
  'Project ontology indexing checkpoint (side effect 0):',
  'Replace [codebase-root] with the current checkout path before running project indexing.',
  'index_project({"rootPath":"[codebase-root]"})',
  'node cli/src/index.mjs index [codebase-root] --vault docs/ontology --json --threshold 2',
  '',
  'Meaning gate: report the business/product domain and capability first, then cite code index rows as implementation evidence.',
  'Business evidence: include meaningGate.businessOntology.evidence rows from README and docs/ontology.',
  'Review queue: include meaningGate.implementationEvidence.reviewRequiredRows so humans can name folders that still lack product meaning.',
  'Do not promote source folders to capabilities when existing ontology evidence maps them through matching slugs or capability elements.',
].join('\n');

export function AppSettingsMenu({
  mode,
  open: openProp,
  onOpenChange,
  screenControls,
  triggerVariant = 'header-pill',
}: AppSettingsMenuProps) {
  const t = useTranslations('nav.settingsMenu');
  const locale = useLocale();
  const { state: copyState, copy } = useCopyFeedback();
  const router = useRouter();
  const localVault = useLocalVault();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (isControlled) onOpenChange?.(next);
      else setInternalOpen(next);
    },
    [isControlled, onOpenChange],
  );
  const [view, setView] = useState<SettingsView>('root');
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const isDesktopRuntime = isTauriVaultRuntime();

  const isLocalVaultLoaded = localVault.status === 'loaded';
  const showVaultManagement = localVault.status !== 'unsupported';
  const vaultBusy = localVault.status === 'opening' || localVault.status === 'loading';
  const localVaultValidationSummary = (() => {
    if (localVault.status !== 'loaded' || !localVault.manifest) return null;
    const summary = summarizeVaultValidation(
      localVault.manifest.docs.map((doc) => ({
        slug: doc.slug,
        frontmatter: doc.frontmatter,
      })),
    );
    if (summary.errorCount === 0 && summary.warningCount === 0) return null;
    return { errorCount: summary.errorCount, warningCount: summary.warningCount };
  })();

  // AGENT-GRAPH-WORKFLOW 가이드는 문서함(/docs) 안 드로어라 설정 메뉴에서
  // 직접 열 수 없다 — 설정을 닫고 문서함으로 이동해 사용자가 이어서 연다.
  const handleOpenWorkflowGuide = () => {
    setOpen(false);
    router.push('/docs/');
  };
  const vaultHref =
    mode === 'local' ? '/docs/' : isDesktopRuntime ? '/docs/?intent=local' : '/download/';
  const vaultBody = mode === 'local' ? t('vaultBodyLocal') : t('vaultBodyStatic');
  const vaultCta = mode === 'local' ? t('vaultCtaLocal') : t('vaultCtaStatic');

  // AI 에이전트 요약 1행 — 설정 파일 준비 상태를 한 값으로 접는다. 상세
  // (파일별 상태·수리·복사 패킷·검증 게이트)는 드릴인 서브뷰가 소유.
  const agentConfig = localVault.agentConfigStatus;
  const agentConfigTotal = 3;
  const agentConfigReadyCount = agentConfig
    ? [
        agentConfig.mcpJson && agentConfig.mcpJsonValid !== false,
        agentConfig.codexConfig && agentConfig.codexConfigValid !== false,
        agentConfig.mcpExample && agentConfig.mcpExampleValid !== false,
      ].filter(Boolean).length
    : 0;
  const agentSummary =
    isLocalVaultLoaded && agentConfig
      ? agentConfigReadyCount === agentConfigTotal
        ? t('agentStatusReady', { ready: agentConfigReadyCount, total: agentConfigTotal })
        : t('agentStatusRepair', { ready: agentConfigReadyCount, total: agentConfigTotal })
      : t('agentStatusNoVault');
  const agentSummaryNeedsAttention =
    isLocalVaultLoaded && agentConfig != null && agentConfigReadyCount < agentConfigTotal;

  // P3 결함⑥ — controlled 모드에서 이 `<details>` 는 React state 가 곧
  // 진실원이어야 한다. 매 렌더마다 DOM `open` 을 React 값으로 되맞춰 race 를
  // 구조적으로 없앤다 (uncontrolled 모드에서도 같은 값이면 no-op).
  useEffect(() => {
    if (detailsRef.current) detailsRef.current.open = open;
  }, [open]);

  // 닫힐 때 드릴인 상태 초기화 — 다시 열면 항상 루트 시트부터. effect 가 아닌
  // 렌더 중 이전값 latch(React 공식 "adjusting state when a prop changes"
  // 패턴)라 cascading effect 렌더가 없다 (구 설정 기어의 suppressed 처리와
  // 같은 관례).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) setView('root');
  }

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      panelRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!consumeSettingsLocaleFocus(locale, triggerVariant)) return undefined;
    const timer = window.setTimeout(() => {
      triggerRef.current?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [locale, triggerVariant]);

  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (event: MouseEvent) => {
      const details = detailsRef.current;
      const overlay = overlayRef.current;
      const target = event.target as Node;
      // 오버레이는 portal(body 직속)이라 details.contains 만으로는 시트 내부
      // 클릭을 "바깥"으로 오판한다 — 둘 다 검사.
      if (details?.contains(target) || overlay?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open, setOpen]);

  const closePanel = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) {
      window.setTimeout(() => triggerRef.current?.focus(), 0);
    }
  };

  return (
    <details
      ref={detailsRef}
      open={open}
      className="group relative shrink-0"
      onKeyDown={(event) => {
        // Guardian B2 — transient 상호배제: ⌘K(팔레트)가 열리면 설정은
        // demote (동시 스택 금지, design.md popup-soup 계약). 포커스 반환
        // 없이 닫아 팔레트가 포커스를 가져가게 한다.
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
          closePanel(false);
          return;
        }
        if (event.key !== 'Escape') return;
        event.preventDefault();
        // 지도 Esc 래더(window keydown)가 같은 keypress 에 이중으로 반응하지
        // 않도록 이 다이얼로그가 Escape 를 소유한다 — "one overlay owns one
        // Escape" (구 설정 기어와 같은 계약).
        event.stopPropagation();
        if (view === 'agent') {
          setView('root');
          return;
        }
        closePanel();
      }}
    >
      <summary
        ref={triggerRef}
        aria-label={t('triggerAria')}
        aria-expanded={open}
        title={t('triggerTitle')}
        data-testid="app-settings-trigger"
        data-trigger-variant={triggerVariant}
        onClick={(event) => {
          event.preventDefault();
          setOpen(!open);
        }}
        className={cn(
          'cursor-pointer list-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset [&::-webkit-details-marker]:hidden',
          triggerVariant === 'rail-tile'
            ? // 나브레일 유틸리티 타일 계약 — 활동(AppNavRail)·발자취
              // (GitStatusTile)와 같은 지오메트리·상태 안무.
              'flex h-[var(--app-nav-rail-tile-height)] w-[var(--app-nav-rail-tile-width)] items-center justify-center rounded-card text-[color:var(--color-text-tertiary)] transition-[color,background-color,transform] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] active:translate-y-px active:bg-[color:var(--color-overlay-3)]'
            : triggerVariant === 'chrome-tile'
              ? // <lg 상단 유틸리티 레인의 ChromeTile 계약 — 같은 행 타일들과
                // 높이·radius·표면 일치.
                'flex size-[var(--chrome-tile-size)] items-center justify-center rounded-[var(--chrome-radius)] border border-[color:var(--chrome-border)] bg-[color:var(--chrome-surface)] text-[color:var(--color-text-tertiary)] shadow-[var(--chrome-shadow)] hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]'
              : 'inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] px-2 text-[color:var(--color-text-tertiary)] hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]',
        )}
      >
        <Settings
          size={triggerVariant === 'header-pill' ? 14 : undefined}
          aria-hidden
          className={
            triggerVariant === 'rail-tile'
              ? 'h-[var(--app-nav-rail-utility-icon-size)] w-[var(--app-nav-rail-utility-icon-size)]'
              : triggerVariant === 'chrome-tile'
                ? 'size-[var(--topology-chrome-icon-size)]'
                : undefined
          }
        />
        {triggerVariant === 'header-pill' ? (
          <span className="hidden font-mono text-caption uppercase tracking-[0.08em] sm:inline">
            {t('settingsLabel')}
          </span>
        ) : null}
      </summary>
      {open && typeof document !== 'undefined'
        ? createPortal(
      <div
        ref={overlayRef}
        // portal(body 직속) — 트리거가 어느 크롬 컨테이너(나브레일·상단
        // 유틸 레인·페이지 헤더)에 앉아 있어도 그 컨테이너의 stacking
        // context 에 z-40 오버레이가 갇히지 않는다(<lg 크롬 레인에서 INDEX
        // 패널이 시트 위에 그려지던 결함의 구조적 처방). 조건부 렌더라 구
        // `hidden`+`group-open:flex` display 묶기(overflow-sweep 회귀 방지)도
        // 필요 없어졌다. scrim: 모달은 지도/페이지를 dim + block 해야
        // 한다(design.md modality 계약) — `--color-scrim-a54` 단일 토큰.
        className="fixed inset-0 z-40 flex items-center justify-center overflow-hidden bg-[color:var(--color-scrim-a54)] p-3 sm:p-6"
        data-testid="app-settings-overlay"
        onMouseDown={(event) => {
          if (event.target !== event.currentTarget) return;
          closePanel();
        }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-[34rem] flex-col overflow-hidden rounded-xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] text-body shadow-[0_28px_90px_var(--color-shadow-a58)] sm:max-h-[min(46rem,calc(100dvh-3rem))]"
          data-testid="app-settings-popover"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--color-border-soft)] px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              {view === 'agent' ? (
                <button
                  type="button"
                  aria-label={t('agentBackLabel')}
                  data-testid="app-settings-agent-back"
                  onClick={() => setView('root')}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset"
                >
                  <ChevronLeft size={14} aria-hidden />
                </button>
              ) : (
                <Settings
                  size={15}
                  aria-hidden
                  className="shrink-0 text-[color:var(--color-indigo-accent)]"
                />
              )}
              <h2
                id={titleId}
                className="truncate text-body-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
              >
                {view === 'agent' ? t('agentTitle') : t('title')}
              </h2>
            </div>
            <button
              type="button"
              aria-label={t('closeLabel')}
              onClick={() => closePanel()}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset"
            >
              <X size={13} aria-hidden />
            </button>
          </div>

          {view === 'agent' ? (
            <div
              className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto p-4"
              data-testid="app-settings-agent-view"
            >
              {isLocalVaultLoaded ? (
                <VaultAgentSetupPanel
                  canEditCurrent={isLocalVaultLoaded}
                  localVault={localVault}
                  validationSummary={localVaultValidationSummary}
                  onOpenWorkflowGuide={handleOpenWorkflowGuide}
                />
              ) : (
                <>
                  <div className="rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2.5">
                    <p className="text-label font-medium text-[color:var(--color-text-secondary)]">
                      {t('agentStatusNoVault')}
                    </p>
                    <p className="mt-1 break-keep text-caption leading-4 text-[color:var(--color-text-tertiary)]">
                      {t('agentNoVaultHint')}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2.5">
                    <p className="text-label font-medium text-[color:var(--color-text-secondary)]">
                      {t('mcpProofTitle')}
                    </p>
                    <p className="mt-1 break-keep text-caption leading-4 text-[color:var(--color-text-tertiary)]">
                      {t('mcpProofBody')}
                    </p>
                    <button
                      type="button"
                      onClick={() => void copy(MCP_FIRST_CALLS_PACKET)}
                      className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-indigo-line-a32)] px-2 font-mono text-caption text-[color:var(--color-indigo-accent)] transition-colors hover:border-[color:var(--color-indigo-line-a45)] hover:bg-[color:var(--color-indigo-line-a13)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset"
                    >
                      {copyState === 'copied' ? (
                        <Check size={12} aria-hidden />
                      ) : (
                        <Copy size={12} aria-hidden />
                      )}
                      {copyState === 'copied' ? t('mcpProofCopied') : t('mcpProofCopy')}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div
              className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-4"
              data-testid="app-settings-body"
            >
              <SettingsGroup label={t('groupScreen')}>
                <SettingsRow
                  label={t('languageTitle')}
                  control={
                    <LocaleSwitch
                      onSwitchStart={(nextLocale) =>
                        rememberSettingsLocaleFocus(nextLocale, triggerVariant)
                      }
                    />
                  }
                />
                {screenControls ? (
                  <>
                    <SettingsRow
                      label={t('viewModeLabel')}
                      caption={t('viewModeCaption')}
                      control={
                        <SegmentSwitch
                          ariaLabel={t('viewModeLabel')}
                          testId="app-settings-view-mode"
                          value={screenControls.audiencePlain}
                          onChange={screenControls.onAudiencePlainChange}
                          options={[
                            { value: false, label: t('viewModeDev') },
                            { value: true, label: t('viewModePlain') },
                          ]}
                        />
                      }
                    />
                    <SettingsRow
                      label={t('indexDefaultLabel')}
                      control={
                        <SegmentSwitch
                          ariaLabel={t('indexDefaultLabel')}
                          testId="app-settings-index-default"
                          value={screenControls.indexCollapsed}
                          onChange={screenControls.onIndexCollapsedChange}
                          options={[
                            { value: false, label: t('indexDefaultExpanded') },
                            { value: true, label: t('indexDefaultCollapsed') },
                          ]}
                        />
                      }
                    />
                  </>
                ) : null}
              </SettingsGroup>

              <SettingsGroup label={t('groupWorkspace')}>
                {showVaultManagement ? (
                  <SettingsRow
                    testId="app-settings-workspace-folder"
                    label={t('workspaceFolderLabel')}
                    caption={
                      localVault.status === 'error'
                        ? (localVault.errorMessage ?? t('workspaceFolderErrorFallback'))
                        : localVault.status === 'permission-needed'
                          ? t('workspaceFolderPermissionCaption')
                          : isLocalVaultLoaded
                            ? localVaultValidationSummary
                              ? t('workspaceFolderDocCountIssues', {
                                  count: localVault.manifest?.docs.length ?? 0,
                                  errors: localVaultValidationSummary.errorCount,
                                  warnings: localVaultValidationSummary.warningCount,
                                })
                              : t('workspaceFolderDocCount', {
                                  count: localVault.manifest?.docs.length ?? 0,
                                })
                            : undefined
                    }
                    captionTone={
                      localVault.status === 'error'
                        ? 'danger'
                        : localVault.status === 'permission-needed'
                          ? 'warning'
                          : 'neutral'
                    }
                    control={
                      <>
                        <span
                          className={cn(
                            'max-w-[10rem] truncate text-label',
                            isLocalVaultLoaded
                              ? 'text-[color:var(--color-text-primary)]'
                              : 'text-[color:var(--color-text-quaternary)]',
                          )}
                        >
                          {isLocalVaultLoaded && localVault.handle
                            ? localVault.handle.name
                            : localVault.status === 'permission-needed'
                              ? (localVault.handle?.name ?? t('workspaceFolderEmpty'))
                              : t('workspaceFolderEmpty')}
                        </span>
                        {localVault.status === 'permission-needed' ? (
                          <button
                            type="button"
                            onClick={() => localVault.requestPermission()}
                            className="inline-flex h-8 shrink-0 items-center rounded-md border border-[color:var(--color-amber-source-a35)] px-2.5 text-label text-[color:var(--color-status-warning)] transition-colors hover:bg-[color:var(--color-amber-source-a12)]"
                          >
                            {t('workspaceFolderPermissionAction')}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void localVault.open()}
                            disabled={vaultBusy}
                            data-testid="app-settings-open-folder"
                            className="inline-flex h-8 shrink-0 items-center rounded-md border border-[color:var(--color-indigo-line-a32)] px-2.5 text-label text-[color:var(--color-indigo-accent)] transition-colors hover:border-[color:var(--color-indigo-line-a45)] hover:bg-[color:var(--color-indigo-line-a13)] disabled:opacity-60"
                          >
                            {vaultBusy
                              ? t('workspaceFolderOpening')
                              : isLocalVaultLoaded || localVault.status === 'error'
                                ? t('workspaceFolderChange')
                                : t('workspaceFolderOpen')}
                          </button>
                        )}
                      </>
                    }
                  />
                ) : null}
                {/* 최근 작업공간 — vault 가 안 열려 있을 때만(복구 경로).
                    로드 중엔 "바꾸기"(OS 픽커)가 고빈도 경로다. */}
                {showVaultManagement &&
                !isLocalVaultLoaded &&
                localVault.recentVaults.length > 0
                  ? localVault.recentVaults.map((record) => (
                      <div
                        key={record.desktopRootPath ?? `${record.id}:${record.name}`}
                        className="flex min-h-11 items-center gap-2 px-3 py-1.5"
                        data-testid="app-settings-recent-vault"
                      >
                        <button
                          type="button"
                          onClick={() => void localVault.openRecent(record)}
                          disabled={vaultBusy}
                          aria-label={t('workspaceRecentOpenAria', { name: record.name })}
                          title={record.desktopRootPath ?? record.name}
                          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-[color:var(--color-overlay-2)] disabled:opacity-60"
                        >
                          <HardDrive
                            size={12}
                            aria-hidden
                            className="shrink-0 text-[color:var(--color-indigo-accent)]"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-label text-[color:var(--color-text-secondary)]">
                              {record.name}
                            </span>
                            {record.desktopRootPath ? (
                              <span className="block truncate font-mono text-caption text-[color:var(--color-text-quaternary)]">
                                {record.desktopRootPath}
                              </span>
                            ) : null}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void localVault.forgetRecent(record)}
                          aria-label={t('workspaceRecentForgetAria', { name: record.name })}
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-[color:var(--color-text-quaternary)] transition-colors hover:bg-[color:var(--color-danger-a10)] hover:text-[color:var(--color-status-danger)]"
                        >
                          <X size={12} aria-hidden />
                        </button>
                      </div>
                    ))
                  : null}
                <Link
                  href={vaultHref}
                  className="flex min-h-12 items-center justify-between gap-3 px-3 py-2 transition-colors hover:bg-[color:var(--color-overlay-2)]"
                >
                  <span className="min-w-0">
                    <span className="block text-label text-[color:var(--color-text-secondary)]">
                      {t('vaultTitle')}
                    </span>
                    <span className="mt-0.5 block break-keep text-caption leading-4 text-[color:var(--color-text-quaternary)]">
                      {vaultBody}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-label text-[color:var(--color-indigo-accent)]">
                    {vaultCta}
                    <ChevronRight size={13} aria-hidden className="text-[color:var(--color-text-quaternary)]" />
                  </span>
                </Link>
              </SettingsGroup>

              <SettingsGroup label={t('groupAgent')}>
                <button
                  type="button"
                  data-testid="app-settings-agent-drillin"
                  onClick={() => setView('agent')}
                  className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-[color:var(--color-overlay-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset"
                >
                  <span className="min-w-0">
                    <span className="block text-label text-[color:var(--color-text-secondary)]">
                      {t('agentTitle')}
                    </span>
                    <span className="mt-0.5 block break-keep text-caption leading-4 text-[color:var(--color-text-quaternary)]">
                      {t('agentBody')}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <span
                      className={cn(
                        'text-label',
                        agentSummaryNeedsAttention
                          ? 'text-[color:var(--color-status-warning)]'
                          : 'text-[color:var(--color-text-tertiary)]',
                      )}
                      data-testid="app-settings-agent-summary"
                    >
                      {agentSummary}
                    </span>
                    <ChevronRight size={13} aria-hidden className="text-[color:var(--color-text-quaternary)]" />
                  </span>
                </button>
              </SettingsGroup>
            </div>
          )}
        </div>
      </div>,
          document.body,
        )
        : null}
    </details>
  );
}

/** 그룹 헤더 + 행 컨테이너 — Toss 식 "그룹 헤더 + 즉시 조작 행" 문법의 뼈대. */
function SettingsGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label}>
      <h3 className="px-1 font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
        {label}
      </h3>
      <div className="mt-1.5 divide-y divide-[color:var(--color-divider)] overflow-hidden rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]">
        {children}
      </div>
    </section>
  );
}

/** 한 행 = 라벨(+필요시 1줄 설명) 좌측, 현재값+조작 우측. */
function SettingsRow({
  label,
  caption,
  captionTone = 'neutral',
  control,
  testId,
}: {
  label: string;
  caption?: string;
  captionTone?: 'neutral' | 'warning' | 'danger';
  control: ReactNode;
  testId?: string;
}) {
  return (
    <div
      className="flex min-h-12 items-center justify-between gap-3 px-3 py-2"
      data-testid={testId}
    >
      <div className="min-w-0">
        <p className="text-label text-[color:var(--color-text-secondary)]">{label}</p>
        {caption ? (
          <p
            className={cn(
              'mt-0.5 break-keep text-caption leading-4',
              captionTone === 'danger'
                ? 'text-[color:var(--color-status-danger)]'
                : captionTone === 'warning'
                  ? 'text-[color:var(--color-status-warning)]'
                  : 'text-[color:var(--color-text-quaternary)]',
            )}
          >
            {caption}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{control}</div>
    </div>
  );
}

/** 2-세그먼트 토글 — LocaleSwitch 와 같은 표면 문법(구 설정 기어에서 승계). */
function SegmentSwitch({
  ariaLabel,
  value,
  options,
  onChange,
  testId,
}: {
  ariaLabel: string;
  value: boolean;
  options: ReadonlyArray<{ value: boolean; label: string }>;
  onChange: (next: boolean) => void;
  testId?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-testid={testId}
      className="inline-flex items-center gap-px rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-px text-label"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={cn(
              'flex h-8 items-center justify-center rounded-chip px-2 font-medium transition-colors',
              active
                ? 'bg-[color:var(--color-panel)] text-[color:var(--color-text-primary)]'
                : 'text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-secondary)]',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
