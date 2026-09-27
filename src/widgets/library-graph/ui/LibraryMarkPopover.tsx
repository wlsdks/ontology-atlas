"use client";

import { useEffect, useRef, type RefObject } from "react";
import { X } from "lucide-react";
import type { useTranslations } from "next-intl";

import { formatSourceBytes } from "@/entities/docs-vault";
import { cn } from "@/shared/lib/cn";
import { Chip, Surface } from "@/shared/ui";
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
 * The card a press on a mark opens beside it: ego focus plus a compact surface, with full
 * detail as an explicit door, never a full-screen modal (`.claude/rules/forbidden.md`).
 * As an `anchored` surface (`src/shared/ui/transient-surface.ts`) it stands beside its
 * opener, closes on Escape and gives the keyboard back.
 *
 * Focus lands on the card itself, not its first door, or the Enter that opened it presses
 * `Open`. It is absolute in the canvas box, not a portal: the box is the region it must stay
 * inside, and it shares the mark's coordinates (`placeLibraryGraphCard`).
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
   * Focus moves onto the card once per open. Giving it back is `LibraryGraph.dismissCard`'s,
   * not this cleanup's, or a dev double-mount hands focus straight back to the canvas.
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
   * Escape closes this and nothing else: captured on `window` before the canvas's or the
   * Library's own Escape, one press closing one thing.
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
   * An outside press closes it, except on the canvas, which answers every press itself;
   * closing here too would turn a second press on the mark into close-then-open.
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
   * The facts line. A null count is dropped, never printed as zero: bodies load lazily, so
   * an unread page has no citation count yet.
   */
  const counts = facts?.counts ?? null;
  const factsLine = counts
    ? [
        t("graph.card.factOriginals", { count: counts.sources }),
        // Named "quoted passages": it counts `[[src:…]]` markers, not the `cites` relation drawn as lines.
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
      {/* The title wraps to two lines rather than truncate: the card is where a name the
          canvas cut can be read whole. */}
      <div className="flex items-start gap-2">
        <span className="flex h-[var(--leading-title)] flex-none items-center">
          <MarkGlyph kind={node.kind} />
        </span>
        <div className="min-w-0 flex-1">
          <p
            data-testid="library-graph-card-title"
            title={node.label}
            className="line-clamp-2 text-body leading-title text-[color:var(--color-text-primary)] [word-break:keep-all] [overflow-wrap:anywhere]"
          >
            {node.label}
          </p>
          <span data-testid="library-graph-card-kind" className="block text-label leading-body text-[color:var(--color-text-quaternary)]">
            {t(`graph.kind.${node.kind}`)}
          </span>
        </div>
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

      {sentence ? (
        <p
          data-testid="library-graph-card-sentence"
          className="line-clamp-2 text-label leading-body text-[color:var(--color-text-secondary)]"
        >
          {sentence}
        </p>
      ) : null}

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

      {/* The doors, as chips like every Library popover control, not `Button sm`. */}
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        {node.kind === "concept" ? (
          onOpenOnMap ? (
            <Chip
              tone="strong"
              hoverSurface="lift"
              hoverBorder="strong"
              className="atlas-touch-floor"
              data-testid="library-graph-card-map"
              onClick={onOpenOnMap}
            >
              {t("graph.openOnMap")}
            </Chip>
          ) : null
        ) : (
          <Chip
            tone="strong"
            hoverSurface="lift"
            hoverBorder="strong"
            className="atlas-touch-floor"
            data-testid="library-graph-card-open"
            onClick={onOpen}
          >
            {t("graph.card.open")}
          </Chip>
        )}
        {facts?.refresh?.onRequest ? (
          <Chip
            tone="strong"
            hoverSurface="lift"
            hoverBorder="strong"
            className="atlas-touch-floor"
            data-testid="library-graph-card-refresh"
            onClick={facts.refresh.onRequest}
          >
            {t("graph.card.refresh")}
          </Chip>
        ) : null}
        {facts?.onReveal ? (
          <Chip
            tone="strong"
            hoverSurface="lift"
            hoverBorder="strong"
            className="atlas-touch-floor"
            data-testid="library-graph-card-reveal"
            onClick={facts.onReveal}
          >
            {facts.revealsCopy ? t("source.download") : t("source.reveal")}
          </Chip>
        ) : null}
        {hidden > 0 ? (
          <Chip
            tone="strong"
            hoverSurface="lift"
            hoverBorder="strong"
            className="atlas-touch-floor"
            data-testid="library-graph-card-all"
            onClick={onExpand}
          >
            {t("graph.card.seeAll", { count: rows.length })}
          </Chip>
        ) : null}
      </div>

      {/* The drift is explained here, beside the lines, or it reads as loading. */}
      {node.kind !== "concept" && (facts?.rows?.length ?? 0) > 0 ? (
        <p
          data-testid="library-graph-card-flow"
          className="text-label leading-body text-[color:var(--color-text-quaternary)]"
        >
          {/* The amber clause prints only for this mark's own unverified citations, which
              always carry a drawn dot. */}
          {t(flowStale ? "graph.card.flowInlineStale" : "graph.card.flowInline")}
        </p>
      ) : null}
      {/* A door that cannot open (stale, no agent) shows its reason instead, never a dead chip. */}
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
 * The canvas's own three marks at type scale, so card rows and picture marks share one
 * vocabulary; same ink tokens as `library-graph-ink.ts`.
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
