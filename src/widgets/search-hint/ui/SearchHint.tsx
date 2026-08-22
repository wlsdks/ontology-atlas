'use client';

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ListTree, RefreshCcw, Rotate3d, Search } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { ChromeChip } from '@/shared/ui/chrome-chip';
import { useView3d } from '@/shared/lib/appearance-preferences';
import { View3dMenu } from './View3dMenu';

interface Props {
  onOpenSearch: () => void;
  /** 자동 정렬 트리거 — 토폴로지 physics reheat. */
  onRelayout: () => void;
  /** 모든 고팬아웃 부모를 한 번에 펼치거나 다시 접는다. */
  onToggleExpandAll?: () => void;
  allExpanded?: boolean;
  density?: 'default' | 'compact-focus';
  /**
   * Selected-node focus 에서는 popover 가 입력 우선권을 가진다. 1024px 실측에서
   * 우측 두 번째 줄로 내려온 308px 도구줄이 352px 상세 패널과 겹쳤다. 두 표면
   * 사이에 75px 여유가 생기는 xl(1280px) 전까지 이 레인은 물러난다.
   */
  phoneFocusSuppressed?: boolean;
  /**
   * `<md` 확장 INDEX = 풀-블리드 시트 (반응형 감사 rank7). 시트가 주 표면인
   * 동안 상단 크롬은 시트 뒤에 깔린 채 상단 8px 만 삐져나와 보였다(겹침
   * 소탕 실측 600×900). 시트가 열려 있으면 이 레인은 <md 에서 완전히
   * 물러난다 — utility lane 과 같은 "시트가 주 표면, 크롬은 강등" 문법.
   */
  phoneSheetSuppressed?: boolean;
  /**
   * 넓은 화면의 우측 node inspector가 지도 폭을 실제로 차지하는 상태. 같은
   * 지도 컬럼 안에서 남은 영역의 중앙으로 이동해 inspector와 겹치지 않는다.
   */
  rightInspectorReserved?: boolean;
  /**
   * path 모드 상태 칩(`TopologyPathChip`, 분석 패널 완전 소멸 2단계 §b) —
   * "상단 중앙 검색 옆"이라는 배치 요구를 이 컴포넌트의 기존 중앙 정렬
   * 계산(`xl:left-1/2 xl:-translate-x-1/2`)에 얹어 새 절대 위치 계산 없이
   * 만족한다. 이 슬롯이 있을 때만 렌더 — path 모드가 아니면 완전히 비어
   * 기존 검색/정렬 2버튼 레이아웃과 동일하다.
   */
  pathChip?: ReactNode;
  /**
   * 인사이트발 딥링크 복귀 칩(`TopologyInsightsReturnChip`) — pathChip 과 같은
   * "상단 중앙 크롬 열" 문법. 두 칩이 공존해도 같은 flex 열 안에 grouped 로
   * 남아 부유 패널이 늘지 않는다. 슬롯이 비면 렌더 비용 0.
   */
  returnChip?: ReactNode;
  /**
   * S4 "영역 전개" 상태 칩 — pathChip/returnChip 과 같은 "상단 중앙 크롬 열"
   * 문법. 영역 활성일 때만 렌더돼 "영역: {title} ✕" 로 현재 세계를 알리고
   * ✕ 로 전체 지도 복귀한다. 슬롯이 비면 렌더 비용 0.
   */
  realmChip?: ReactNode;
  /**
   * "걸어온 길" 칩(`TopologyTrailChip`, fable 설계) — pathChip/realmChip 과
   * 같은 "상단 중앙 크롬 열" 문법. 세션 방문이 2개 이상일 때만 렌더돼
   * "걸어온 길 · N" 으로 지나온 경로를 알린다. 슬롯이 비면 렌더 비용 0.
   */
  trailChip?: ReactNode;
}

const subscribe = () => () => {};
const getIsMac = () => /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);
const getIsMacServer = () => false;
const ARRANGE_FEEDBACK_MS = 950;

/**
 * 상단 중앙 툴바. 자동 정렬 · 검색 2버튼.
 * glassmorphism(backdrop-blur) 금지 룰 준수 — solid panel bg만 사용.
 *
 * feat/chrome-system §6 — ChromeChip(44px·10px radius) 재스킨. 우상단
 * "작업공간" 칩(`HomePage`)도 이후 슬라이스에서 같은 ChromeChip 으로
 * 이관되어 상단 열 전체가 44px 로 수렴했다(feat/chrome-finish — 남은
 * TopologyReviewLink/Create-Node 버튼의 --topology-utility-lane-height
 * 잔재도 같은 슬라이스에서 --chrome-tile-size 로 정리).
 */
export function SearchHint({
  onOpenSearch,
  onRelayout,
  onToggleExpandAll,
  allExpanded = false,
  density = 'default',
  phoneFocusSuppressed = false,
  phoneSheetSuppressed = false,
  rightInspectorReserved = false,
  pathChip,
  returnChip,
  realmChip,
  trailChip,
}: Props) {
  const t = useTranslations('searchWidgets.hint');
  const isMac = useSyncExternalStore(subscribe, getIsMac, getIsMacServer);
  // 3D 보기 — 스토어를 직접 구독해 지도 캔버스(HomePage 경유)와 lockstep 토글.
  const view3d = useView3d();
  const [view3dMenuOpen, setView3dMenuOpen] = useState(false);
  const [arranging, setArranging] = useState(false);
  const compact = density === 'compact-focus';

  useEffect(() => {
    if (!arranging) return;
    const timer = window.setTimeout(() => setArranging(false), ARRANGE_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [arranging]);

  return (
    <div
      // 겹침 소탕 2026-08-22 — 상단 중앙 정렬은 xl+ 부터만. 전체 펼치기가
      // 합류한 350px 레인은 1024에서 INDEX 끝(388)과 19px 겹쳤다. <xl에서는
      // 우측 두 번째 줄(top 76px)에 두고, 1280부터 가운데로 돌아간다.
      className={cn(
        "topology-ui-scale pointer-events-auto absolute right-4 top-[4.75rem] z-20 transition-[left] duration-[var(--agent-panel-reflow-duration)] ease-[var(--topology-motion-ease-out)] motion-reduce:transition-none md:right-6 xl:left-1/2 xl:right-auto xl:top-8 xl:-translate-x-1/2",
        // 두 강등이 동시일 땐 더 엄격한 focus(<lg)가 이긴다 — 두 클래스를
        // 같이 얹으면 md:block 이 hidden 을 md 에서 되살려 충돌한다.
        phoneFocusSuppressed
          ? "hidden xl:block"
          : phoneSheetSuppressed
            ? "hidden md:block"
            : undefined,
      )}
      data-testid="topology-search-action-lane"
      data-right-inspector-reserve={
        rightInspectorReserved ? "recenter-in-remaining-map" : undefined
      }
      data-search-lane-density={density}
      data-search-lane-contract={
        compact ? 'icon-first-focus-search' : 'labeled-search-utility'
      }
      data-phone-focus-utility-contract={
        phoneFocusSuppressed ? "hidden-below-xl-while-node-popover-owns-focus" : undefined
      }
      data-phone-sheet-utility-contract={
        phoneSheetSuppressed ? "hidden-below-md-while-index-sheet-owns-surface" : undefined
      }
      data-search-lane-compact-width-token={
        compact ? '--topology-search-lane-compact-width' : undefined
      }
      data-search-lane-surface-token="--chrome-surface"
      data-search-lane-border-token="--chrome-border"
      data-search-lane-shadow-token="--chrome-shadow"
    >
      <div className="flex items-center gap-2">
        {returnChip}
        {realmChip}
        {pathChip}
        {trailChip}
        {onToggleExpandAll ? (
          <div className="hidden md:block">
            <ChromeChip
              type="button"
              onClick={onToggleExpandAll}
              aria-pressed={allExpanded}
              aria-label={t(allExpanded ? 'collapseAllAriaLabel' : 'expandAllAriaLabel')}
              title={t(allExpanded ? 'collapseAllTitle' : 'expandAllTitle')}
              data-testid="topology-expand-all"
              data-utility-action-token-contract="support-surface-family"
              data-utility-action-surface-token="--chrome-surface"
              data-utility-action-border-token="--chrome-border"
              data-utility-action-hover-surface-token="--color-overlay-2"
              data-utility-action-active-surface-token="--chrome-active-surface"
              data-utility-action-active-border-token="--chrome-active-border"
              data-utility-action-shadow-token="--chrome-shadow"
              data-utility-action-focus-ring-token="--color-indigo-accent"
              icon={<ListTree />}
              active={allExpanded}
              compact={compact}
            >
              {t(allExpanded ? 'collapseAllLabel' : 'expandAllLabel')}
            </ChromeChip>
          </div>
        ) : null}
        {/* 자동 정렬 — 데스크톱에서만 노출. 모바일에서는 자주 안 쓰는 액션이라
            우상단 floating 버튼이 시각적 무게를 잡아먹는 게 더 큰 손실. 필요하면
            그래프 컨트롤 패널 안에서 트리거. wrapper 의 hidden/md:block 이
            표시 여부를 맡아 ChromeChip 자체 display 유틸과 안 부딪힌다. */}
        <div className="hidden md:block">
          <ChromeChip
            type="button"
            onClick={() => {
              setArranging(true);
              onRelayout();
            }}
            data-testid="topology-auto-arrange"
            data-arranging={arranging ? 'true' : 'false'}
            data-utility-action-token-contract="support-surface-family"
            data-utility-action-surface-token="--chrome-surface"
            data-utility-action-border-token="--chrome-border"
            data-utility-action-hover-surface-token="--color-overlay-2"
            data-utility-action-active-surface-token="--chrome-active-surface"
            data-utility-action-active-border-token="--chrome-active-border"
            data-utility-action-shadow-token="--chrome-shadow"
            data-utility-action-focus-ring-token="--color-indigo-accent"
            icon={<RefreshCcw className={cn(arranging && 'motion-safe:animate-spin')} />}
            active={arranging}
            compact={compact}
            aria-label={t('relayoutAriaLabel')}
            title={t('relayoutTitle')}
          >
            {arranging ? t('relayoutActiveLabel') : t('relayoutLabel')}
          </ChromeChip>
        </div>
        {/* 3D — 지도를 kind 링의 돔으로 다시 배치하는 옵트인 뷰(2026-08-18
            소유자 지시 — 설정 시트가 아니라 이 툴바를 가리켰다). 지도 뷰는
            2D(기본)/3D 딱 둘이고 토글 자리는 여기 하나다. active 인디고 틴트가
            켜짐 상태를 말한다(제2 채색 없음). 자동 정렬과 같은 <md 강등. */}
        {/*
          3D 칩은 **토글이 아니라 고르개를 연다** (2026-08-18 소유자 지시:
          *"3D누르면 선택 팝업이 나오게 해야지?"*). 3D 에 배치가 둘 생기면서
          켬/끔 토글로는 「지금 무엇을 보고 있나」를 말할 수 없게 됐다 —
          근거와 세 줄의 이유는 `View3dMenu` 독블록.
        */}
        <div className="relative hidden md:block">
          <ChromeChip
            type="button"
            onClick={() => setView3dMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={view3dMenuOpen}
            data-testid="topology-view-3d"
            data-view-3d={view3d ? 'true' : 'false'}
            data-utility-action-token-contract="support-surface-family"
            data-utility-action-surface-token="--chrome-surface"
            data-utility-action-border-token="--chrome-border"
            data-utility-action-hover-surface-token="--color-overlay-2"
            data-utility-action-active-surface-token="--chrome-active-surface"
            data-utility-action-active-border-token="--chrome-active-border"
            data-utility-action-shadow-token="--chrome-shadow"
            data-utility-action-focus-ring-token="--color-indigo-accent"
            icon={<Rotate3d />}
            active={view3d}
            compact={compact}
            aria-label={t('view3dAriaLabel')}
            title={view3d ? t('view3dTitleOn') : t('view3dTitleOff')}
          >
            {t('view3dLabel')}
          </ChromeChip>
          <View3dMenu open={view3dMenuOpen} onClose={() => setView3dMenuOpen(false)} />
        </div>
        <ChromeChip
          type="button"
          onClick={onOpenSearch}
          data-testid="topology-concept-search"
          data-utility-action-token-contract="support-surface-family"
          data-utility-action-surface-token="--chrome-surface"
          data-utility-action-border-token="--chrome-border"
          data-utility-action-hover-surface-token="--color-overlay-2"
          data-utility-action-shadow-token="--chrome-shadow"
          data-utility-action-focus-ring-token="--color-indigo-accent"
          compact={compact}
          icon={<Search />}
          kbd={isMac ? '⌘K' : 'CtrlK'}
          // 검수 1바퀴 결함 1 (2026-07-23) — EN 로케일 1440 폭에서 중앙 레인의
          // 오른끝(검색 필)이 우측 클러스터("Switch to my data")와 겹쳤다.
          // 영어 라벨이 길어질 때 예약 폭이 밀어내는 문제라, min-width 와 ⌘K
          // 캡 예약을 2xl(1536+ — 1440 은 xl 이라 겹침 구간)부터로 미룬다.
          className={compact ? undefined : '2xl:min-w-[208px] max-2xl:[&_[data-chip-kbd]]:hidden'}
          aria-label={t('searchAriaLabel')}
          title={t('searchTitle')}
        >
          {t('searchLabel')}
        </ChromeChip>
      </div>
    </div>
  );
}
