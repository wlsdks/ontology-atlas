"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import {
  DESTINATION_IDS,
  DESTINATION_KEY,
  NAV_LEADER_KEY,
} from "@/shared/config/destinations";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { MOTION, OVERLAY_SPRING_REDUCED } from "@/shared/motion";
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
}

type ShortcutKey = string | { i18nKey: string };

interface ShortcutRow {
  keys: ShortcutKey[];
  labelKey: string;
}

interface ShortcutSection {
  titleKey: string;
  /** The surface this section applies to — the source of truth for contextual tab classification (#67). */
  surface: ShortcutSurface;
  rows: ShortcutRow[];
}

const k = (i18nKey: string): ShortcutKey => ({ i18nKey });

/**
 * P1a-2 (persona measurement N8 — the definitions of domain/capability/element
 * appeared in 0 working UIs): the map's "?" help is the only permanent help surface
 * that already exists, so a one-line definition is appended to its footer rather than
 * creating a new surface. The kind order matches the map's hierarchy
 * (domain → capability → element).
 *
 * `ontology` comes first because it is baked into the product's name while being
 * defined nowhere in the app — once the tour names it, there has to be somewhere to
 * recover "what was that again", and that place is the pull-only help that already
 * exists, not a new button. It uses the same row format as the other three, so it
 * adds nothing to the IA.
 */
// This sheet and step 1 of the tour are the only two homes for word definitions — we
// do not teach by building a new surface. `nodeNumber` explains once, here only, why
// the map's engraved count (285) differs from the total concept count above it (296):
// the two count different scopes.
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
          <span
            aria-hidden
            className="h-[3px] w-8 shrink-0"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, var(--topology-relation-spine-halo) 0 4px, transparent 4px 7px)",
              clipPath: "polygon(0 0, 100% 33%, 100% 67%, 0 100%)",
            }}
          />
          {relationVocabulary("depends_on", "formal")}
        </span>
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className="h-[2px] w-8 shrink-0 rounded-full"
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
 * The destination-navigation rows — **generated from the table**, not written by hand.
 *
 * The rest of this sheet's rows are a hand-written list with no check aligning them to
 * the real handlers. What that approach already cost is recorded in a comment further
 * down this file — *"the previous rows described interactions the v2 canvas never
 * implemented"*. In other words the sheet was **advertising features that did not
 * exist.**
 *
 * The navigation shortcuts are derived from `DESTINATION_KEY` so the same mistake
 * cannot happen: add a key and it appears in the sheet on its own; remove it and it
 * disappears on its own.
 */
const DESTINATION_ROWS: ShortcutRow[] = DESTINATION_IDS.map((id) => ({
  keys: [NAV_LEADER_KEY.toUpperCase(), DESTINATION_KEY[id].toUpperCase()],
  labelKey: `goTo_${id}`,
}));

const SECTIONS: ShortcutSection[] = [
  {
    titleKey: "navigation",
    surface: "global",
    rows: [
      ...DESTINATION_ROWS,
      { keys: ["⌘", "K"], labelKey: "openProjectPalette" },
      { keys: ["⇧", "⌘", "K"], labelKey: "openGlobalPalette" },
      { keys: ["D"], labelKey: "toggleDocsDrawer" },
      { keys: ["?"], labelKey: "showShortcuts" },
      { keys: ["Esc"], labelKey: "stepCloseOverlays" },
    ],
  },
  {
    // W2-C — rewritten against ACTUAL topology-map-v2 canvas behavior
    // (`use-topology-loop.ts` / `topology-pointer-handlers.ts`). The previous rows
    // (double-click local · Shift+click path · Tab neighbours · / search · 0 depth)
    // described interactions the v2 canvas never implemented — stale carryover from an
    // earlier design that never shipped. Kept: click to select · drag (pan/move node) ·
    // wheel zoom · ⌘K search · the Esc dismissal order · right-click menu (W2-B, now real).
    titleKey: "topology",
    surface: "topology",
    rows: [
      /*
       * Arrow-key walking — **its absence is what a usability review caught**
       * (2026-08-10). Walking to neighbours with the arrow keys shipped on
       * 2026-08-09~10, and this sheet — the only place that teaches the keyboard —
       * did not know about it and taught only click, drag and scroll.
       * 「A feature nobody can discover is not a feature」. Gate:
       * `tests/e2e/map-keyboard-walk.spec.ts`, 「The sheet teaches arrow-key walking」 (the
       * sheet teaches arrow-key walking).
       */
      { keys: ["↑", "↓", "←", "→"], labelKey: "walkNeighbors" },
      { keys: [k("click")], labelKey: "clickSelect" },
      { keys: [k("drag")], labelKey: "dragPan" },
      { keys: [k("scroll")], labelKey: "wheelZoom" },
      { keys: ["⌘", "K"], labelKey: "openProjectPalette" },
      { keys: ["Esc"], labelKey: "stepCloseOverlays" },
      { keys: [k("rightClick")], labelKey: "rightClickContext" },
    ],
  },
  {
    titleKey: "searchPalette",
    surface: "global",
    rows: [
      { keys: ["↑", "↓"], labelKey: "moveBetweenResults" },
      { keys: ["↵"], labelKey: "openSelectedProject" },
      { keys: ["Esc"], labelKey: "close" },
    ],
  },
  {
    titleKey: "hubRail",
    surface: "topology",
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
  // The 'tour' and 'portfolio' sections lost their shortcuts when those overlays were
  // removed in the R10 cleanup, but the ShortcutSheet entries and i18n keys were left
  // stale and were cleaned up in cycle 22.
];

export function ShortcutSheet({ open, onClose }: Props) {
  const t = useTranslations("searchWidgets.shortcuts");
  const pathname = usePathname() ?? "/";
  const currentSurface = surfaceForPathname(pathname);
  // #67 — the contextual tabs. The default is "current screen": rather than pouring
  // out some 40 rows at once, it starts with what can actually be pressed now. The
  // `All` (all) tab keeps the previous list, so this is not hiding shortcuts to avoid
  // crowding.
  const [scope, setScope] = useState<ShortcutScope>("current");
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useBodyScrollLock(open);

  const visibleSections = useMemo(
    () =>
      SECTIONS.filter((section) =>
        scope === "current"
          ? sectionVisibleForCurrent(currentSurface, section.surface)
          : sectionVisible(scope, section.surface),
      ),
    [scope, currentSurface],
  );
  /** On the current-screen tab with nothing but global sections — say so quietly. */
  const currentHasOwnSections =
    scope !== "current" || visibleSections.some((s) => s.surface !== "global");

  useEffect(() => {
    if (!open) return;
    setScope("current");
  }, [open]);

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

  // Focus trap — on open, move to the first focusable element inside the dialog and
  // cycle so Tab cannot escape. Restore the previously active element on close.
  useEffect(() => {
    if (!open) return;
    /**
     * **Do not record `<body>` as the restore target** (measured 2026-07-29).
     *
     * The button that opens this sheet unmounts the moment the sheet appears — the
     * `topologyBlockingOverlayActive` the sheet raises turns off that button's render
     * condition. So by the time this effect runs, `document.activeElement === body`
     * already, and the old code recorded that as "the previous focus".
     *
     * `body.isConnected` is always `true`, so the restore branch looks successful while
     * actually **planting focus back on body**. The probe log said exactly that:
     * `[SHEET-CLEANUP] true BODY`. The visible symptom ("closing sends focus to body")
     * and the cause ("it was already body on open") are on opposite sides, so every
     * attempt to fix only the closing path missed.
     */
    const active = document.activeElement;
    previousFocusRef.current =
      active instanceof HTMLElement && active !== document.body ? active : null;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusables = dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusables[0]?.focus();

    const trapHandler = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
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
       * **Do not drop to `body` just because the opening control is gone**
       * (keyboard measurement, 2026-07-29).
       *
       * The button that opens this sheet **unmounts** once the sheet appears, because
       * the `topologyBlockingOverlayActive` the sheet raises turns off that button's
       * render condition. So on close there was no element to return to and focus went
       * to `body`. The next Tab then restarts from the top of the document (the skip
       * link) — measured at 29 stops away from where the user had been.
       *
       * Opening the same sheet with `?` from **an element that survives** (the
       * auto-layout tile) restored correctly. So this is not a trap defect but an
       * unhandled case of "the place to return to disappeared". `<main>` already
       * receives focus since the skip-link fix, so focus returns to **the start of the
       * content** rather than the start of the page.
       */
      const previous = previousFocusRef.current;
      if (previous?.isConnected) {
        previous.focus();
      } else {
        // With no control to return to, go to **the start of the content**. `<main>`
        // already receives focus since the skip-link fix — better than walking from the
        // top of the page again.
        document.querySelector<HTMLElement>("main#main")?.focus({ preventScroll: true });
      }
      /**
       * Re-check one frame later — there is still a race where the restored element
       * unmounts immediately (measured timeline: 0ms BUTTON · 50ms BUTTON · **150ms
       * BODY**). A restore that only looks at the moment of closing cannot win it.
       */
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (document.activeElement && document.activeElement !== document.body) return;
          document.querySelector<HTMLElement>("main#main")?.focus({ preventScroll: true });
        });
      });
    };
  }, [open]);

  /*
   * The reduced-motion equivalent (frame measurement, 2026-07-28). This was swapped
   * **only halfway**: the global kill rule cuts CSS animations, but this sheet is drawn
   * by framer, so the opacity easing (200ms) survived while only
   * `scale(.985) translateY(12px) → none` in the same span was cut to **one frame**,
   * teleporting `y 96.2 → 79` and `h 684.6 → 695`. The axis to keep (brightness) and
   * the axis to remove (geometry) were exactly inverted.
   *
   * Unified onto **the same** equivalent the search palette and the new-document dialog
   * use (`OVERLAY_SPRING_REDUCED`, 120ms opacity only), with the shaking axis starting
   * at 0 — it is not a teleport when the **travel distance** is 0, not the time. Zero
   * new values.
   */
  const reducedMotion = useReducedMotion();
  const surfaceMotion = reducedMotion
    ? {
        initial: { opacity: 0, y: 0, scale: 1 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 0, scale: 1 },
        transition: OVERLAY_SPRING_REDUCED,
      }
    : {
        initial: { opacity: 0, y: 12, scale: 0.985 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 12, scale: 0.985 },
        transition: MOTION.base,
      };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          data-interactive-overlay="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reducedMotion ? OVERLAY_SPRING_REDUCED : MOTION.base}
          data-shortcut-sheet-responsive-contract="mobile-sheet-sm-floating"
          data-shortcut-sheet-floating-width-token="--topology-shortcut-sheet-floating-width"
          data-shortcut-sheet-radius-token="--radius-sheet"
          data-shortcut-sheet-mobile-bottom-reserve-token="--topology-mobile-bottom-tab-reserve"
          className="pointer-events-auto fixed inset-0 z-50 flex items-stretch justify-center bg-[color:var(--color-backdrop-medium)] sm:items-center sm:p-6"
          onClick={onClose}
        >
          <motion.section
            ref={dialogRef}
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
              <button
                type="button"
                onClick={onClose}
                aria-label={t("closeAriaLabel")}
                data-testid="shortcut-sheet-close"
                data-shortcut-sheet-close-contract="touch-visible"
                data-shortcut-sheet-close-size-token="--topology-shortcut-sheet-close-size"
                className={controlClass({ shape: "chip", tone: "muted", className: "flex h-[var(--topology-shortcut-sheet-close-size)] w-[var(--topology-shortcut-sheet-close-size)] justify-center hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-strong)]" })}
              >
                <X size={ICON_SIZE.md} />
              </button>
            </header>

            {/* #67 — the contextual tabs. Pinned with the header (shrink-0) so they stay
                visible while scrolling: which scope you are in and where you can go. */}
            <div
              role="tablist"
              aria-label={t("scope.ariaLabel")}
              data-testid="shortcut-sheet-scope-tabs"
              className="flex shrink-0 items-center gap-1 border-b border-[color:var(--color-border-soft)] px-5 py-2.5"
            >
              {SHORTCUT_SCOPES.map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={scope === key}
                  data-testid={`shortcut-sheet-scope-${key}`}
                  onClick={() => setScope(key)}
                  /**
                   * **This position was the one unabsorbed consumer of the 2026-08-03
                   * convergence.** The deleted `fixedHeight: "sm"` produced 28px only
                   * here, and 28 exists on the ramp (`--control-h-sm`) but **not on the
                   * segment step** — the other 8 segment tabs are all 24px (`md`).
                   * Keeping 28 alone would need that axis back, and that axis is exactly
                   * what this cleanup removed. So it dropped to 24 like the majority
                   * (−4px). 24 is the WCAG 2.5.8 (AA) minimum target, so it did not go
                   * below the floor.
                   */
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

            {/* #67 — the list area. With scroll remaining, a one-step fade at the bottom
                makes it read as "there is more" rather than "this is the end". */}
            {/* #67 follow-up — the scroll area's height contract.
                This dialog is **content-height** from sm upward (`sm:h-auto` plus
                `sm:max-h-[...]`). So:
                  · `h-full` (=height:100%) resolves against the content height rather
                    than the wrapper's, making `scrollHeight === clientHeight`, killing
                    the scroll and cutting the last section outside the viewport
                    (measured at 1112px on the English `all` tab).
                  · `absolute inset-0` takes the scrolling child out of flow, so the
                    wrapper becomes 0 height and the dialog collapses to 232px.
                Both were confirmed by measurement. The answer is **constraining with
                flex inside the flow**: the wrapper is a flex column too, and the
                scrolling child takes only the remaining space with `min-h-0 flex-1`.
                The fade is anchored at the wrapper's bottom (relative). */}
            <div className="relative flex min-h-0 flex-1 flex-col">
              {/*
                ⚠️ **A scrollable region has to be scrollable from the keyboard too**
                (2026-08-20, surfaced when the destinations reached eight).

                This area caused no trouble while the content was short enough not to
                scroll. When the 「Agent」 (agents) destination made the navigation
                section one row longer, a scroll actually appeared, and at that moment it
                became **impossible to see the bottom without a mouse wheel or trackpad**
                (axe `scrollable-region-focusable`).

                So the defect was not new but **lying dormant until its condition was
                met.** Accessibility that depends on content length is not accessibility.

                `tabIndex={0}` puts the region into tab order so arrow keys and
                PageUp/Down scroll it. What receives focus has to say what it is, so
                `role="group"` plus a name come with it — an unnamed focus stop sounds
                like 「an empty group」 to a screen reader.
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
                {visibleSections.map((section, idx) => (
                  <section
                    key={section.titleKey}
                    className={
                      idx % 2 === 1
                        ? "px-5 py-4 sm:border-t sm:border-t-[color:var(--color-overlay-2)]"
                        : "px-5 py-4"
                    }
                  >
                    <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
                      {t(`sections.${section.titleKey}`)}
                    </p>
                    <dl className="mt-3 space-y-2.5">
                      {section.rows.map((row, rowIdx) => (
                        <div
                          // Aliased shortcuts sharing a label can appear several times in
                          // one section (e.g. "Open Palette (alias)" ⌘P / ⌘O), so the index is
                          // part of the key to avoid a React duplicate key.
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
              {currentSurface === "topology" &&
              (scope === "current" || scope === "topology" || scope === "all") ? (
                <ShortcutRelationGuide title={t("glossary.relationsTitle")} />
              ) : null}
              <p
                className={cn(
                  "font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]",
                  currentSurface === "topology" &&
                    (scope === "current" || scope === "topology" || scope === "all")
                    ? "mt-3"
                    : undefined,
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
              <p className="mt-2.5 font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
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
