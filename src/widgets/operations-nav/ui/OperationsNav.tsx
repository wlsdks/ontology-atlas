'use client';

import { Link, usePathname } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { useDataSourceMode } from '@/features/data-source-mode';
import { useLocalVault } from '@/features/docs-vault-local';
import { ThemeToggle } from '@/features/theme-toggle';
import { LocaleSwitch } from '@/features/locale-switch';
import { Tooltip } from '@/shared/ui';

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
    basePath: '/',
    prefixes: ['/ontology'],
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
function ModeBadge({ mode }: { mode: 'static' | 'local' }) {
  // local 모드일 때만 vault 메타 가져오기. static 은 그냥 chip.
  // useLocalVault 자체는 SSR-safe (window 가드).
  const vault = useLocalVault();
  const t = useTranslations('modeBadge');
  if (mode === 'local') {
    const docCount = vault.manifest?.docs.length ?? 0;
    const handleName = vault.handle?.name ?? 'vault';
    const tooltip = t('vaultTooltip', { name: handleName, count: docCount });
    return (
      <Tooltip content={tooltip}>
        <span
          aria-label={tooltip}
          className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[color:rgba(94,106,210,0.35)] bg-[color:rgba(94,106,210,0.1)] px-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-indigo-accent)]"
        >
          <span aria-hidden>●</span>
          <span>{t('vaultLabel')}</span>
          <span className="text-[color:var(--color-text-tertiary)]">·</span>
          <span>{t('vaultDocs', { count: docCount })}</span>
        </span>
      </Tooltip>
    );
  }
  // demo (vault 미선택) chip 은 클릭 가능 — vault picker (/docs/) 로 직행.
  // 이전엔 단순 정보 chip 이라 사용자가 "벗어나려면 어디" 헤매는 dead-end
  // 였다. onboarding step 3 카피 ('오른쪽 위 마크다운 폴더 열기') 와 일치.
  return (
    <Tooltip content={t('demoTooltipClickable')}>
      <Link
        href="/docs/?intent=local"
        aria-label={t('demoAriaLabelClickable')}
        className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[color:rgba(244,183,49,0.32)] bg-[color:rgba(244,183,49,0.08)] px-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:rgba(238,198,128,0.95)] transition-colors hover:border-[color:rgba(244,183,49,0.55)] hover:bg-[color:rgba(244,183,49,0.14)]"
      >
        <span aria-hidden>●</span>
        <span>{t('demoLabel')}</span>
        <span aria-hidden className="text-[color:rgba(238,198,128,0.7)]">→</span>
      </Link>
    </Tooltip>
  );
}

export function OperationsNav() {
  const pathname = usePathname() ?? '';
  const dataSourceMode = useDataSourceMode();
  const t = useTranslations('nav');

  const renderTab = (item: NavItem, variant: 'desktop' | 'mobile') => {
    const active = item.prefixes.some((p) => pathname.startsWith(p));
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
          <Link
            href={'/'}
            aria-label={t('backToWorkspace')}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[color:var(--color-overlay-3)] px-2.5 text-[12px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.35)] hover:text-[color:var(--color-text-primary)]"
          >
            <span aria-hidden>←</span>
            <span>{t('back')}</span>
          </Link>
          <ul className="flex items-center gap-1 overflow-x-auto">
            {NAV_ITEMS.map((item) => renderTab(item, 'desktop'))}
          </ul>
        </div>
        <div className="flex items-center gap-2">
          <ModeBadge mode={dataSourceMode} />
          <LocaleSwitch />
          <ThemeToggle />
        </div>
      </div>

      {/* 모바일 — 돌아가기 + chip row. 안전 영역 (BottomTabBar 와 충돌
          없음 — 상단 sticky). 가로 스크롤 — overflow-x-auto + scrollbar
          숨김. fade mask 안 줌 (디자인 헌장: glow / 움직이는 그라디언트
          금지). */}
      <div className="flex items-center gap-2 overflow-x-auto px-4 py-2 md:hidden">
        <Link
          href={'/'}
          aria-label={t('backToWorkspace')}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-[color:var(--color-overlay-3)] px-2 text-[12px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.35)] hover:text-[color:var(--color-text-primary)]"
        >
          <span aria-hidden>←</span>
        </Link>
        <ul
          className="flex items-center gap-1"
          aria-label={t('ariaLabelMobile')}
        >
          {NAV_ITEMS.map((item) => renderTab(item, 'mobile'))}
        </ul>
        <div className="ml-auto shrink-0">
          <ModeBadge mode={dataSourceMode} />
        </div>
      </div>
    </nav>
  );
}
