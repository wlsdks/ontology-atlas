'use client';

import { Link, usePathname } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Bot, Check, Copy, FolderOpen, Languages, Palette, Settings, Terminal } from 'lucide-react';
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
  const isDesktopRuntime = isTauriVaultRuntime();
  const vaultHref = mode === 'local' ? '/docs/' : isDesktopRuntime ? '/docs/?intent=local' : '/download/';
  const vaultBody = mode === 'local' ? t('vaultBodyLocal') : t('vaultBodyStatic');
  const vaultCta = mode === 'local' ? t('vaultCtaLocal') : t('vaultCtaStatic');
  const mcpFirstCalls = [
    'query_ontology({"operation":"agent_brief"})',
    'query_ontology({"operation":"workspace_brief"})',
    'query_ontology({"operation":"health"})',
    'pnpm cli:mcp-verify docs/ontology --timeout-ms 15000',
  ].join('\n');

  return (
    <details className="group relative shrink-0">
      <summary
        aria-label={t('triggerAria')}
        title={t('triggerTitle')}
        data-testid="app-settings-trigger"
        className="inline-flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-md border border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset [&::-webkit-details-marker]:hidden"
      >
        <Settings size={14} aria-hidden />
      </summary>
      <div
        className="fixed left-3 right-3 top-16 z-40 max-h-[calc(100vh-5rem)] overflow-y-auto rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-3 text-[12px] shadow-[0_24px_72px_rgba(0,0,0,0.48)] sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[min(22rem,calc(100vw-2rem))]"
        data-testid="app-settings-popover"
      >
        <div className="flex items-start gap-2">
          <Settings size={15} aria-hidden className="mt-0.5 shrink-0 text-[color:var(--color-indigo-accent)]" />
          <div className="min-w-0">
            <h2 className="text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
              {t('title')}
            </h2>
            <p className="mt-1 break-keep text-[11px] leading-4 text-[color:var(--color-text-tertiary)]">
              {t('subtitle')}
            </p>
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2" data-testid="mcp-connection-status-summary">
          <div className="rounded-lg border border-[color:rgba(73,190,146,0.24)] bg-[color:rgba(73,190,146,0.07)] p-2">
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
          <div className="rounded-lg border border-[color:rgba(255,179,71,0.28)] bg-[color:rgba(255,179,71,0.07)] p-2">
            <div className="flex items-start gap-2">
              <Terminal size={13} aria-hidden className="mt-0.5 shrink-0 text-[color:rgba(238,198,128,0.95)]" />
              <div className="min-w-0">
                <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:rgba(238,198,128,0.95)]">
                  {t('sessionProofTitle')}
                </p>
                <p className="mt-1 break-keep text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
                  {t('sessionProofBody')}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-2">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-2.5">
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

          <div className="flex items-center justify-between gap-3 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-2.5">
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

          <Link
            href={vaultHref}
            className="flex items-start gap-2 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-2.5 text-left transition-colors hover:border-[color:rgba(139,151,255,0.32)]"
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

          <Link
            href="/ontology/insights/"
            className="flex items-start gap-2 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-2.5 text-left transition-colors hover:border-[color:rgba(139,151,255,0.32)]"
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

          <div className="rounded-lg border border-[color:rgba(139,151,255,0.22)] bg-[color:rgba(94,106,210,0.08)] p-2.5">
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
            <div className="mt-2 grid gap-1.5 font-mono text-[10px] leading-4 text-[color:var(--color-text-secondary)]">
              <span>{t('mcpProofCallAgent')}</span>
              <span>{t('mcpProofCallWorkspace')}</span>
              <span>{t('mcpProofCallHealth')}</span>
              <span className="text-[color:var(--color-text-tertiary)]">{t('mcpProofFallback')}</span>
            </div>
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
