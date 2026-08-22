'use client';

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { RefreshCcw, Rotate3d, Search } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { ChromeChip } from '@/shared/ui/chrome-chip';
import { useView3d } from '@/shared/lib/appearance-preferences';
import { View3dMenu } from './View3dMenu';

interface Props {
  onOpenSearch: () => void;
  /** Auto-arrange trigger — reheats the topology physics. */
  onRelayout: () => void;
  density?: 'default' | 'compact-focus';
  /**
   * With a node focused, the popover takes input priority. The node popover occupies
   * the top centre below `lg` (fixed inset-x-3 top-[72px]), so this lane withdraws over
   * the same band — widened from <md to <lg in the 2026-07-23 overlap sweep, because
   * the lane itself drops to the right in 2 rows below `lg` and overlaps the popover.
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
   * The path-mode status chip (`TopologyPathChip`). Its placement requirement — "beside
   * the top-centre search" — is satisfied by riding this component's existing centring
   * calculation (`md:left-1/2 md:-translate-x-1/2`) with no new absolute positioning.
   * Rendered only when the slot is filled; outside path mode it is entirely empty and
   * the layout matches the previous two-button search/arrange row.
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
  density = 'default',
  phoneFocusSuppressed = false,
  phoneSheetSuppressed = false,
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
      // Overlap sweep 2026-07-23 (Image #9) — top-centre alignment applies from `lg`
      // only. Below `lg` the centre lane collided three ways with the expanded INDEX
      // (300px on the left) and the right utility lane (measured at 768: search lane
      // 251–556 × INDEX 24–324 × lane 245–744). The existing <md phone grammar (right
      // column, 2 rows, top-[4.75rem] = 24px chrome inset + 44px tile + 8px gap)
      // widens to the whole band below `lg`.
      className={cn(
        "topology-ui-scale pointer-events-auto absolute right-4 top-[4.75rem] z-20 md:right-6 lg:left-1/2 lg:right-auto lg:top-6 lg:-translate-x-1/2 xl:top-8",
      // When both demotions apply at once, the stricter focus one (<lg) wins — laying
      // both classes on together lets md:block revive hidden at md and they collide.
        phoneFocusSuppressed
          ? "hidden lg:block"
          : phoneSheetSuppressed
            ? "hidden md:block"
            : undefined,
      )}
      data-testid="topology-search-action-lane"
      data-search-lane-density={density}
      data-search-lane-contract={
        compact ? 'icon-first-focus-search' : 'labeled-search-utility'
      }
      data-phone-focus-utility-contract={
        phoneFocusSuppressed ? "hidden-below-lg-while-node-popover-owns-focus" : undefined
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
        {/* Auto-arrange — desktop only. On mobile it is a rarely used action, so a
            floating top-right button eating visual weight is the bigger loss; trigger
            it from inside the graph controls panel when needed. The wrapper's
            hidden/md:block owns visibility so it does not clash with ChromeChip's own
            display utilities. */}
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
