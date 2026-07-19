'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bot, Check, Copy, FolderOpen, Languages, Palette, Settings, Terminal, X } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { ThemeToggle } from '@/features/theme-toggle';
import { LocaleSwitch } from '@/features/locale-switch';
import { isTauriVaultRuntime } from '@/shared/lib/tauri-vault-fs';
import { useCopyFeedback } from '@/shared/lib/use-copy-feedback';

type SettingsMenuTab = 'general' | 'mcpAgents' | 'vault' | 'appearance' | 'verification';

/**
 * 상시 앱 설정 진입점 — 이전엔 `OperationsNav` (구 상단 탭 내비, feat/rail-rollout
 * 에서 은퇴) 우측에 살던 컴포넌트. 좌측 `AppNavRail` 은 폭이 좁아(64~88px) 이
 * 컴포넌트의 popover(228~1024px, 5-tab 패널)를 직접 품기 어려워, 별도
 * 위젯으로 분리해 레일이 상주하는 각 페이지 헤더에 얹는다 — 기능 손실 0
 * 원칙(LiveActivityIndicator 는 같은 방식으로 `@/features/vault-ontology` 에서
 * 개별 마운트). general / mcpAgents / vault / appearance / verification 5
 * 탭 — 언어·테마 전환(appearance)도 여기 흡수돼 있어 AppNavRail 자체에는
 * 별도 설정 트리거가 없어도 기능 손실이 없다.
 */
export function AppSettingsMenu({ mode }: { mode: 'static' | 'local' }) {
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
  const mcpStateRows = [
    ['connected', 'mcpStateConnectedLabel', 'mcpStateConnectedBody', Check, 'rgba(151,230,198,0.95)'],
    ['setup', 'mcpStateSetupOnlyLabel', 'mcpStateSetupOnlyBody', Terminal, 'var(--color-indigo-accent)'],
    ['restart', 'mcpStateRestartLabel', 'mcpStateRestartBody', Terminal, 'rgba(238,198,128,0.95)'],
    ['fallback', 'mcpStateCliFallbackLabel', 'mcpStateCliFallbackBody', Terminal, 'rgba(238,198,128,0.95)'],
    ['disconnected', 'mcpStateDisconnectedLabel', 'mcpStateDisconnectedBody', X, 'var(--color-text-tertiary)'],
  ] as const;

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
        // 닫힌 native <details> 콘텐츠는 스펙상 렌더링만 스킵할 뿐 항상
        // display:none 이 되는 건 아니다(content-visibility 계열 구현) — 그
        // 결과 desktop 폭의 내부 tab strip 이 실제 layout box 를 유지해 모바일
        // 뷰포트에서 document.body.scrollWidth 를 밀어 올렸다(overflow-sweep
        // mobile-390/360 회귀). `hidden` + `group-open:flex` 로 열림 상태를
        // 명시적 display 값에 묶어 확정적으로 닫는다.
        className="fixed inset-0 z-40 hidden items-center justify-center overflow-hidden p-3 group-open:flex sm:p-6"
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
                <div
                  className="mt-2 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:rgba(255,255,255,0.025)] p-2.5"
                  data-testid="mcp-connection-state-ladder"
                >
                  <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-indigo-accent)]">
                    {t('stateLadderTitle')}
                  </p>
                  <p className="mt-1 break-keep text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
                    {t('stateLadderBody')}
                  </p>
                  <div className="mt-2 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-5">
                    {mcpStateRows.map(([id, labelKey, bodyKey, Icon, iconColor]) => (
                      <div
                        key={id}
                        className="flex min-w-0 items-start gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:rgba(0,0,0,0.12)] p-2"
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
                {mcpStateRows.map(([id, labelKey, bodyKey, Icon, iconColor]) => (
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
                <span>{t('projectIndexMeaningGate')}</span>
                <span>{t('projectIndexEvidence')}</span>
                <span>{t('projectIndexReview')}</span>
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
