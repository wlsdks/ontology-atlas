'use client';

import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { signOut } from '@/features/user-auth';
import { useDataSourceMode } from '@/features/data-source-mode';
import { ThemeToggle } from '@/features/theme-toggle';
import { Button, Tooltip } from '@/shared/ui';

interface OperationsNavProps {
  /** 명시 accountId. 미지정 시 ?account 쿼리에서 자동 해석. */
  accountId?: string | null;
  /** 우측 보조 컨트롤 (예: 워크스페이스 selector). 미지정 시 생략. */
  rightSlot?: React.ReactNode;
}

interface NavItem {
  id: 'knowledge' | 'ontology' | 'topology' | 'settings' | 'diagnostics';
  label: string;
  /** Tooltip 본문 — 라벨이 짧아 첫 사용자에게 의미 약할 때 보조 안내. */
  description: string;
  basePath: string;
  /** 현재 pathname 이 이 prefix 로 시작하면 활성. */
  prefixes: ReadonlyArray<string>;
}

function buildItems(mode: 'static' | 'local' | 'cloud'): ReadonlyArray<NavItem> {
  // local 모드는 vault 가 진실원이라 "문서" 진입점이 /docs/ — Firestore 의
  // /knowledge 가 아니라 사용자 디스크 surface. cloud / static 은 기존 /knowledge.
  // prefixes 는 양쪽 활성 표시 인식.
  const docsBase = mode === 'local' ? '/docs/' : '/knowledge/';
  return [
    {
      id: 'knowledge',
      label: '문서',
      description:
        mode === 'local'
          ? '내 vault 의 .md 들 — 직접 편집하면 즉시 ontology stub 으로 자람'
          : '문서 등록 + frontmatter 또는 빌더에서 ontology 노드 추가',
      basePath: docsBase,
      prefixes: ['/knowledge', '/docs'],
    },
    // ontology view — 승인된 노드/관계의 트리. mission 의 척추.
    // / 도 OntologyViewPage 를 렌더하므로 prefix 에 양쪽 포함.
    {
      id: 'ontology',
      label: '온톨로지',
      description: '승인된 노드·관계의 계층 그래프 (project → domain → capability → element)',
      basePath: '/',
      prefixes: ['/ontology'],
    },
    // topology — 출구 view 중 하나 (Sigma WebGL 의존도 지도).
    {
      id: 'topology',
      label: '토폴로지',
      description: '프로젝트 의존도 지도 — 온톨로지의 한 출구 view',
      basePath: '/topology/',
      prefixes: ['/topology'],
    },
    // BottomTabBar 의 '정리' 와 라벨 일치 — 같은 destination 인데 데스크톱 / 모바일
    // 라벨이 달라 사용자 혼란 (audit A1 회귀 차단).
    {
      id: 'settings',
      label: '정리',
      description: '카테고리 / 상태 / API 키 / 프로젝트 import 같은 공간 설정',
      basePath: '/settings/categories/',
      prefixes: ['/settings'],
    },
    {
      id: 'diagnostics',
      label: '챙길 곳',
      description: '지금 손대야 할 프로젝트 / 데이터 상태 / 마이그레이션 도구',
      basePath: '/diagnostics/insights/',
      prefixes: ['/diagnostics'],
    },
  ];
}

/**
 * 운영 메뉴 공통 nav. /knowledge ↔ /settings ↔ /diagnostics ↔ ontology
 * 사이 전환이 각 페이지 nav 안에 묻혀 있어 사용자가 메뉴 사이 점프
 * 못 하던 문제 해소. 모든 운영 페이지 상단에 동일하게 배치.
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
export function OperationsNav({ accountId, rightSlot }: OperationsNavProps) {
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const router = useRouter();
  const dataSourceMode = useDataSourceMode();
  const items = buildItems(dataSourceMode);
  // hook 은 조건부 호출 금지 — prop 우선 분기는 호출 후에 적용.
  const queryAccountId = null;
  const resolvedAccountId =
    accountId !== undefined ? accountId : queryAccountId;

  // 로그아웃 후 /login/ 으로 명시 redirect — 이전엔 같은 페이지에 머물러 데이터가
  // 조용히 사라지는 회귀. PermissionGate 가 있는 페이지는 자동 fallback
  // 했지만 ontology 3 페이지처럼 gate 없는 곳은 빈 상태로 남았음.
  const handleSignOut = async () => {
    try {
      await signOut();
    } finally {
      router.replace('/login/');
    }
  };

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
        <Tooltip content={item.description}>
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
            {item.label}
          </Link>
        </Tooltip>
      </li>
    );
  };

  return (
    <nav
      aria-label="운영 메뉴"
      className="sticky top-0 z-30 border-b border-[color:var(--color-border-soft)] bg-[color:var(--color-nav-surface)]"
    >
      {/* 데스크톱 — 워크스페이스 복귀 + 5 탭 + 우측 보조 버튼들. DOM
          순서상 먼저 둬 e2e locator (`first()`) 가 hidden mobile 이 아닌
          visible desktop 을 잡게 함. */}
      <div className="hidden items-center justify-between gap-3 px-4 py-2.5 md:flex md:px-6">
        <div className="flex items-center gap-3">
          <Link
            href={'/'}
            aria-label="워크스페이스 지도로 돌아가기"
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[color:var(--color-overlay-3)] px-2.5 text-[12px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.35)] hover:text-[color:var(--color-text-primary)]"
          >
            <span aria-hidden>←</span>
            <span>돌아가기</span>
          </Link>
          <ul className="flex items-center gap-1 overflow-x-auto">
            {items.map((item) => renderTab(item, 'desktop'))}
          </ul>
        </div>
        <div className="flex items-center gap-2">
          {rightSlot}
          <ThemeToggle />
          <Link href={'/projects/'} className="inline-flex">
            {/* '↗' 는 외부 링크 의미로 오해 가능 — 내부 라우트라
                '→' 로 명확화. */}
            <Button variant="ghost" size="sm" type="button">
              프로젝트 →
            </Button>
          </Link>
          <Button variant="ghost" size="sm" type="button" onClick={() => void handleSignOut()}>
            로그아웃
          </Button>
        </div>
      </div>

      {/* 모바일 — 돌아가기 + chip row. 안전 영역 (BottomTabBar 와 충돌
          없음 — 상단 sticky). 가로 스크롤 — overflow-x-auto + scrollbar
          숨김. fade mask 안 줌 (디자인 헌장: glow / 움직이는 그라디언트
          금지). */}
      <div className="flex items-center gap-2 overflow-x-auto px-4 py-2 md:hidden">
        <Link
          href={'/'}
          aria-label="워크스페이스 지도로 돌아가기"
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-[color:var(--color-overlay-3)] px-2 text-[12px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.35)] hover:text-[color:var(--color-text-primary)]"
        >
          <span aria-hidden>←</span>
        </Link>
        <ul
          className="flex items-center gap-1"
          aria-label="운영 메뉴 (모바일)"
        >
          {items.map((item) => renderTab(item, 'mobile'))}
        </ul>
      </div>
    </nav>
  );
}
