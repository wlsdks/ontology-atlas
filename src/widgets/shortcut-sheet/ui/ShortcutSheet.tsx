"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useSearchParams } from 'next/navigation';
import {
  DESTINATION_IDS,
  DESTINATION_KEY,
  NAV_LEADER_KEY,
} from "@/shared/config/destinations";
import { CloseButton } from "@/shared/ui/close-button";
import {
  EXIT_TRANSITION,
  MOTION,
  OVERLAY_SPRING_REDUCED,
  SHEET_RISE,
  SHEET_RISE_REDUCED,
  SHEET_SETTLED,
  useExitLockout,
} from '@/shared/motion';
import { mergeRefs } from "@/shared/lib/merge-refs";
import { useBodyScrollLock } from "@/shared/lib/use-body-scroll-lock";
import { usePathname } from "@/i18n/navigation";
import { cn } from "@/shared/lib/cn";
import { controlClass } from "@/shared/ui/control-class";
import { useRelationVocabulary } from "@/entities/knowledge-graph";
import {
  SHORTCUT_SCOPES,
  sectionVisible,
  sectionVisibleForCurrent,
  surfaceForPathname,
  type ShortcutScope,
  type ShortcutSurface,
} from "../lib/shortcut-scope";

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * Selector for the control to hand the keyboard back to; the opening button usually unmounts as
   * the sheet rises, so a name survives where a reference would not. Omitted, focus falls back to
   * the start of the content.
   */
  returnFocusSelector?: string;
}

type ShortcutKey = string | { i18nKey: string };

interface ShortcutRow {
  keys: ShortcutKey[];
  labelKey: string;
}

interface ShortcutSection {
  titleKey: string;
  /** The surface this section applies to — the source of truth for contextual tab classification. */
  surface: ShortcutSurface;
  /**
   * CSS selector for the control these keys drive; the current-screen tab drops a section whose
   * control is not on screen. The All tab still lists it.
   */
  requiresOnScreen?: string;
  rows: ShortcutRow[];
}

const k = (i18nKey: string): ShortcutKey => ({ i18nKey });

/** Which `requiresOnScreen` controls are drawn now, read on the open transition. */
function sectionsOnScreen(): readonly string[] {
  if (typeof document === "undefined") return [];
  const needed = new Set(
    SECTIONS.map((section) => section.requiresOnScreen).filter((selector): selector is string => selector !== undefined),
  );
  return [...needed].filter((selector) => document.querySelector(selector) !== null);
}

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Glossary terms shown under the shortcut list rather than on a new surface: ontology first, then
 * the map's kind order.
 */
// `nodeNumber` explains once why the map's engraved count differs from the total concept count:
// they count different scopes.
const GLOSSARY_TERMS = [
  "ontology",
  "domain",
  "capability",
  "element",
  "evidence",
  "nodeNumber",
] as const;

function ShortcutRelationGuide({ title }: { title: string }) {
  const relationVocabulary = useRelationVocabulary();
  return (
    <section data-testid="shortcut-sheet-relation-guide">
      <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
        {title}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-body text-[color:var(--color-text-tertiary)]">
        <span className="flex items-center gap-2">
          <span aria-hidden className="relative h-2.5 w-8 shrink-0">
            <span className="absolute left-0 right-1 top-1/2 h-px -translate-y-1/2 rounded-full bg-[color:var(--topology-relation-spine-halo)]" />
            <span className="absolute right-0 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-[color:var(--topology-relation-spine-terminal)]" />
          </span>
          {relationVocabulary("contains", "formal")}
        </span>
        <span className="flex items-center gap-2">
          {/*
           * The swatches are enlarged so depends (tapered) and related_to (uniform) are
           * distinguishable; the canvas encoding is unchanged.
           */}
          <span
            aria-hidden
            className="h-1.5 w-10 shrink-0"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, var(--topology-relation-spine-halo) 0 4px, transparent 4px 7px)",
              clipPath: "polygon(0 0, 100% 38%, 100% 62%, 0 100%)",
            }}
          />
          {relationVocabulary("depends_on", "formal")}
        </span>
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className="h-[2px] w-10 shrink-0 rounded-full"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, var(--topology-relation-spine-halo) 0 4px, transparent 4px 7px)",
            }}
          />
          {relationVocabulary("related_to", "formal")}
        </span>
      </div>
    </section>
  );
}

/**
 * Navigation rows generated from `DESTINATION_KEY`, so the sheet cannot advertise keys that do not
 * exist.
 */
const DESTINATION_ROWS: ShortcutRow[] = DESTINATION_IDS.map((id) => ({
  keys: [NAV_LEADER_KEY.toUpperCase(), DESTINATION_KEY[id].toUpperCase()],
  labelKey: `goTo_${id}`,
}));

const SECTIONS: ShortcutSection[] = [
  {
    /*
     * Every row here works on every screen that opens this sheet: Cmd+K is one row (Shift
     * accepted), `D` lives in the map section, and the shell answers Cmd+K and `?` elsewhere
     * (`shared/lib/shell-key-claims.ts`).
     */
    titleKey: "navigation",
    surface: "global",
    rows: [
      ...DESTINATION_ROWS,
      { keys: ["⌘", "K"], labelKey: "openSearchPalette" },
      { keys: ["⌘", ","], labelKey: "openSettings" },
      { keys: ["?"], labelKey: "showShortcuts" },
      { keys: ["Esc"], labelKey: "stepCloseOverlays" },
    ],
  },
  {
    // Lists only what the canvas implements (`use-topology-loop.ts`,
    // `topology-pointer-handlers.ts`): click, drag, wheel zoom and right-click menu. Cmd+K and
    // Escape belong to the Navigation section; `D` is here because only the map binds it.
    titleKey: "topology",
    surface: "topology",
    rows: [
      /*
       * Arrow-key walking, taught here because this sheet is the only keyboard teacher
       * (`tests/e2e/map-keyboard-walk.spec.ts`).
       */
      { keys: ["↑", "↓", "←", "→"], labelKey: "walkNeighbors" },
      { keys: [k("click")], labelKey: "clickSelect" },
      { keys: [k("drag")], labelKey: "dragPan" },
      { keys: [k("scroll")], labelKey: "wheelZoom" },
      { keys: ["+", "−"], labelKey: "keyZoom" },
      { keys: ["0"], labelKey: "keyFit" },
      { keys: [k("rightClick")], labelKey: "rightClickContext" },
      { keys: ["D"], labelKey: "toggleDocsDrawer" },
    ],
  },
  {
    titleKey: "searchPalette",
    surface: "global",
    rows: [
      { keys: ["↑", "↓"], labelKey: "moveBetweenResults" },
      { keys: ["↵"], labelKey: "openSelectedResult" },
      { keys: ["Esc"], labelKey: "close" },
    ],
  },
  {
    titleKey: "hubRail",
    surface: "topology",
    // The rail draws only with hub projects and the left panel collapsed or the drawer open, never
    // below `md`.
    requiresOnScreen: '[data-testid="topology-hub-rail"]',
    rows: [
      { keys: ["↑", "↓"], labelKey: "prevHub" },
      { keys: ["Home"], labelKey: "firstHub" },
      { keys: ["End"], labelKey: "lastHub" },
    ],
  },
  {
    titleKey: "docsPalette",
    surface: "docs",
    rows: [
      { keys: ["⌘", "K"], labelKey: "openPaletteSearchCmdTag" },
      { keys: ["⌘", "P"], labelKey: "openPaletteAlias" },
      { keys: ["⌘", "O"], labelKey: "openPaletteAlias" },
      { keys: ["⌘", "⇧", "P"], labelKey: "openCommandMode" },
      { keys: ["/"], labelKey: "openPalette" },
      { keys: [k("queryCommandPrefix")], labelKey: "queryCommandPrefix" },
      { keys: ["#"], labelKey: "queryTagPrefix" },
      { keys: ["Tab"], labelKey: "cyclePaletteMode" },
      { keys: ["↑", "↓", "↵", "Esc"], labelKey: "moveExecuteClose" },
      { keys: [k("scroll")], labelKey: "scrollHeading" },
      { keys: [k("click")], labelKey: "clickToc" },
    ],
  },
  {
    titleKey: "docsGraph",
    surface: "docs",
    rows: [
      { keys: [k("click")], labelKey: "clickGraphNode" },
      { keys: [k("drag")], labelKey: "dragGraphNode" },
      { keys: [k("hover")], labelKey: "hoverNeighbor" },
      { keys: [k("fullNeighbor")], labelKey: "toggleFullNeighbor" },
      { keys: [k("pillView")], labelKey: "togglePillView" },
    ],
  },
  {
    titleKey: "docsSource",
    surface: "docs",
    rows: [
      { keys: [k("server")], labelKey: "serverBundle" },
      { keys: [k("local")], labelKey: "localVault" },
      { keys: ["↻"], labelKey: "manualRefresh" },
      { keys: [k("focus")], labelKey: "focusRefresh" },
    ],
  },
  {
    titleKey: "docsActions",
    surface: "docs",
    rows: [
      { keys: ["⭐"], labelKey: "pinDoc" },
      { keys: ["🔗"], labelKey: "copyDocUrl" },
      { keys: ["#"], labelKey: "tagFilter" },
      { keys: [k("modeToggle")], labelKey: "modeToggle" },
    ],
  },
];

export function ShortcutSheet({ open, onClose, returnFocusSelector }: Props) {
  const t = useTranslations("searchWidgets.shortcuts");
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const currentSurface = surfaceForPathname(pathname, searchParams?.get('tab') ?? null);
  // Defaults to the current screen: what can be pressed now comes first, and the All tab keeps the
  // full list.
  const [scope, setScope] = useState<ShortcutScope>("current");
  const [wasOpen, setWasOpen] = useState(open);
  // Read once as the sheet opens: a section is on the current-screen tab only when its control is
  // on screen behind the sheet.
  const [onScreen, setOnScreen] = useState<readonly string[]>([]);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setScope("current");
      setOnScreen(sectionsOnScreen());
    }
  }
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useBodyScrollLock(open);

  const visibleSections = useMemo(
    () =>
      SECTIONS.filter((section) => {
        if (scope !== "current") return sectionVisible(scope, section.surface);
        if (!sectionVisibleForCurrent(currentSurface, section.surface)) return false;
        return section.requiresOnScreen === undefined || onScreen.includes(section.requiresOnScreen);
      }),
    [scope, currentSurface, onScreen],
  );
  /*
   * The tab named after the current surface is dropped when "This screen" already shows the same
   * sections.
   */
  const scopes = SHORTCUT_SCOPES.filter((key) => key !== currentSurface);
  const showRelationGuide =
    currentSurface === "topology" && (scope === "current" || scope === "topology" || scope === "all");
  /** On the current-screen tab with nothing but global sections — say so quietly. */
  const currentHasOwnSections =
    scope !== "current" || visibleSections.some((s) => s.surface !== "global");

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    /**
     * Do not record `<body>` as the restore target: the opener unmounts as the sheet appears, so
     * activeElement is already body here.
     */
    const active = document.activeElement;
    previousFocusRef.current =
      active instanceof HTMLElement && active !== document.body ? active : null;
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();

    const trapHandler = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => !el.hasAttribute("disabled"));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", trapHandler);
    return () => {
      window.removeEventListener("keydown", trapHandler);
      /**
       * When the opener is gone, focus the start of the content (`<main>`) instead of `body`, which
       * would restart Tab from the page top.
       */
      const previous = previousFocusRef.current;
      const named = returnFocusSelector ? document.querySelector<HTMLElement>(returnFocusSelector) : null;
      if (previous?.isConnected) {
        previous.focus();
      } else if (named?.isConnected && !named.closest("[inert]")) {
        // The opener came back after its unmount; hand the keyboard to it.
        named.focus({ preventScroll: true });
      } else {
        // No control to return to: go to the start of the content.
        document.querySelector<HTMLElement>("main#main")?.focus({ preventScroll: true });
      }
      /** Re-check one frame later; the restored element can still unmount right after closing. */
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (document.activeElement && document.activeElement !== document.body) return;
          document.querySelector<HTMLElement>("main#main")?.focus({ preventScroll: true });
        });
      });
    };
  }, [open, returnFocusSelector]);

  /*
   * Reduced motion: the shared OVERLAY_SPRING_REDUCED, 120ms opacity only, with zero travel so
   * nothing teleports.
   */
  const reducedMotion = useReducedMotion();
  const surfaceMotion = reducedMotion
    ? {
        initial: SHEET_RISE_REDUCED,
        animate: SHEET_SETTLED,
        exit: { ...SHEET_RISE_REDUCED, transition: EXIT_TRANSITION },
        transition: OVERLAY_SPRING_REDUCED,
      }
    : {
        initial: SHEET_RISE,
        animate: SHEET_SETTLED,
        exit: { ...SHEET_RISE, transition: EXIT_TRANSITION },
        transition: MOTION.base,
      };
  const { ref: scrimLockoutRef, onAnimationStart: scrimLockoutOnAnimationStart } = useExitLockout<HTMLDivElement>();
  const { ref: dialogLockoutRef, onAnimationStart: dialogLockoutOnAnimationStart } = useExitLockout<HTMLDivElement>();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={scrimLockoutRef}
          data-interactive-overlay="true"
          onAnimationStart={scrimLockoutOnAnimationStart}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: EXIT_TRANSITION }}
          transition={reducedMotion ? OVERLAY_SPRING_REDUCED : MOTION.base}
          data-shortcut-sheet-responsive-contract="mobile-sheet-sm-floating"
          data-shortcut-sheet-floating-width-token="--topology-shortcut-sheet-floating-width"
          data-shortcut-sheet-radius-token="--radius-sheet"
          data-shortcut-sheet-mobile-bottom-reserve-token="--topology-mobile-bottom-tab-reserve"
          className="pointer-events-auto fixed inset-0 z-50 flex items-stretch justify-center bg-[color:var(--color-backdrop-medium)] sm:items-center sm:p-6"
          onClick={onClose}
        >
          <motion.section
            ref={mergeRefs(dialogRef, dialogLockoutRef)}
            onAnimationStart={dialogLockoutOnAnimationStart}
            initial={surfaceMotion.initial}
            animate={surfaceMotion.animate}
            exit={surfaceMotion.exit}
            transition={surfaceMotion.transition}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-label={t("dialogAriaLabel")}
            aria-modal="true"
            aria-describedby="shortcut-sheet-help"
            className="flex h-[calc(100dvh-var(--topology-mobile-bottom-tab-reserve))] w-full flex-col overflow-hidden border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-[var(--shadow-elevation-3)] sm:h-auto sm:max-h-[calc(100vh-3rem)] sm:max-w-[var(--topology-shortcut-sheet-floating-width)] sm:rounded-sheet"
          >
            <header className="flex shrink-0 items-center justify-between border-b border-[color:var(--color-border-soft)] px-5 py-4">
              <div>
                <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-indigo-accent)]">
                  {t("title")}
                </p>
                <p className="mt-1 text-body text-[color:var(--color-text-secondary)]">
                  {t("subtitle")}
                </p>
                <p id="shortcut-sheet-help" className="sr-only">
                  {t("help")}
                </p>
              </div>
              <CloseButton label={t("closeAriaLabel")} onClick={onClose} data-testid="shortcut-sheet-close" />
            </header>

            {/* Tabs pinned with the header so scope stays visible while scrolling. */}
            <div
              role="tablist"
              aria-label={t("scope.ariaLabel")}
              data-testid="shortcut-sheet-scope-tabs"
              className="flex shrink-0 items-center gap-1 border-b border-[color:var(--color-border-soft)] px-5 py-2.5"
            >
              {scopes.map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={scope === key}
                  data-testid={`shortcut-sheet-scope-${key}`}
                  onClick={() => setScope(key)}
                  /** 24px like the other segment tabs; the WCAG 2.5.8 minimum target. */
                  className={controlClass({
                    shape: "segment",
                    active: scope === key,
                    className: cn(
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)]",
                      scope !== key &&
                        "hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-secondary)]",
                    ),
                  })}
                >
                  {t(`scope.${key}`)}
                </button>
              ))}
            </div>

            {/* A bottom fade while scroll remains signals more content. */}
            {/*
             * Scroll area height contract: `h-full` resolves against content height and `absolute
             * inset-0` collapses the wrapper, so the wrapper is a relative flex column and the
             * scroller takes `min-h-0 flex-1`.
             */}
            <div className="relative flex min-h-0 flex-1 flex-col">
              {/*
               * Focusable (`tabIndex={0}`) so the region scrolls from the keyboard,
               * with `role="group"` and a name so the stop announces itself
               * (axe `scrollable-region-focusable`).
               */}
              <div
                className="min-h-0 flex-1 overflow-y-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-focus-ring)]"
                data-testid="shortcut-sheet-scroll"
                tabIndex={0}
                role="group"
                aria-label={t("scrollRegionLabel")}
              >
              {/* From sm upward it expands into a 2-column grid to cut vertical length.
                  Small viewports use a single column plus internal scroll to avoid overflow. */}
              <div className="grid grid-cols-1 gap-x-6 divide-y divide-[color:var(--color-overlay-2)] sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                {visibleSections.map((section) => (
                  <section
                    key={section.titleKey}
                    // No column-local top hairline; the tab row's border already closes the header.
                    className="px-5 py-4"
                  >
                    <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
                      {t(`sections.${section.titleKey}`)}
                    </p>
                    <dl className="mt-3 space-y-2.5">
                      {section.rows.map((row, rowIdx) => (
                        <div
                          // Aliased shortcuts can share a label within a section, so the index is
                          // part of the key.
                          key={`${section.titleKey}-${rowIdx}-${row.labelKey}`}
                          className="flex items-center justify-between gap-4"
                        >
                          <dt className="text-body text-[color:var(--color-text-secondary)]">
                            {t(`rows.${row.labelKey}`)}
                          </dt>
                          <dd className="flex shrink-0 items-center gap-1">
                            {row.keys.map((key, i) => (
                              <kbd
                                key={`${row.labelKey}-${i}`}
                                className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-chip border border-[color:var(--color-overlay-3)] bg-[color:var(--color-elevated)] px-1.5 font-mono text-label tabular-nums text-[color:var(--color-text-secondary)]"
                              >
                                {typeof key === "string" ? key : t(`keys.${key.i18nKey}`)}
                              </kbd>
                            ))}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}
              </div>
                {!currentHasOwnSections ? (
                  <p
                    data-testid="shortcut-sheet-current-empty"
                    className="px-5 pb-4 text-label leading-label text-[color:var(--color-text-quaternary)] [word-break:keep-all]"
                  >
                    {t("scope.emptyCurrent")}
                  </p>
                ) : null}
                {/*
                 * The glossary sits under the keys inside the scroll, not in the fixed footer where
                 * it crowded out the list.
                 */}
                <div
                  data-testid="shortcut-sheet-words"
                  className="border-t border-[color:var(--color-overlay-2)] px-5 py-4"
                >
                  {showRelationGuide ? (
                    <ShortcutRelationGuide title={t("glossary.relationsTitle")} />
                  ) : null}
                  <p
                    className={cn(
                      "font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]",
                      showRelationGuide ? "mt-3" : undefined,
                    )}
                  >
                    {t("glossary.title")}
                  </p>
                  <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                    {GLOSSARY_TERMS.map((term) => (
                      <div key={term} className="flex items-baseline gap-1.5 text-body">
                        <dt className="shrink-0 font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
                          {t(`glossary.${term}Term`)}
                        </dt>
                        <dd className="text-[color:var(--color-text-tertiary)]">
                          {t(`glossary.${term}Definition`)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
              <div
                aria-hidden
                data-testid="shortcut-sheet-scroll-fade"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-[var(--topology-shortcut-sheet-scroll-fade)]"
                style={{
                  background:
                    "linear-gradient(to top, var(--color-panel), transparent)",
                }}
              />
            </div>

            <footer className="shrink-0 border-t border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-1)] px-5 py-3">
              <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
                <kbd className="rounded-micro border border-[color:var(--color-overlay-3)] px-1 py-0.5 tabular-nums">
                  ?
                </kbd>{" "}
                {t("footer")}
              </p>
            </footer>
          </motion.section>
          <div
            aria-hidden="true"
            data-testid="shortcut-sheet-bottom-reserve-scrim"
            data-bottom-reserve-scrim-contract="opaque-sheet-continuation"
            data-bottom-reserve-token="--topology-mobile-bottom-tab-reserve"
            className="fixed inset-x-0 bottom-0 h-[var(--topology-mobile-bottom-tab-reserve)] border-t border-[color:var(--color-divider)] bg-[color:var(--color-panel)] sm:hidden"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
