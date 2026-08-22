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
  /** Auto-arrange trigger — reheats the topology physics. */
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
   * Below `md` the expanded INDEX is a full-bleed sheet (responsive audit rank7).
   * While the sheet was the primary surface, the top chrome lay behind it with only
   * its top 8px poking out (overlap sweep, measured at 600×900). With the sheet open
   * this lane withdraws entirely below `md` — the same "sheet is primary, chrome
   * demotes" grammar as the utility lane.
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
   * The insights deeplink return chip (`TopologyInsightsReturnChip`) — the same
   * "top-centre chrome column" grammar as pathChip. With both present they stay grouped
   * in the same flex column, so no floating panel is added. An empty slot costs nothing
   * to render.
   */
  returnChip?: ReactNode;
  /**
   * The S4 "realm expansion" status chip — the same "top-centre chrome column" grammar
   * as pathChip/returnChip. Rendered only while a realm is active, announcing the current
   * world as "영역: {title} ✕" with ✕ returning to the full map. An empty slot costs
   * nothing to render.
   */
  realmChip?: ReactNode;
  /**
   * The "걸어온 길" (trail) chip (`TopologyTrailChip`) — the same "top-centre chrome
   * column" grammar as pathChip/realmChip. Rendered only with 2 or more session visits,
   * announcing the route taken as "걸어온 길 · N". An empty slot costs nothing to render.
   */
  trailChip?: ReactNode;
}

const subscribe = () => () => {};
const getIsMac = () => /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);
const getIsMacServer = () => false;
const ARRANGE_FEEDBACK_MS = 950;

/**
 * The top-centre toolbar — two buttons, auto-arrange and search. It honours the
 * glassmorphism (backdrop-blur) ban and uses a solid panel background only.
 *
 * feat/chrome-system §6 — reskinned as ChromeChip (44px, 10px radius). The
 * top-right 「작업공간」 chip (`HomePage`) later moved onto the same ChromeChip, so the
 * whole top row converged on 44px (feat/chrome-finish, which also cleaned the
 * remaining TopologyReviewLink/Create-Node buttons' `--topology-utility-lane-height`
 * leftovers over to `--chrome-tile-size`).
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
  // 3D view — subscribes to the store directly so it toggles in lockstep with the map canvas (via HomePage).
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
        {/* 3D — the opt-in view that rearranges the map into a dome of kind rings
            (2026-08-18 owner instruction, which pointed at this toolbar rather than the
            settings sheet). The map has exactly two views, 2D (default) and 3D, and this
            is the one place it toggles. The active indigo tint states that it is on (no
            second colour). Same <md demotion as auto-arrange. */}
        {/*
          The 3D chip **opens a picker rather than toggling** (owner instruction,
          2026-08-18: *"3D누르면 선택 팝업이 나오게 해야지?"* — pressing 3D should bring
          up a selection popup). With two arrangements inside 3D, an on/off toggle can no
          longer say 「what am I looking at」 — the rationale and the three reasons are in
          the `View3dMenu` doc-block.
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
          // Review round defect 1 (2026-07-23) — at 1440 width in the EN locale, the
          // centre lane's right end (the search pill) overlapped the right cluster
          // ("Switch to my data"). It is the reserved width pushing out as English
          // labels grow, so the min-width and the ⌘K cap reservation are deferred to
          // 2xl (1536+ — 1440 is xl, the overlapping band).
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
