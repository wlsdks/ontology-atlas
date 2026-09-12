"use client";

import { useEffect, useRef, type RefObject } from "react";
import { X } from "lucide-react";
import type { useTranslations } from "next-intl";

import { formatSourceBytes } from "@/entities/docs-vault";
import { cn } from "@/shared/lib/cn";
import { Button, Surface } from "@/shared/ui";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { transientSurface } from "@/shared/ui/transient-surface";

import type { LibraryGraphNode } from "../model/build-library-graph";
import {
  LIBRARY_CARD_ROWS,
  type LibraryGraphCardFacts,
  type LibraryGraphCardSide,
} from "../model/library-graph-card";

/**
 * **The card a press on a mark opens, beside that mark.**
 *
 * The owner, 2026-09-12: *"when I click it just navigates straight to the page — I want a
 * press to raise a popup that shows me something."* This is that popup, and the shape is
 * not new: on the map a press on a node has meant *ego focus plus a compact surface beside
 * it, with full detail as an explicit action inside* since the interaction was first
 * decided, and `.claude/rules/forbidden.md` keeps the alternative — a full-screen detail
 * modal on a node press — permanently banned.
 *
 * ## What it owes, as an `anchored` surface
 *
 * `transientSurface("anchored")` is a declaration with obligations
 * (`src/shared/ui/transient-surface.ts`): stand beside what opened it, close on Escape,
 * and give the keyboard back. All three are here, and the sweeping surface check measures
 * them rather than guessing which element is "the card".
 *
 * ⚠️ **Focus lands on the card, not on its first door** — `tabIndex={-1}` on the surface
 * itself. Focusing the first control was measured on the Library's own popup as a defect
 * twice over (council, 2026-09-12): it charged a Tab to reach the content, and it made the
 * `Enter` that *opened* the card press `Open` and leave for the page, which is exactly the
 * navigation this whole slice exists to stop being the answer to one press. The direction's
 * "focus enters the card's first door" is corrected to the card, for that reason.
 *
 * ## Why it is `absolute` in the canvas's own box, not a portal
 *
 * `LibraryHomePopover` portals to the body because it hangs from a door inside a pane that
 * scrolls, and an absolute panel would be clipped by the first scrolling ancestor. This
 * card hangs from a **mark on the canvas**, and the canvas's own box is exactly the region
 * the card must stay inside: clamped into it, the card cannot reach the caption row, the
 * strip's clauses or the doors above the picture, and it follows the mark through a pan, a
 * zoom or a drag for free because it is positioned in the same coordinates the mark is.
 * The clipping a portal avoids is, here, the guarantee (`placeLibraryGraphCard`).
 */
export function LibraryMarkPopover({
  node,
  facts,
  side,
  width,
  cardRef,
  flowStale,
  expanded,
  onExpand,
  onOpen,
  onOpenOnMap,
  onClose,
  t,
}: {
  node: LibraryGraphNode;
  facts: LibraryGraphCardFacts | null;
  side: LibraryGraphCardSide;
  /** The card's own width as a CSS length, capped by the canvas — see `placeLibraryGraphCard`. */
  width: string;
  cardRef: RefObject<HTMLElement | null>;
  /** Whether one of this mark's own citations is one the folder cannot vouch for. */
  flowStale: boolean;
  /** Whether the full neighbourhood list is shown rather than its first rows. */
  expanded: boolean;
  onExpand: () => void;
  /** `Open` — the door that does what a press used to do, now named. */
  onOpen: () => void;
  /** A concept lives on the map, so its one door leaves for the map. */
  onOpenOnMap: (() => void) | null;
  onClose: () => void;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  /**
   * **Focus moves in on open**, so Tab reaches the doors and Escape has something to give
   * back. One move per open, and the card itself rather than its first control.
   *
   * ⚠️ **Giving the keyboard back is the caller's, not this effect's cleanup.** It was
   * written here first and measured wrong in the browser: React's development double-mount
   * runs mount → cleanup → mount, so the cleanup fired while the card was still open, saw
   * the focus it had just taken, and handed it straight back to the canvas — a card that
   * opened with no keyboard at all, in dev only. `LibraryGraph.dismissCard` does it on the
   * actual close instead, where every exit already passes.
   */
  const focusedRef = useRef(false);
  useEffect(() => {
    if (focusedRef.current) return;
    const element = cardRef.current;
    if (!element) return;
    focusedRef.current = true;
    element.focus({ preventScroll: true });
  }, [cardRef]);

  /**
   * Escape closes this and nothing else.
   *
   * Capture on `window`, so the press never reaches the canvas's own `Escape` (which drops
   * the keyboard's position) or the Library's (which lifts the stale clause). One press,
   * one thing closed — the ladder rule the map's own Escape decision records.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  /*
   * An outside press closes it — **except on the canvas**, which has its own answer to
   * every press: a mark opens its card, the same mark closes this one, and the empty
   * background dismisses. Closing here as well would have made the second press on a mark
   * a close followed by an open, so the card could never be toggled shut by its own mark.
   */
  useEffect(() => {
    const onDown = (event: MouseEvent): void => {
      if (!(event.target instanceof Element)) return;
      if (cardRef.current?.contains(event.target)) return;
      if (event.target.closest('[data-testid="library-graph-canvas"]')) return;
      onClose();
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [cardRef, onClose]);

  const rows = facts?.rows ?? [];
  const shown = expanded ? rows : rows.slice(0, LIBRARY_CARD_ROWS);
  const hidden = rows.length - shown.length;

  const sentence =
    node.kind === "concept"
      ? t("graph.card.conceptSentence")
      : node.kind === "source" && facts?.file
        ? t("graph.card.fileFacts", {
            format: facts.file.format ? facts.file.format.toUpperCase() : t("sources.noFormat"),
            size: formatSourceBytes(facts.file.bytes),
            state: t(`sources.state.${facts.file.state}.label`),
          })
        : (facts?.sentence ?? null);

  /**
   * **The facts line — and a count nobody has measured is left out, not printed as zero.**
   *
   * `cites` is read out of the page's own body, and the body is read lazily: a page a
   * person has not opened yet has no text in the model. Printing `0 citations` there was
   * measured on the three-hundred-file folder as exactly the wrong sentence — the card
   * listed ten originals and claimed the page cited nothing — so a null term is dropped and
   * the line says only what the folder actually knows.
   */
  const counts = facts?.counts ?? null;
  const factsLine = counts
    ? [
        t("graph.card.factOriginals", { count: counts.sources }),
        /*
         * ⚠️ **"quoted passages", not "citations".** Three cold walkers read
         * `0 citations` beside `10 originals` as a contradiction (2026-09-12): *"one of
         * the two is wrong"*, because the strip above the picture already counts the
         * **relation** `cites`, and the lines drawn to this mark are that relation. This
         * number is a different thing — the `[[src:…]]` markers inside the page's own
         * body — so it is named for that and the collision goes.
         */
        counts.cites === null ? null : t("graph.card.factPassages", { count: counts.cites }),
        t("graph.card.factMentions", { count: counts.mentions }),
        counts.stale > 0 ? t("home.staleClause", { count: counts.stale }) : null,
      ]
        .filter((part): part is string => part !== null)
        .join(" · ")
    : null;

  return (
    <Surface
      open
      as="aside"
      ref={cardRef}
      motion="chrome"
      /* The growth points at the mark: the card comes out of the dot that was pressed. */
      origin={
        side === "right"
          ? "left center"
          : side === "left"
            ? "right center"
            : side === "below"
              ? "top center"
              : "bottom center"
      }
      tabIndex={-1}
      {...transientSurface("anchored")}
      role="group"
      aria-label={node.label}
      data-testid="library-graph-card"
      data-card-node-id={node.id}
      data-card-kind={node.kind}
      data-card-side={side}
      style={{ width }}
      className={cn(
        "absolute z-20 flex max-w-full flex-col gap-1.5 overflow-y-auto rounded-panel px-3 py-2.5",
        "border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)]",
        "shadow-[var(--shadow-elevation-2)] outline-none",
      )}
    >
      {/* ── Identity: the same three marks the canvas draws, the name, the kind. ── */}
      <div className="flex items-center gap-2">
        <MarkGlyph kind={node.kind} />
        <p
          data-testid="library-graph-card-title"
          className="min-w-0 flex-1 truncate text-body leading-title text-[color:var(--color-text-primary)]"
        >
          {node.label}
        </p>
        <span className="flex-none text-label leading-body text-[color:var(--color-text-quaternary)]">
          {t(`graph.kind.${node.kind}`)}
        </span>
        <button
          type="button"
          onClick={onClose}
          data-testid="library-graph-card-close"
          aria-label={t("graph.card.close")}
          className={cn("flex-none", controlClass({ shape: "icon", tone: "muted", hoverInk: "strong" }))}
        >
          <X size={ICON_SIZE.sm} aria-hidden />
        </button>
      </div>

      {/* ── One sentence. A page's Summary, a file's three facts, a concept's place. ── */}
      {sentence ? (
        <p
          data-testid="library-graph-card-sentence"
          className="line-clamp-2 text-label leading-body text-[color:var(--color-text-secondary)]"
        >
          {sentence}
        </p>
      ) : null}

      {/* ── The facts line. Amber the moment one of its citations cannot be vouched for. ── */}
      {factsLine ? (
        <p
          data-testid="library-graph-card-facts"
          className={cn(
            "text-label leading-body",
            (counts?.stale ?? 0) > 0
              ? "text-[color:var(--color-status-warning)]"
              : "text-[color:var(--color-text-tertiary)]",
          )}
        >
          {factsLine}
        </p>
      ) : null}

      {/* ── What it leans on, or what leans on it. ── */}
      {shown.length > 0 ? (
        <ul
          data-testid="library-graph-card-rows"
          aria-label={node.kind === "source" ? t("graph.card.pagesLabel") : t("graph.card.sourcesLabel")}
          className="flex flex-col gap-0.5"
        >
          {shown.map((row, index) => (
            <li
              key={row.id ?? `${row.label}-${index}`}
              className="flex items-center gap-1.5 text-label leading-body text-[color:var(--color-text-tertiary)]"
            >
              <MarkGlyph kind={node.kind === "source" ? "page" : "source"} />
              <span className="min-w-0 flex-1 truncate">{row.label}</span>
              <span
                className={cn(
                  "flex-none",
                  row.state === "stale" || row.state === null || row.freshness === "behind"
                    ? "text-[color:var(--color-status-warning)]"
                    : "text-[color:var(--color-text-quaternary)]",
                )}
              >
                {row.state === null
                  ? t("graph.card.rowMissing")
                  : row.state
                    ? t(`sources.state.${row.state}.label`)
                    : row.freshness
                      ? t(`source.writeUp.${row.freshness}`)
                      : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* ── The doors. The first one is what a press used to do, now named and explicit. ── */}
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        {node.kind === "concept" ? (
          onOpenOnMap ? (
            <Button
              size="sm"
              variant="outline"
              className="atlas-touch-floor"
              data-testid="library-graph-card-map"
              onClick={onOpenOnMap}
            >
              {t("graph.openOnMap")}
            </Button>
          ) : null
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="atlas-touch-floor"
            data-testid="library-graph-card-open"
            onClick={onOpen}
          >
            {t("graph.card.open")}
          </Button>
        )}
        {facts?.refresh?.onRequest ? (
          <Button
            size="sm"
            variant="outline"
            className="atlas-touch-floor"
            data-testid="library-graph-card-refresh"
            onClick={facts.refresh.onRequest}
          >
            {t("graph.card.refresh")}
          </Button>
        ) : null}
        {facts?.onReveal ? (
          <Button
            size="sm"
            variant="outline"
            className="atlas-touch-floor"
            data-testid="library-graph-card-reveal"
            onClick={facts.onReveal}
          >
            {t("source.reveal")}
          </Button>
        ) : null}
        {hidden > 0 ? (
          <Button
            size="sm"
            variant="outline"
            className="atlas-touch-floor"
            data-testid="library-graph-card-all"
            onClick={onExpand}
          >
            {t("graph.card.seeAll", { count: rows.length })}
          </Button>
        ) : null}
      </div>

      {/*
        ⚠️ **The drift is named here, beside the lines, and not only under the picture.**

        Three cold walkers read the travelling dashes as *loading* before they found any
        sentence about them (2026-09-12) — which is direction B's own falsifier — and the
        one sentence that explained it was at the foot of the window, in the slot that
        otherwise teaches the marks. Two defects, one cause: the explanation was far from
        the thing. It is in the card now, where the eye already is, and the legend below the
        canvas keeps saying what a circle, a square and a ring are while the card is open.
      */}
      {node.kind !== "concept" && (facts?.rows?.length ?? 0) > 0 ? (
        <p
          data-testid="library-graph-card-flow"
          className="text-label leading-body text-[color:var(--color-text-quaternary)]"
        >
          {t(flowStale ? "graph.card.flowInlineStale" : "graph.card.flowInline")}
        </p>
      ) : null}
      {/*
        ⚠️ **A door that cannot open is replaced by the reason, never left pressable.**
        `stale && no agent` is the case: there is nothing in the folder that can write a
        draft, and a chip that does nothing reads as a broken product (installed app,
        2026-09-05).
      */}
      {facts?.refresh && !facts.refresh.onRequest && facts.refresh.reason ? (
        <p
          data-testid="library-graph-card-reason"
          className="text-label leading-body text-[color:var(--color-text-quaternary)]"
        >
          {facts.refresh.reason}
        </p>
      ) : null}
    </Surface>
  );
}

/**
 * The card wears the canvas's own three marks, at the type's own scale.
 *
 * ⚠️ **Because a list of names beside a picture of dots is two vocabularies for one
 * folder.** The circle, the square and the ring are what the legend teaches and what the
 * canvas paints; drawing them here costs nine pixels and means a row in the card and a
 * mark in the picture are visibly the same kind of thing. The inks are the same tokens the
 * canvas resolves (`library-graph-ink.ts`), so the two cannot drift apart.
 */
function MarkGlyph({ kind }: { kind: LibraryGraphNode["kind"] }): React.ReactElement {
  if (kind === "source") {
    return (
      <span
        aria-hidden
        data-mark-kind="source"
        className="block size-[7px] flex-none bg-[color:var(--color-text-quaternary)]"
      />
    );
  }
  if (kind === "concept") {
    return (
      <span
        aria-hidden
        data-mark-kind="concept"
        className="block size-[8px] flex-none rounded-full border border-[color:var(--color-text-quaternary)]"
      />
    );
  }
  return (
    <span
      aria-hidden
      data-mark-kind="page"
      className="block size-[8px] flex-none rounded-full bg-[color:var(--color-text-primary)]"
    />
  );
}
