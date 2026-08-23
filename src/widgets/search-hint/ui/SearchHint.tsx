'use client';

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ListTree, RefreshCcw, Rotate3d, Search } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { ChromeChip } from '@/shared/ui/chrome-chip';
import { useMapArrangement, useView3d } from '@/shared/lib/appearance-preferences';
import { View3dMenu } from './View3dMenu';

interface Props {
  onOpenSearch: () => void;
  /** Auto-arrange trigger — reheats the topology physics. */
  onRelayout: () => void;
  /** Expands or collapses all deep-out parents at once. */
  onToggleExpandAll?: () => void;
  allExpanded?: boolean;
  density?: 'default' | 'compact-focus';
  /**
   * In selected-node focus, the popover takes input priority. At 1024px measured,
   * the 308px toolbar dropped to the second column from the right and overlapped
   * with the 352px detail panel. This lane retreats until there is 75px of clearance
   * before xl (1280px).
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
   * On wide screens, the right node inspector actually occupies the map width. It
   * moves to the center of the remaining area within the same map column so it does
   * not overlap with the inspector.
   */
  rightInspectorReserved?: boolean;
  /**
   * Path mode status chip (`TopologyPathChip`, analysis panel complete elimination phase 2 §b) —
   * satisfies the "next to top-center search" placement requirement by leveraging this
   * component's existing center-alignment calculation (`xl:left-1/2 xl:-translate-x-1/2`)
   * without new absolute position calculations. Rendered only when this slot exists — if
   * not in path mode, it is completely empty and identical to the previous search/sort
   * 2-button layout.
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
   * world as "Realm: {title} ✕" with ✕ returning to the full map. An empty slot costs
   * nothing to render.
   */
  realmChip?: ReactNode;
  /**
   * The "trail" chip (`TopologyTrailChip`) — the same "top-centre chrome column"
   * grammar as pathChip/realmChip. Rendered only with 2 or more session visits,
   * announcing the route taken as "Trail · N". An empty slot costs nothing to render.
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
 * top-right "workspace" chip (`HomePage`) later moved onto the same ChromeChip, so the
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
  // Map view — subscribe to both stored facts so the picker's Help names the
  // same Flat/Dome/Cloud arrangement that the canvas is currently drawing.
  const view3d = useView3d();
  const arrangement = useMapArrangement();
  const currentView = view3d ? arrangement : 'flat';
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
      // Overlap cleanup 2026-08-22 — top-center alignment is xl+ only. The lane
      // that joined with full expansion at 350px overlapped INDEX end (388) by 19px
      // at 1024px. Placed on the second column from the right (top 76px) below xl,
      // and returns to center from 1280.
      className={cn(
        "topology-ui-scale pointer-events-auto absolute right-4 top-[4.75rem] z-20 transition-[left] duration-[var(--agent-panel-reflow-duration)] ease-[var(--topology-motion-ease-out)] motion-reduce:transition-none md:right-6 xl:left-1/2 xl:right-auto xl:top-8 xl:-translate-x-1/2",
        // When both downgrades happen simultaneously, the stricter focus (<lg) wins —
        // applying both classes causes md:block to revive hidden at md, creating a conflict.
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
        {/* Auto-arrange — exposed on desktop only. On mobile, the visual weight of a
            floating button in the upper-right corner is a greater loss for an action
            used infrequently. Trigger it inside the graph control panel if needed. The
            wrapper's hidden/md:block handles visibility without clashing with ChromeChip's
            own display utility. */}
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
        {/* The map-view picker chooses Flat (the default) or one of the two 3D
            arrangements, Dome and Cloud. The active indigo tint states that a 3D
            arrangement is on (no second colour). Same <md demotion as auto-arrange. */}
        {/*
          The 3D chip **opens a picker rather than toggling** (owner instruction,
          2026-08-18: *"Pressing 3D should bring up a selection popup."* — pressing 3D should bring
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
            title={t('view3dPickerHelp', {
              view: t(`view3dChoice.${currentView}`),
            })}
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
