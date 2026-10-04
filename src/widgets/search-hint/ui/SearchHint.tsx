'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ListTree, Map as MapIcon, RefreshCcw, Search } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { CHROME_CHIP_COMPACT_BELOW_XL, ChromeChip } from '@/shared/ui/chrome-chip';
import { useDomainStructure, useHexBoard, useMapArrangement, useTerritories, useView3d } from '@/shared/lib/appearance-preferences';
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
   * In selected-node focus the popover takes input priority; below xl this lane
   * hides, or the toolbar overlaps the 352px detail panel.
   */
  phoneFocusSuppressed?: boolean;
  /**
   * Below `md` the expanded INDEX is a full-bleed sheet; with it open this lane
   * withdraws, as the utility lane does, or its top edge pokes out above the sheet.
   */
  phoneSheetSuppressed?: boolean;
  /**
   * Grid placement inside the map's top toolbar. `TopologyCommandChrome` owns
   * position, insets and the INDEX and inspector reserves; this lane only shrinks.
   */
  className?: string;
  /** Path mode status chip (`TopologyPathChip`), placed beside search by riding in this lane. */
  pathChip?: ReactNode;
  /** The insights deeplink return chip (`TopologyInsightsReturnChip`). */
  returnChip?: ReactNode;
  /** The realm status chip, present only while a realm is active. */
  realmChip?: ReactNode;
  /** The session trail chip (`TopologyTrailChip`). */
  trailChip?: ReactNode;
  /** Saved working scopes share this toolbar without owning its positioning. */
  constellationControl?: ReactNode;
}

const subscribe = () => () => {};
const getIsMac = () => /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);
const getIsMacServer = () => false;
const ARRANGE_FEEDBACK_MS = 950;

/** The map toolbar's tool lane: expand-all, auto-arrange, map view, scopes, search, then status chips. */
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
  // Every stored view fact, so the chip names the view the canvas is drawing.
  const view3d = useView3d();
  const structure = useDomainStructure();
  const territories = useTerritories();
  const hexBoard = useHexBoard();
  const arrangement = useMapArrangement();
  const currentView = view3d ? arrangement : hexBoard ? 'hex' : territories ? 'territories' : structure ? 'structure' : 'flat';
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
       * An item of the toolbar box, not a self-centred overlay: sharing one box with
       * the utility lane makes this lane truncate instead of drawing over it.
       */
      className={cn(
        /*
         * One row at every width, tools then chips; wrapping chips would stack the
         * toolbar over nodes the top reserve keeps clear. From `xl` it shares the utility
         * lane's line when it fits (`basis-0`, grow), else takes the next line whole.
         * Below `xl` it starts at the left and keeps out of the right rail's column,
         * or its search tile reads as part of that rail.
         */
        "pointer-events-auto min-w-0 max-w-full md:self-stretch md:max-xl:pr-[calc(var(--chrome-tile-size)+var(--topology-chrome-gap))] xl:min-w-min xl:basis-0 xl:grow",
        // Focus suppression wins over sheet suppression; both classes together let md:block revive the lane.
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
        {/* Desktop only; the wrapper hides it so ChromeChip's own display utility does not clash. */}
        {!structure && <div className="hidden md:block">
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
        </div>}
        {/* The map-view chip opens a picker, not a toggle: an on/off switch cannot name
            which of several views is showing (`View3dMenu` doc-block). */}
        {/* `view3dAnchorRef` hands the shared wrapper to the picker so a chip press is not
            "outside", or the chip closes and reopens the picker in one batch. */}
        <div
          ref={view3dAnchorRef}
          className="relative"
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
            active={view3d || structure}
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
          // The min-width and ⌘K cap wait for 2xl: at xl, English labels push the
          // reserved width into the right cluster.
          className={compact ? undefined : '2xl:min-w-[208px] max-2xl:[&_[data-chip-kbd]]:hidden'}
          aria-label={t('searchAriaLabel')}
          title={t('searchTitle')}
        >
          {t('searchLabel')}
        </ChromeChip>
        </div>
        {returnChip || realmChip || pathChip || trailChip ? (
          // The status chips are what yields. From `xl` the group takes its natural
          // width up to `max-w-md`, or the path chip shrinks to one letter; past that
          // each chip truncates its label (full text in hover and accessible name).
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
          // that decides from `xl` whether it shares the utility line, or every tile
          // jumps a line on a view change.
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
