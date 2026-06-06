'use client';

import { Link, usePathname } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { Bot, Check, Copy, FolderOpen, Languages, Palette, Settings, Terminal, X } from 'lucide-react';
import { useDataSourceMode } from '@/features/data-source-mode';
import { useLocalVault } from '@/features/docs-vault-local';
import { ThemeToggle } from '@/features/theme-toggle';
import { LocaleSwitch } from '@/features/locale-switch';
import { LiveActivityIndicator } from '@/features/vault-ontology';
import { Tooltip } from '@/shared/ui';
import { isTauriVaultRuntime } from '@/shared/lib/tauri-vault-fs';
import { useCopyFeedback } from '@/shared/lib/use-copy-feedback';
import { OntologySubNav, shouldShowOntologySubNav } from '@/widgets/ontology-sub-nav';
import { isOperationsTabActive } from '../lib/is-tab-active';

interface NavItem {
  id: 'docs' | 'ontology' | 'topology';
  /** Translation key under `nav.*` for the visible label. */
  labelKey: 'docs' | 'ontology' | 'topology';
  /** Translation key under `nav.*` for the tooltip body. */
  tooltipKey: 'tooltipDocs' | 'tooltipOntology' | 'tooltipTopology';
  basePath: string;
  /** Current pathname starts with this prefix → active. */
  prefixes: ReadonlyArray<string>;
}

type SettingsMenuTab = 'general' | 'mcpAgents' | 'vault' | 'appearance' | 'verification';

// 진입점 3개 — docs (vault picker / editor), ontology (frontmatter
// 트리·ego graph), topology (Sigma WebGL). vault 미선택 사용자도 모두 OK.
const NAV_ITEMS: ReadonlyArray<NavItem> = [
  {
    id: 'docs',
    labelKey: 'docs',
    tooltipKey: 'tooltipDocs',
    basePath: '/docs/',
    prefixes: ['/docs'],
  },
  {
    id: 'ontology',
    labelKey: 'ontology',
    tooltipKey: 'tooltipOntology',
    // `/` 와 `/ontology` 둘 다 OntologyViewPage 를 렌더하지만, 명시 탭은
    // `/ontology/` 로 보내 루트 랜딩/복원 분기 플래시를 피한다. 활성
    // 매칭에는 `/` exact-match 를 남겨 사용자가 `/` 에 있을 때도 ontology
    // 탭이 highlight 된다.
    basePath: '/ontology/',
    prefixes: ['/', '/ontology'],
  },
  {
    id: 'topology',
    labelKey: 'topology',
    tooltipKey: 'tooltipTopology',
    basePath: '/topology/',
    prefixes: ['/topology'],
  },
];

/**
 * 운영 surface (/docs, /ontology*, /topology) 공통 상단 nav. 페이지 별
 * nav 에 메뉴를 묻으면 sub-surface 사이 점프가 끊겨 일관성 잃는다.
 *
 * 데스크톱 (md+): 탭 + 우측 보조 (ModeBadge · LocaleSwitch · ThemeToggle · Projects).
 * 모바일 (<md): 탭만 horizontal scroll chip row 로 노출 (NAV_ITEMS 3개가
 *   375 폭 안에 자연스럽게 흐름). 보조 버튼은 BottomTabBar 가 대체. iOS /
 *   Android 음원·뱅킹 앱에서 흔한 sub-tab.
 *
 * 활성 표시는 pathname prefix 매칭.
 */
/**
 * Mode badge — 사용자가 *데이터가 어디에 가는지* 한눈에 인지.
 * - local 모드: vault 폴더 이름 + doc count chip
 * - static 모드 (vault 미선택): "데모" / "Demo" chip
 */
function ModeBadge({
  mode,
  density = 'full',
}: {
  mode: 'static' | 'local';
  density?: 'full' | 'compact';
}) {
  // local 모드일 때만 vault 메타 가져오기. static 은 그냥 chip.
  // useLocalVault 자체는 SSR-safe (window 가드).
  const vault = useLocalVault();
  const t = useTranslations('modeBadge');
  const isDesktopRuntime = isTauriVaultRuntime();
  const demoHref = isDesktopRuntime ? '/docs/?intent=local' : '/download/';
  const demoTooltip = isDesktopRuntime
    ? t('demoTooltipPicker')
    : t('demoTooltipDownload');
  const demoAriaLabel = isDesktopRuntime
    ? t('demoAriaLabelPicker')
    : t('demoAriaLabelDownload');
  if (mode === 'local') {
    const docCount = vault.manifest?.docs.length ?? 0;
    const handleName = vault.handle?.name ?? 'vault';
    const tooltip = t('vaultTooltip', { name: handleName, count: docCount });
    return (
      <Tooltip content={tooltip}>
        <span
          aria-label={tooltip}
          className={
            density === 'compact'
              ? "inline-flex h-8 items-center justify-center gap-1 rounded-full border border-[color:rgba(94,106,210,0.35)] bg-[color:rgba(94,106,210,0.1)] px-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-indigo-accent)]"
              : "inline-flex h-8 items-center gap-1.5 rounded-full border border-[color:rgba(94,106,210,0.35)] bg-[color:rgba(94,106,210,0.1)] px-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-indigo-accent)]"
          }
        >
          <span aria-hidden>●</span>
          {density === 'full' ? (
            <>
              <span>{t('vaultLabel')}</span>
              <span className="text-[color:var(--color-text-tertiary)]">·</span>
              <span>{t('vaultDocs', { count: docCount })}</span>
            </>
          ) : (
            <span>{t('vaultLabel')}</span>
          )}
        </span>
      </Tooltip>
    );
  }
  // demo (vault 미선택) chip 은 클릭 가능. Hosted browser 에서는 앱 설치
  // 안내로, 설치된 Tauri 앱에서는 native vault picker 로 이동한다.
  return (
    <Tooltip content={demoTooltip}>
      <Link
        href={demoHref}
        aria-label={demoAriaLabel}
        className={
          density === 'compact'
            ? "inline-flex h-8 items-center justify-center gap-1 rounded-full border border-[color:rgba(244,183,49,0.32)] bg-[color:rgba(244,183,49,0.08)] px-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:rgba(238,198,128,0.95)] transition-colors hover:border-[color:rgba(244,183,49,0.55)] hover:bg-[color:rgba(244,183,49,0.14)]"
            : "inline-flex h-8 items-center gap-1.5 rounded-full border border-[color:rgba(244,183,49,0.32)] bg-[color:rgba(244,183,49,0.08)] px-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:rgba(238,198,128,0.95)] transition-colors hover:border-[color:rgba(244,183,49,0.55)] hover:bg-[color:rgba(244,183,49,0.14)]"
        }
      >
        <span aria-hidden>●</span>
        {density === 'full' ? (
          <>
            <span>{t('demoLabel')}</span>
            <span aria-hidden className="text-[color:rgba(238,198,128,0.7)]">→</span>
          </>
        ) : (
          <span>{t('demoLabel')}</span>
        )}
      </Link>
    </Tooltip>
  );
}

function AppSettingsMenu({ mode }: { mode: 'static' | 'local' }) {
  const t = useTranslations('nav.settingsMenu');
  const { state: copyState, copy } = useCopyFeedback();
  const [open, setOpen] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsMenuTab>('general');
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const mcpTitleId = useId();
  const generalTitleId = useId();
  const isDesktopRuntime = isTauriVaultRuntime();
  const vaultHref = mode === 'local' ? '/docs/' : isDesktopRuntime ? '/docs/?intent=local' : '/download/';
  const vaultBody = mode === 'local' ? t('vaultBodyLocal') : t('vaultBodyStatic');
  const vaultCta = mode === 'local' ? t('vaultCtaLocal') : t('vaultCtaStatic');
  const settingsTabs: ReadonlyArray<{
    id: SettingsMenuTab;
    label: string;
    description: string;
  }> = [
    { id: 'general', label: t('tabGeneral'), description: t('tabGeneralDesc') },
    { id: 'mcpAgents', label: t('tabMcpAgents'), description: t('tabMcpAgentsDesc') },
    { id: 'vault', label: t('tabVault'), description: t('tabVaultDesc') },
    { id: 'appearance', label: t('tabAppearance'), description: t('tabAppearanceDesc') },
    { id: 'verification', label: t('tabVerification'), description: t('tabVerificationDesc') },
  ];
  const mcpFirstCalls = [
    '# Direct MCP proof inside the current agent session',
    'codex mcp list',
    'tools/list -> 24 tools including index_project and query_ontology',
    'query_ontology({"operation":"agent_brief"})',
    'query_ontology({"operation":"workspace_brief"})',
    'query_ontology({"operation":"health"})',
    '',
    '# If direct MCP tools are missing, this is CLI fallback proof only',
    'pnpm cli:mcp-verify docs/ontology --timeout-ms 15000',
    '',
    '# Stale client cache hint',
    'If the client still says 23 tools or query_ontology is not callable, reload/restart the agent or refresh cached MCP tools.',
    '',
    '# Project ontology indexing checkpoint (side effect 0)',
    'Replace [codebase-root] with the current checkout path before running project indexing.',
    'index_project({"rootPath":"[codebase-root]"})',
    'node cli/src/index.mjs index [codebase-root] --vault docs/ontology --json --threshold 2',
  ].join('\n');

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      panelRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleMouseDown = (event: MouseEvent) => {
      const details = detailsRef.current;
      if (!details || details.contains(event.target as Node)) return;
      setOpen(false);
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open]);

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
        if (event.key !== 'Escape') return;
        event.preventDefault();
        closePanel();
      }}
    >
      <summary
        ref={triggerRef}
        aria-label={t('triggerAria')}
        aria-expanded={open}
        title={t('triggerTitle')}
        data-testid="app-settings-trigger"
        onClick={(event) => {
          event.preventDefault();
          setOpen((current) => !current);
        }}
        className="inline-flex h-8 cursor-pointer list-none items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] px-2 text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset [&::-webkit-details-marker]:hidden"
      >
        <Settings size={14} aria-hidden />
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.08em] sm:inline">
          {t('settingsLabel')}
        </span>
      </summary>
      <div
        className="fixed inset-0 z-40 flex items-center justify-center overflow-hidden p-3 sm:p-6"
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
          className="flex h-[calc(100dvh-1.5rem)] max-h-[48rem] w-full max-w-[64rem] flex-col overflow-hidden rounded-xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] text-[13px] shadow-[0_28px_90px_rgba(0,0,0,0.55)] sm:h-[calc(100dvh-3rem)]"
          data-testid="app-settings-popover"
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[color:var(--color-border-soft)] p-4 pb-3">
            <div className="flex min-w-0 items-start gap-3">
              <Settings size={17} aria-hidden className="mt-0.5 shrink-0 text-[color:var(--color-indigo-accent)]" />
              <div className="min-w-0">
                <h2
                  id={titleId}
                  className="text-base font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
                >
                  {t('title')}
                </h2>
                <p className="mt-1 break-keep text-[11px] leading-4 text-[color:var(--color-text-tertiary)]">
                  {t('subtitle')}
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label={t('closeLabel')}
              onClick={() => closePanel()}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset"
            >
              <X size={13} aria-hidden />
            </button>
          </div>

          <div
            className="grid min-h-0 flex-1 gap-3 overflow-hidden p-3 sm:p-4 md:grid-cols-[13rem_minmax(0,1fr)]"
            data-testid="app-settings-body"
          >
            <nav
              role="tablist"
              aria-label={t('settingsTabsAriaLabel')}
              data-layout="lnb"
              className="flex shrink-0 gap-1 overflow-x-auto rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-1 md:min-h-0 md:flex-col md:overflow-visible"
            >
              {settingsTabs.map((tab) => {
                const active = activeSettingsTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-controls={`app-settings-panel-${tab.id}`}
                    id={`app-settings-tab-${tab.id}`}
                    onClick={() => setActiveSettingsTab(tab.id)}
                    className={
                      active
                        ? "min-w-[7.25rem] rounded-md border border-[color:rgba(94,106,210,0.34)] bg-[color:rgba(94,106,210,0.14)] px-2.5 py-2 text-left text-[color:var(--color-text-primary)] md:min-h-[4rem]"
                        : "min-w-[7.25rem] rounded-md border border-transparent px-2.5 py-2 text-left text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-soft)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] md:min-h-[4rem]"
                    }
                  >
                    <span className="block font-mono text-[10px] uppercase tracking-[0.08em]">
                      {tab.label}
                    </span>
                    <span className="mt-1 hidden text-[10px] leading-4 text-[color:var(--color-text-tertiary)] md:block">
                      {tab.description}
                    </span>
                  </button>
                );
              })}
            </nav>

            {activeSettingsTab === 'verification' ? (
              <section
                id="app-settings-panel-verification"
                role="tabpanel"
                aria-labelledby="app-settings-tab-verification"
                aria-label={t('tabVerification')}
                className="min-h-0 overflow-y-auto rounded-lg border border-[color:rgba(139,151,255,0.22)] bg-[color:rgba(94,106,210,0.06)] p-3"
              >
                <h3
                  id={mcpTitleId}
                  className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-indigo-accent)]"
                >
                  {t('connectionStatusTitle')}
                </h3>
                <div
                  className="mt-2 grid gap-1.5 rounded-lg border border-[color:rgba(139,151,255,0.22)] bg-[color:rgba(0,0,0,0.14)] p-2.5 sm:grid-cols-3"
                  data-testid="mcp-live-verdict-strip"
                >
                  <div className="min-w-0 rounded-md border border-[color:rgba(73,190,146,0.2)] bg-[color:rgba(73,190,146,0.06)] p-2">
                    <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:rgba(151,230,198,0.95)]">
                      <Check size={11} aria-hidden />
                      {t('liveVerdictSetup')}
                    </p>
                    <p className="mt-1 break-keep text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
                      {t('liveVerdictSetupMeta')}
                    </p>
                  </div>
                  <div className="min-w-0 rounded-md border border-[color:rgba(255,179,71,0.24)] bg-[color:rgba(255,179,71,0.07)] p-2">
                    <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:rgba(238,198,128,0.95)]">
                      <Terminal size={11} aria-hidden />
                      {t('liveVerdictSession')}
                    </p>
                    <p className="mt-1 break-keep text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
                      {t('liveVerdictSessionMeta')}
                    </p>
                  </div>
                  <div className="min-w-0 rounded-md border border-[color:rgba(139,151,255,0.22)] bg-[color:rgba(139,151,255,0.07)] p-2">
                    <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-indigo-accent)]">
                      <Terminal size={11} aria-hidden />
                      {t('liveVerdictFallback')}
                    </p>
                    <p className="mt-1 break-keep text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
                      {t('liveVerdictFallbackMeta')}
                    </p>
                  </div>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2" data-testid="mcp-connection-status-summary">
                <div className="rounded-lg border border-[color:rgba(73,190,146,0.24)] bg-[color:rgba(73,190,146,0.07)] p-2.5">
                  <div className="flex items-start gap-2">
                    <Check size={13} aria-hidden className="mt-0.5 shrink-0 text-[color:rgba(151,230,198,0.95)]" />
                    <div className="min-w-0">
                      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:rgba(151,230,198,0.95)]">
                        {t('setupReadyTitle')}
                      </p>
                      <p className="mt-1 break-keep text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
                        {t('setupReadyBody')}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-[color:rgba(255,179,71,0.28)] bg-[color:rgba(255,179,71,0.07)] p-2.5">
                  <div className="flex items-start gap-2">
                    <Terminal size={13} aria-hidden className="mt-0.5 shrink-0 text-[color:rgba(238,198,128,0.95)]" />
                    <div className="min-w-0">
                      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:rgba(238,198,128,0.95)]">
                        {t('directProofTitle')}
                      </p>
                      <p className="mt-1 break-keep text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
                        {t('directProofBody')}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-[color:rgba(139,151,255,0.2)] bg-[color:rgba(139,151,255,0.06)] p-2.5">
                  <div className="flex items-start gap-2">
                    <Terminal size={13} aria-hidden className="mt-0.5 shrink-0 text-[color:var(--color-indigo-accent)]" />
                    <div className="min-w-0">
                      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-indigo-accent)]">
                        {t('fallbackProofTitle')}
                      </p>
                      <p className="mt-1 break-keep text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
                        {t('fallbackProofBody')}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-[color:rgba(255,179,71,0.28)] bg-[color:rgba(255,179,71,0.07)] p-2.5">
                  <div className="flex items-start gap-2">
                    <Terminal size={13} aria-hidden className="mt-0.5 shrink-0 text-[color:rgba(238,198,128,0.95)]" />
                    <div className="min-w-0">
                      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:rgba(238,198,128,0.95)]">
                        {t('staleCacheTitle')}
                      </p>
                      <p className="mt-1 break-keep text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
                        {t('staleCacheBody')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div
                className="mt-3 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:rgba(255,255,255,0.025)] p-2.5"
                data-testid="mcp-proof-decision-order"
              >
                <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                  {t('proofDecisionTitle')}
                </p>
                <ol className="mt-2 grid gap-1.5 text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
                  <li className="flex gap-2">
                    <span className="font-mono text-[color:rgba(151,230,198,0.95)]">1</span>
                    <span>{t('proofDecisionSetup')}</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-mono text-[color:var(--color-indigo-accent)]">2</span>
                    <span>{t('proofDecisionInventory')}</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-mono text-[color:rgba(238,198,128,0.95)]">3</span>
                    <span>{t('proofDecisionSession')}</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-mono text-[color:rgba(238,198,128,0.95)]">4</span>
                    <span>{t('proofDecisionFallback')}</span>
                  </li>
                </ol>
              </div>
              </section>
            ) : null}

          {activeSettingsTab === 'general' ? (
          <section
            id="app-settings-panel-general"
            role="tabpanel"
            aria-labelledby="app-settings-tab-general"
            aria-label={t('tabGeneral')}
            className="grid min-h-0 gap-2 overflow-y-auto rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-3"
          >
            <h3
              id={generalTitleId}
              className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]"
            >
              {t('generalSettingsTitle')}
            </h3>
            <Link
              href="/ontology/insights/"
              className="flex items-start gap-2 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-2.5 text-left transition-colors hover:border-[color:rgba(139,151,255,0.32)]"
            >
              <Bot size={14} aria-hidden className="mt-0.5 shrink-0 text-[color:var(--color-indigo-accent)]" />
              <span className="min-w-0">
                <span className="block font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                  {t('agentTitle')}
                </span>
                <span className="mt-1 block break-keep text-[11px] leading-4 text-[color:var(--color-text-tertiary)]">
                  {t('agentBody')}
                </span>
                <span className="mt-1 block font-mono text-[9px] text-[color:var(--color-indigo-accent)]">
                  {t('agentCta')}
                </span>
              </span>
            </Link>
          </section>
          ) : null}

          {activeSettingsTab === 'vault' ? (
          <section
            id="app-settings-panel-vault"
            role="tabpanel"
            aria-labelledby="app-settings-tab-vault"
            aria-label={t('tabVault')}
            className="grid min-h-0 gap-2 overflow-y-auto rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-3"
          >
            <Link
              href={vaultHref}
              className="flex items-start gap-2 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-2.5 text-left transition-colors hover:border-[color:rgba(139,151,255,0.32)]"
            >
              <FolderOpen size={14} aria-hidden className="mt-0.5 shrink-0 text-[color:var(--color-indigo-accent)]" />
              <span className="min-w-0">
                <span className="block font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                  {t('vaultTitle')}
                </span>
                <span className="mt-1 block break-keep text-[11px] leading-4 text-[color:var(--color-text-tertiary)]">
                  {vaultBody}
                </span>
                <span className="mt-1 block font-mono text-[9px] text-[color:var(--color-indigo-accent)]">
                  {vaultCta}
                </span>
              </span>
            </Link>
          </section>
          ) : null}

          {activeSettingsTab === 'appearance' ? (
          <section
            id="app-settings-panel-appearance"
            role="tabpanel"
            aria-labelledby="app-settings-tab-appearance"
            aria-label={t('tabAppearance')}
            className="grid min-h-0 gap-2 overflow-y-auto rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-3"
          >
            <div className="flex items-center justify-between gap-3 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-2.5">
              <div className="flex min-w-0 items-start gap-2">
                <Palette size={14} aria-hidden className="mt-0.5 shrink-0 text-[color:var(--color-indigo-accent)]" />
                <div className="min-w-0">
                  <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                    {t('appearanceTitle')}
                  </p>
                  <p className="mt-1 break-keep text-[11px] leading-4 text-[color:var(--color-text-tertiary)]">
                    {t('appearanceBody')}
                  </p>
                </div>
              </div>
              <ThemeToggle />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-2.5">
              <div className="flex min-w-0 items-start gap-2">
                <Languages size={14} aria-hidden className="mt-0.5 shrink-0 text-[color:var(--color-indigo-accent)]" />
                <div className="min-w-0">
                  <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                    {t('languageTitle')}
                  </p>
                  <p className="mt-1 break-keep text-[11px] leading-4 text-[color:var(--color-text-tertiary)]">
                    {t('languageBody')}
                  </p>
                </div>
              </div>
              <LocaleSwitch />
            </div>
          </section>
          ) : null}

          {activeSettingsTab === 'mcpAgents' ? (
          <div
            id="app-settings-panel-mcpAgents"
            role="tabpanel"
            aria-labelledby="app-settings-tab-mcpAgents"
            aria-label={t('tabMcpAgents')}
            className="min-h-0 overflow-y-auto rounded-lg border border-[color:rgba(139,151,255,0.22)] bg-[color:rgba(94,106,210,0.08)] p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2">
                <Terminal size={14} aria-hidden className="mt-0.5 shrink-0 text-[color:var(--color-indigo-accent)]" />
                <div className="min-w-0">
                  <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-indigo-accent)]">
                    {t('mcpProofTitle')}
                  </p>
                  <p className="mt-1 break-keep text-[11px] leading-4 text-[color:var(--color-text-tertiary)]">
                    {t('mcpProofBody')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void copy(mcpFirstCalls)}
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-[color:rgba(139,151,255,0.32)] px-2 font-mono text-[9px] text-[color:var(--color-indigo-accent)] transition-colors hover:border-[color:rgba(139,151,255,0.48)] hover:bg-[color:rgba(139,151,255,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset"
              >
                {copyState === 'copied' ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
                {copyState === 'copied' ? t('mcpProofCopied') : t('mcpProofCopy')}
              </button>
            </div>
            <div
              className="mt-3 rounded-lg border border-[color:rgba(139,151,255,0.22)] bg-[color:rgba(0,0,0,0.14)] p-2.5"
              data-testid="mcp-state-decision-table"
            >
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-indigo-accent)]">
                {t('mcpStateMatrixTitle')}
              </p>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {([
                  ['connected', 'mcpStateConnectedLabel', 'mcpStateConnectedBody', Check, 'rgba(151,230,198,0.95)'],
                  ['setup', 'mcpStateSetupOnlyLabel', 'mcpStateSetupOnlyBody', Terminal, 'var(--color-indigo-accent)'],
                  ['restart', 'mcpStateRestartLabel', 'mcpStateRestartBody', Terminal, 'rgba(238,198,128,0.95)'],
                  ['fallback', 'mcpStateCliFallbackLabel', 'mcpStateCliFallbackBody', Terminal, 'rgba(238,198,128,0.95)'],
                  ['disconnected', 'mcpStateDisconnectedLabel', 'mcpStateDisconnectedBody', X, 'var(--color-text-tertiary)'],
                ] as const).map(([id, labelKey, bodyKey, Icon, iconColor]) => (
                  <div
                    key={id}
                    className="flex min-w-0 items-start gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:rgba(255,255,255,0.025)] p-2"
                  >
                    <Icon
                      size={12}
                      aria-hidden
                      className="mt-0.5 shrink-0"
                      style={{ color: iconColor }}
                    />
                    <div className="min-w-0">
                      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-secondary)]">
                        {t(labelKey)}
                      </p>
                      <p className="mt-1 break-keep text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
                        {t(bodyKey)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3 grid gap-2 text-[10px] leading-4 text-[color:var(--color-text-secondary)] sm:grid-cols-2">
              <div
                data-testid="direct-mcp-proof"
                className="rounded-lg border border-[color:rgba(73,190,146,0.26)] bg-[color:rgba(73,190,146,0.06)] p-2.5"
              >
                <div className="flex items-start gap-2">
                  <Check size={13} aria-hidden className="mt-0.5 shrink-0 text-[color:rgba(151,230,198,0.95)]" />
                  <div className="min-w-0">
                    <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:rgba(151,230,198,0.95)]">
                      {t('mcpProofDirectLabel')}
                    </p>
                    <p className="mt-1 break-keep text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
                      {t('mcpProofDirectBody')}
                    </p>
                  </div>
                </div>
                <div className="mt-2 grid gap-1.5 rounded-md bg-[color:rgba(0,0,0,0.16)] p-2 font-mono">
                  <span>{t('mcpProofCallCodex')}</span>
                  <span>{t('mcpProofCallTools')}</span>
                  <span>{t('mcpProofCallAgent')}</span>
                  <span>{t('mcpProofCallWorkspace')}</span>
                  <span>{t('mcpProofCallHealth')}</span>
                </div>
              </div>
              <div
                data-testid="cli-fallback-proof"
                className="rounded-lg border border-[color:rgba(255,179,71,0.3)] bg-[color:rgba(255,179,71,0.07)] p-2.5"
              >
                <div className="flex items-start gap-2">
                  <Terminal size={13} aria-hidden className="mt-0.5 shrink-0 text-[color:rgba(238,198,128,0.95)]" />
                  <div className="min-w-0">
                    <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:rgba(238,198,128,0.95)]">
                      {t('mcpProofFallbackLabel')}
                    </p>
                    <p className="mt-1 break-keep text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
                      {t('mcpProofFallbackBody')}
                    </p>
                  </div>
                </div>
                <div className="mt-2 grid gap-1.5 rounded-md bg-[color:rgba(0,0,0,0.16)] p-2 font-mono">
                  <span className="text-[color:var(--color-text-tertiary)]">{t('mcpProofFallback')}</span>
                  <span className="text-[color:rgba(238,198,128,0.95)]">{t('mcpProofStaleCache')}</span>
                </div>
              </div>
              <div
                data-testid="project-indexing-checkpoint"
                className="grid gap-1.5 rounded-lg border border-[color:rgba(139,151,255,0.24)] bg-[color:rgba(139,151,255,0.07)] p-2.5 font-mono sm:col-span-2"
              >
                <span className="text-[color:var(--color-indigo-accent)]">{t('projectIndexTitle')}</span>
                <span>{t('projectIndexMcp')}</span>
                <span>{t('projectIndexCli')}</span>
                <span className="text-[color:rgba(238,198,128,0.95)]">{t('projectIndexApply')}</span>
              </div>
            </div>
            <div
              className="mt-3 border-t border-[color:var(--color-border-soft)] pt-3"
              data-testid="mcp-client-proof-locations"
            >
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-indigo-accent)]">
                {t('clientProofTitle')}
              </p>
              <p className="mt-1 break-keep text-[11px] leading-4 text-[color:var(--color-text-tertiary)]">
                {t('clientProofBody')}
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-[color:var(--color-border-soft)] bg-[color:rgba(255,255,255,0.025)] p-2.5">
                  <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-secondary)]">
                    {t('clientCodexTitle')}
                  </p>
                  <p className="mt-1 break-keep text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
                    {t('clientCodexBody')}
                  </p>
                </div>
                <div className="rounded-lg border border-[color:var(--color-border-soft)] bg-[color:rgba(255,255,255,0.025)] p-2.5">
                  <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-secondary)]">
                    {t('clientClaudeTitle')}
                  </p>
                  <p className="mt-1 break-keep text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
                    {t('clientClaudeBody')}
                  </p>
                </div>
                <div className="rounded-lg border border-[color:var(--color-border-soft)] bg-[color:rgba(255,255,255,0.025)] p-2.5">
                  <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-secondary)]">
                    {t('clientCursorVsCodeTitle')}
                  </p>
                  <p className="mt-1 break-keep text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
                    {t('clientCursorVsCodeBody')}
                  </p>
                </div>
                <div className="rounded-lg border border-[color:var(--color-border-soft)] bg-[color:rgba(255,255,255,0.025)] p-2.5">
                  <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-secondary)]">
                    {t('clientInspectorTitle')}
                  </p>
                  <p className="mt-1 break-keep text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
                    {t('clientInspectorBody')}
                  </p>
                </div>
              </div>
            </div>
          </div>
          ) : null}
        </div>
      </div>
      </div>
    </details>
  );
}

export function OperationsNav() {
  const pathname = usePathname() ?? '';
  const dataSourceMode = useDataSourceMode();
  const t = useTranslations('nav');
  // SubNav 는 ontology surface 에서 항상 노출 — 이전엔 접힘 default + 토글
  // 패턴이었지만 codex IA 의견: 3 탭이 hidden 상태로 묻히면 발견성 0,
  // 실제 vertical chrome 부담도 1 줄밖에 안 돼 trade-off 어색. 항상
  // 노출로 단순화 (localStorage / 토글 / chevron / aria 모두 제거).
  const showSubNav = shouldShowOntologySubNav(pathname);
  // '← 홈' 링크는 destination = / 인데 사용자가 이미 / 면 자가-링크라 의미 0.
  // pathname 정규화 후 빈 문자열 (즉 /) 일 때 숨김. RootEntryPage 가
  // OntologyView 를 / 에서 렌더하는 경우에도 방향 일관 유지.
  const isAtHome = pathname.replace(/\/$/, '') === '';

  const renderTab = (item: NavItem, variant: 'desktop' | 'mobile') => {
    const active = isOperationsTabActive(pathname, item.prefixes);
    const href = item.basePath;
    // 모바일 chip 은 본문 톤 (text-[12px]) 유지하되 padding 살짝 줄여
    // 3 개가 375 폭 가로 스크롤 안에 자연스럽게 흐르게.
    const sizeClass =
      variant === 'mobile' ? 'h-8 px-2.5 text-[12px]' : 'h-8 px-3 text-[12px]';
    return (
      <li key={item.id}>
        {/* role='tab'/'tablist' 는 tabpanel 페어링이 있어야 의미가 있음.
            여기 항목은 별도 라우트로 navigate 하는 plain link 라 link
            시맨틱 만 유지하고 aria-current='page' 로 활성 항목 표시. */}
        <Tooltip content={t(item.tooltipKey)}>
          <Link
            href={href}
            aria-label={t(item.tooltipKey)}
            aria-current={active ? 'page' : undefined}
            data-active={active ? 'true' : 'false'}
            className={
              active
                ? `inline-flex items-center whitespace-nowrap break-keep rounded-md border border-[color:rgba(94,106,210,0.4)] bg-[color:rgba(94,106,210,0.14)] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] ${sizeClass}`
                : `inline-flex items-center whitespace-nowrap break-keep rounded-md text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] ${sizeClass}`
            }
          >
            {t(item.labelKey)}
          </Link>
        </Tooltip>
      </li>
    );
  };

  return (
    <nav
      aria-label={t('ariaLabel')}
      className="sticky top-0 z-30 border-b border-[color:var(--color-border-soft)] bg-[color:var(--color-nav-surface)]"
    >
      {/* 데스크톱 — 워크스페이스 복귀 + 3 탭 + 우측 보조 버튼들. DOM
          순서상 먼저 둬 e2e locator (`first()`) 가 hidden mobile 이 아닌
          visible desktop 을 잡게 함. */}
      <div className="hidden items-center justify-between gap-3 px-4 py-2.5 md:flex md:px-6">
        <div className="flex items-center gap-3">
          {isAtHome ? null : (
            <Link
              href={'/'}
              aria-label={t('backToWorkspace')}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[color:var(--color-overlay-3)] px-2.5 text-[12px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.35)] hover:text-[color:var(--color-text-primary)]"
            >
              <span aria-hidden>←</span>
              <span>{t('back')}</span>
            </Link>
          )}
          <ul className="flex items-center gap-1 overflow-x-auto">
            {NAV_ITEMS.map((item) => renderTab(item, 'desktop'))}
          </ul>
        </div>
        <div className="flex items-center gap-2">
          <LiveActivityIndicator />
          <ModeBadge mode={dataSourceMode} />
          <LocaleSwitch />
          <AppSettingsMenu mode={dataSourceMode} />
        </div>
      </div>

      {/* 모바일 — top row 는 workspace/status, second row 는 surface tabs.
          한 줄에 모두 넣으면 390px 폭에서 tabs 와 Live/demo 상태가 겹치므로
          명확한 두 줄 chrome 으로 분리한다. */}
      <div className="flex min-w-0 flex-col gap-1 px-4 py-2 md:hidden">
        <div className="flex min-w-0 items-center justify-between gap-2">
          {isAtHome ? (
            <span aria-hidden className="h-8 min-w-8" />
          ) : (
            <Link
              href={'/'}
              aria-label={t('backToWorkspace')}
              className="inline-flex h-8 min-w-8 shrink-0 items-center justify-center gap-1 rounded-md border border-[color:var(--color-overlay-3)] px-2 text-[12px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.35)] hover:text-[color:var(--color-text-primary)]"
            >
              <span aria-hidden>←</span>
            </Link>
          )}
          <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1.5" data-testid="operations-mobile-status">
            <LiveActivityIndicator />
            <ModeBadge mode={dataSourceMode} density="compact" />
            <AppSettingsMenu mode={dataSourceMode} />
          </div>
        </div>
        <ul
          className="flex min-w-0 items-center gap-1 overflow-x-auto overflow-y-hidden"
          aria-label={t('ariaLabelMobile')}
          data-testid="operations-mobile-tabs"
        >
          {NAV_ITEMS.map((item) => renderTab(item, 'mobile'))}
        </ul>
      </div>

      {/* ontology surface (/, /ontology*) 에서만 sub-nav 행 추가. 같은
          <nav> 안에 inline 렌더링되어 한 nav block 으로 시각 융합 —
          항상 노출 (3 탭이 hidden 이면 발견성 0). */}
      {showSubNav ? <OntologySubNav /> : null}
    </nav>
  );
}
