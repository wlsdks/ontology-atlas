'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ListTree, Map as MapIcon, RefreshCcw, Search } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { CHROME_CHIP_COMPACT_BELOW_XL, ChromeChip } from '@/shared/ui/chrome-chip';
import { useGalaxy, useHexBoard, useMapArrangement, useTerritories, useView3d } from '@/shared/lib/appearance-preferences';
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
   * Grid placement inside the map's top toolbar. The toolbar
   * (`TopologyCommandChrome`) owns position, insets, scale and the reserves for
   * INDEX and the node inspector; this lane is only a row of controls that can
   * shrink.
   */
  className?: string;
  /**
   * Path mode status chip (`TopologyPathChip`, analysis panel complete elimination phase 2 §b) —
   * satisfies the "next to top-center search" placement requirement by riding in this
   * lane, which the top toolbar centres, without a position calculation of its own.
   * Rendered only when this slot exists — if
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
  /** Saved working scopes share this toolbar without owning its positioning. */
  constellationControl?: ReactNode;
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
  className,
  pathChip,
  returnChip,
  realmChip,
  trailChip,
  constellationControl,
}: Props) {
  const t = useTranslations('searchWidgets.hint');
  const isMac = useSyncExternalStore(subscribe, getIsMac, getIsMacServer);
  // Map view — subscribe to every stored fact so the compact picker names the
  // same Flat/Galaxy/Cone/Strata/Neural view the canvas is currently drawing.
  const view3d = useView3d();
  const galaxy = useGalaxy();
  const territories = useTerritories();
  const hexBoard = useHexBoard();
  const arrangement = useMapArrangement();
  const currentView = view3d ? arrangement : hexBoard ? 'hex' : territories ? 'territories' : galaxy ? 'galaxy' : 'flat';
  const [view3dMenuOpen, setView3dMenuOpen] = useState(false);
  const view3dAnchorRef = useRef<HTMLDivElement | null>(null);
  const view3dChipRef = useRef<HTMLButtonElement | null>(null);
  const view3dMenuId = useId();
  const [arranging, setArranging] = useState(false);
  const compact = density === 'compact-focus';

  useEffect(() => {
    if (!arranging) return;
    const timer = window.setTimeout(() => setArranging(false), ARRANGE_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [arranging]);

  return (
    <div
      /*
       * An item of the map's top toolbar, not an overlay of its own (owner report,
       * 2026-09-24). This lane
       * used to centre itself with `left-1/2 -translate-x-1/2` while the utility lane
       * pinned itself to the right edge: two boxes that never measured each other.
       * With the meaning-review panel open at 1512 the map column is 928px wide, the
       * centred lane (784px with a path chip and the trail chip) ran 136px into the
       * utility lane, and eight icons were drawn on top of one another. Inside one
       * box the utility lane keeps its width and this lane gets what is left, so it
       * truncates instead of overlapping.
       */
      className={cn(
        /*
         * **One row: the tools first, the status chips after them** (2026-09-25). The
         * lane used to enter the toolbar at its natural width, chips included, so when
         * the path and trail chips made it 12px wider than the free map beside the
         * utility lane (632 against 620 at 1512), the whole lane wrapped to a second
         * line, and choosing Galaxy (which hides expand-all) made it fit again, so every
         * tile jumped a line. Letting the chips wrap under the tools instead made the
         * toolbar three lines tall at 1040 and 1280 (a staircase over map nodes the
         * top reserve had promised to keep clear), and the same two chips sat side by
         * side at 1512 but one per line at 1280.
         *
         * So the lane is one row at every width and never a second one of its own: the
         * tools, then the chips. From `xl` the lane joins the utility lane's line
         * whenever its tools and its chips (capped, see the chip group) fit beside it
         * (`basis-0`, growing into the rest, never under its min-content), and
         * otherwise takes the next line whole, where the chips truncate.
         *
         * Below `xl`, where the lane is its own line under the utility lane, it spans
         * the free map and starts at its left edge, and it keeps out of the right
         * rail's column (one tile and one gap): right-aligned, its search tile stood
         * at 980–1016 directly above the rail's fit tile at 1040 and read as part of
         * that rail. The box, not this lane, keeps the collapsed INDEX tab clear.
         */
        "pointer-events-auto min-w-0 max-w-full md:self-stretch md:max-xl:pr-[calc(var(--chrome-tile-size)+var(--topology-chrome-gap))] xl:min-w-min xl:basis-0 xl:grow",
        // When both downgrades happen simultaneously, the stricter focus (<lg) wins —
        // applying both classes causes md:block to revive hidden at md, creating a conflict.
        phoneFocusSuppressed
          ? "hidden xl:block"
          : phoneSheetSuppressed
            ? "hidden md:block"
            : undefined,
        className,
      )}
      data-testid="topology-search-action-lane"
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
      <div className="flex min-w-0 items-center justify-end gap-[var(--topology-chrome-gap)] md:justify-start">
        <div className="flex shrink-0 items-center gap-[var(--topology-chrome-gap)]" data-testid="topology-tool-tile-group">
        {onToggleExpandAll ? (
          <div className="hidden md:block">
            <ChromeChip
              type="button"
              onClick={onToggleExpandAll}
              aria-pressed={allExpanded}
              aria-label={`${t(allExpanded ? 'collapseAllLabel' : 'expandAllLabel')} — ${t(allExpanded ? 'collapseAllAriaLabel' : 'expandAllAriaLabel')}`}
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
        {/* The map-view picker chooses Flat (the default), Galaxy, or one of the
            three 3D arrangements. The label names the current view while the active
            indigo tint states that a spatial presentation is on. Same <md demotion
            as auto-arrange. */}
        {/*
          The map-view chip **opens a picker rather than toggling** (owner instruction,
          2026-08-18: *"Pressing 3D should bring up a selection popup."* — pressing 3D should bring
          up a selection popup). With several presentations inside the picker, an on/off toggle
          cannot say 「what am I looking at」 — the rationale and the three reasons are in
          the `View3dMenu` doc-block.
        */}
        {/* The chip and its picker share one wrapper, and `view3dAnchorRef` hands that
            wrapper to the picker so a press on the chip is not treated as 「outside」 —
            without it the chip closed and reopened the picker in the same batch and
            could never put it away (`View3dMenu`'s dismissal block). */}
        <div
          ref={view3dAnchorRef}
          className="relative hidden md:block"
          data-lane-popover={view3dMenuOpen ? 'open' : undefined}
        >
          <ChromeChip
            type="button"
            ref={view3dChipRef}
            onClick={() => setView3dMenuOpen((open) => !open)}
            // A disclosure of a labelled radiogroup, not a menu: `aria-haspopup="menu"`
            // promised menu items and arrow keys from the chip that the picker never had
            // (its items are radios). The chip says it expands, and which group it shows.
            aria-expanded={view3dMenuOpen}
            aria-controls={view3dMenuId}
            data-testid="topology-view-3d"
            data-view-3d={view3d ? 'true' : 'false'}
            data-map-view={currentView}
            data-utility-action-token-contract="support-surface-family"
            data-utility-action-surface-token="--chrome-surface"
            data-utility-action-border-token="--chrome-border"
            data-utility-action-hover-surface-token="--color-overlay-2"
            data-utility-action-active-surface-token="--chrome-active-surface"
            data-utility-action-active-border-token="--chrome-active-border"
            data-utility-action-shadow-token="--chrome-shadow"
            data-utility-action-focus-ring-token="--color-indigo-accent"
            icon={<MapIcon />}
            active={view3d || galaxy}
            // Icon-first with the rest of the lane in the crowded density (dock or
            // review panel open); the current view stays in the name and tooltip.
            compact={compact}
            className={`max-xl:[&_[data-chip-label]]:hidden ${CHROME_CHIP_COMPACT_BELOW_XL}`}
            aria-label={`${t('mapViewAriaLabel')}: ${t(`view3dChoice.${currentView}`)}`}
            title={t('view3dPickerHelp', {
              view: t(`view3dChoice.${currentView}`),
            })}
          >
            {t(`view3dChoice.${currentView}`)}
          </ChromeChip>
          <View3dMenu
            open={view3dMenuOpen}
            onClose={(returnFocus) => {
              setView3dMenuOpen(false);
              // A choice or Escape hands focus back to the chip that opened the picker;
              // a press elsewhere keeps it where that press put it.
              if (returnFocus) view3dChipRef.current?.focus();
            }}
            anchorRef={view3dAnchorRef}
            groupId={view3dMenuId}
          />
        </div>
        {constellationControl}
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
        {returnChip || realmChip || pathChip || trailChip ? (
          // The status chips are the part of the row that yields. From `xl` the
          // group asks for its natural width up to a cap (`max-w-md`, which also caps
          // what it adds to the lane's min-content), so on the utility lane's line
          // the chips read whole: with no width of its own the group left the path
          // chip one letter and an ellipsis at 1280. Past the cap, or on a line of its own
          // below `xl`, each chip truncates its own label (the full text stays on
          // hover and in its accessible name), and the tool tiles keep their 36px
          // boxes and their place at every width.
          <div
            className="flex min-w-0 items-center gap-[var(--topology-chrome-gap)] xl:max-w-md"
            data-testid="topology-status-chip-group"
          >
            {returnChip}
            {realmChip}
            {pathChip}
            {trailChip}
          </div>
        ) : null}
        {!onToggleExpandAll ? (
          // Galaxy hides expand-all, and the lane's width decides from `xl` whether it
          // shares the utility lane's line. Without this the lane shrank by one tile,
          // fitted where it had not, and every tile jumped a line on a view change
          // (1920 with INDEX open, 2026-09-25). An invisible copy at the row's end, 0px
          // tall and out of the tab order, keeps the width the decision reads; it sits
          // in space the lane's grow fills anyway, so nothing visible moves.
          <div
            aria-hidden="true"
            inert
            className="pointer-events-none invisible hidden h-0 shrink-0 overflow-hidden md:block"
            data-testid="topology-expand-all-reserve"
          >
            <ChromeChip type="button" tabIndex={-1} icon={<ListTree />} compact={compact}>
              {t('expandAllLabel')}
            </ChromeChip>
          </div>
        ) : null}
      </div>
    </div>
  );
}
