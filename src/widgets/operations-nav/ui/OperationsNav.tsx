'use client';

import { Link, usePathname } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { useDataSourceMode } from '@/features/data-source-mode';
import { useLocalVault } from '@/features/docs-vault-local';
import { ThemeToggle } from '@/features/theme-toggle';
import { LocaleSwitch } from '@/features/locale-switch';
import { Button, Tooltip } from '@/shared/ui';

interface OperationsNavProps {
  /** 우측 보조 컨트롤 (예: 워크스페이스 selector). 미지정 시 생략. */
  rightSlot?: React.ReactNode;
}

interface NavItem {
  id: 'knowledge' | 'ontology' | 'topology';
  /** Translation key under `nav.*` for the visible label. */
  labelKey: 'docs' | 'ontology' | 'topology';
  /** Translation key under `nav.*` for the tooltip body. */
  tooltipKey: 'tooltipDocs' | 'tooltipOntology' | 'tooltipTopology';
  basePath: string;
  /** Current pathname starts with this prefix → active. */
  prefixes: ReadonlyArray<string>;
}

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  // R10c (auth + cloud surface 정리) 이후 진입점 3개 — docs (vault picker /
  // editor), ontology (frontmatter 트리·ego graph), topology (Sigma WebGL).
  // settings (/categories|statuses|import) 는 cloud-only 였고 mission v2 의
  // "frontmatter = schema" 와 모순돼 R10c 에서 제거.
  {
    id: 'knowledge',
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
 * 운영 메뉴 공통 nav. /knowledge ↔ /settings ↔ ontology 사이 전환이
 * 각 페이지 nav 안에 묻혀 있어 사용자가 메뉴 사이 점프 못 하던 문제
 * 해소. 모든 운영 페이지 상단에 동일하게 배치.
 *
 * 데스크톱 (md+): 탭 + 우측 보조 (rightSlot / 프로젝트 / 로그아웃).
 *
 * 모바일 (<md, A2-6): 탭만 horizontal scroll chip row 로 노출. 보조
 * 버튼은 BottomTabBar (지도 / 프로젝트 / 문서 / 정리) 와 사용자 메뉴가
 * 대체. 1 차 결정 (모바일 nav 자체 숨김) 은 sub-page 점프가 답 없는
 * 문제를 만들어 뒤집음. iOS / Android 표준
 * 가로 스크롤 칩 패턴 (음원/뱅킹 앱에서 흔한 sub-tab) 같은 형태.
 *
 * 활성 표시는 pathname prefix 매칭 — 동일 룰 양쪽 적용.
 */
/**
 * Mode badge — UX-2. 사용자가 *지금 어떤 source 에 데이터가 가는지* 한눈에
 * 보게. local 모드면 vault 폴더 이름 + doc count, cloud 면 "cloud sync",
 * static (비활성/비로그인) 이면 "데모". mode 바뀜 = 데이터 destination 바뀜.
 */
function ModeBadge({ mode }: { mode: 'static' | 'local' | 'cloud' }) {
  // local 모드일 때만 vault 메타 가져오기. cloud/static 은 그냥 chip.
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
  if (mode === 'cloud') {
    return (
      <Tooltip content={t('cloudTooltip')}>
        <span
          aria-label={t('cloudAriaLabel')}
          className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-text-secondary)]"
        >
          <span aria-hidden>●</span>
          <span>{t('cloudLabel')}</span>
        </span>
      </Tooltip>
    );
  }
  return (
    <Tooltip content={t('demoTooltip')}>
      <span
        aria-label={t('demoAriaLabel')}
        className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[color:rgba(244,183,49,0.32)] bg-[color:rgba(244,183,49,0.08)] px-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:rgba(238,198,128,0.95)]"
      >
        <span aria-hidden>●</span>
        <span>{t('demoLabel')}</span>
      </span>
    </Tooltip>
  );
}

export function OperationsNav({ rightSlot }: OperationsNavProps) {
  const pathname = usePathname() ?? '';
  const dataSourceMode = useDataSourceMode();
  const t = useTranslations('nav');

  const renderTab = (item: NavItem, variant: 'desktop' | 'mobile') => {
    const active = item.prefixes.some((p) => pathname.startsWith(p));
    const href = item.basePath;
    // 모바일 chip 은 본문 톤 (text-[12px]) 유지하되 padding 살짝 줄여
    // 5 개가 375 폭 가로 스크롤 안에 자연스럽게 흐르게.
    const sizeClass =
      variant === 'mobile' ? 'h-8 px-2.5 text-[12px]' : 'h-8 px-3 text-[12px]';
    return (
      <li key={item.id}>
        {/* audit A6 — role='tab'/'tablist' 는 panel 페어링이 있어야 의미 있음.
            여기 항목들은 별도 라우트로 navigate 하는 plain link 라 정직하게
            link 시맨틱 만 유지. aria-current='page' 로 활성 항목 표시. */}
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
      {/* 데스크톱 — 워크스페이스 복귀 + 5 탭 + 우측 보조 버튼들. DOM
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
          {rightSlot}
          <ModeBadge mode={dataSourceMode} />
          <LocaleSwitch />
          <ThemeToggle />
          <Link href={'/projects/'} className="inline-flex">
            {/* '↗' 는 외부 링크 의미로 오해 가능 — 내부 라우트라
                '→' 로 명확화. */}
            <Button variant="ghost" size="sm" type="button">
              {t('projectsCta')}
            </Button>
          </Link>
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
