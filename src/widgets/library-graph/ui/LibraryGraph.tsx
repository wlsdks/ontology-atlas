"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Maximize2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import type { VaultDoc } from "@/entities/docs-vault";
import { EMPTY_LIBRARY_WORK_ACTIVITY, type LibraryWorkActivity } from "@/features/library";
import { useRouter } from "@/i18n/navigation";
import { usePrefersReducedMotion } from "@/shared/lib/use-prefers-reduced-motion";
import { cn } from "@/shared/lib/cn";
import { ChromeTile, Surface } from "@/shared/ui";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/icon-size";

import {
  buildLibraryGraph,
  type LibraryGraphNode,
  type LibraryGraphPage,
  type LibraryGraphSource,
} from "../model/build-library-graph";
import {
  libraryGraphFlowEdges,
  LIBRARY_CARD_INSET,
  LIBRARY_CARD_MAX_WIDTH,
  type LibraryGraphCardFacts,
  type LibraryGraphCardSide,
} from "../model/library-graph-card";
import { LibraryMarkPopover } from "./LibraryMarkPopover";
import { useLibraryGraphEngine, type LibraryGraphCardBox, type LibraryIslandPick } from "./use-library-graph-engine";

/**
 * The library's graph: the paper trail under the ontology (which file was read, what was
 * written from it, which concepts it reaches), kept apart from the map so a PDF never
 * lands on the meaning graph. It is the pane whenever nothing is chosen. Motion only
 * answers something a person did; hover changes ink only (`docs/DECISIONS.md`, "The
 * Library graph stands still").
 */

export interface LibraryGraphSelection {
  kind: "wiki" | "source";
  /** Slug for a wiki page, vault-relative path for a source. */
  ref: string;
}

export interface LibraryGraphProps {
  /** Every document in the folder — what resolves a page's `[[slug]]` links. */
  docs: readonly VaultDoc[];
  wikiPages: readonly LibraryGraphPage[];
  /** `LibrarySourceRow` satisfies this: the canvas wants the judged state, not just paths. */
  sources: readonly LibraryGraphSource[] | undefined;
  /** What the Library has open, so this canvas can agree with the rest of the screen. */
  selection: LibraryGraphSelection | null;
  /** Selecting a page or a source is the Library's job; this hands the choice back. */
  onSelect: (selection: LibraryGraphSelection) => void;
  /** Actual tool receipts only; this never infers work from a relation or a label. */
  activity?: LibraryWorkActivity;
  /** Keep the settled graph mounted behind a reader without scheduling hidden frames. */
  visible?: boolean;
  /**
   * The marks a sentence outside this canvas is about, such as the strip's stale clause:
   * they keep their ink as under a hover and no mark moves. A pointer or the keyboard wins.
   */
  highlight?: ReadonlySet<string> | null;
  /**
   * The {@link highlight} in one sentence, in the legend's slot: a dim alone is a state with
   * no words, no way back and an unexplained count (a citation lights two ends). A hover wins.
   */
  highlightNote?: string | null;
  /** The view's own caption-row content (status strip, shelf chip), as a slot since a widget cannot import views. */
  headerEnd?: ReactNode;
  /**
   * The caption yields below `lg` while the guide stands over it, since overlap is not
   * tolerated (`docs/DESIGN-SYSTEM.md`, Don'ts). It stays as `sr-only`, never unmounted: it is
   * the canvas's `aria-describedby` target.
   */
  captionQuiet?: boolean;
  /** A column beside the reader, not the pane: the slot stays for hover, the long legend becomes one line. */
  compact?: boolean;
  /**
   * The folder's facts for a pressed mark's card, from the Library model a widget cannot
   * import (same seam as {@link headerEnd}). Absent, the card still shows name, kind and doors.
   */
  cardFacts?: (node: LibraryGraphNode) => LibraryGraphCardFacts | null;
}

/** No fixed height or width cap: a canvas that pans and zooms is the whole pane. */
const CANVAS_CLASS = "min-h-0 w-full flex-1";

function selectionNodeId(selection: LibraryGraphSelection | null): string | null {
  if (!selection) return null;
  return selection.kind === "wiki" ? `page:${selection.ref}` : `source:${selection.ref}`;
}

/** The clause separator both locales' caption messages use. */
const CAPTION_SEPARATOR = " · ";

export function LibraryGraph({
  docs,
  wikiPages,
  sources,
  selection,
  onSelect,
  activity = EMPTY_LIBRARY_WORK_ACTIVITY,
  visible = true,
  highlight = null,
  highlightNote = null,
  headerEnd,
  captionQuiet = false,
  compact = false,
  cardFacts,
}: LibraryGraphProps) {
  const t = useTranslations("library");
  const locale = useLocale();
  const router = useRouter();
  const reducedMotion = usePrefersReducedMotion();

  const wholeGraph = useMemo(
    () => buildLibraryGraph({ docs, wikiPages, sources, locale }),
    [docs, locale, sources, wikiPages],
  );
  /**
   * The opened island: past `ISLANDS_MIN_MARKS` the home is islands, and a press narrows the
   * picture to one island's marks, few enough for the flow to name, filtered by id.
   */
  const [pickedIsland, setPickedIsland] = useState<LibraryIslandPick | null>(null);
  /**
   * The Unread island never opens: unread files have no relations, so columns are a bare
   * grid. A press says so and points at Sources and Compile, until the pointer leaves or Escape.
   */
  const [unreadPressed, setUnreadPressed] = useState<LibraryIslandPick | null>(null);
  const setIsland = useCallback((next: LibraryIslandPick | null) => {
    if (next && next.kind === "unread") {
      setUnreadPressed(next);
      return;
    }
    setUnreadPressed(null);
    setPickedIsland(next);
  }, []);
  /** The island under the pointer, for the legend's line: what this island is, in one sentence. */
  const [hoveredIsland, setHoveredIsland] = useState<LibraryIslandPick | null>(null);
  const leaveIsland = useCallback(() => setIsland(null), [setIsland]);
  /** The island the keyboard stands on, on the overview; arrows step, Enter opens. */
  const [focusedIslandId, setFocusedIslandId] = useState<string | null>(null);
  // The island is a view of a folder; a folder that no longer holds any of it lets it go.
  const island = useMemo(() => {
    if (!pickedIsland) return null;
    const ids = new Set(wholeGraph.nodes.map((node) => node.id));
    return pickedIsland.pages.some((id) => ids.has(id)) || pickedIsland.sources.some((id) => ids.has(id)) ? pickedIsland : null;
  }, [pickedIsland, wholeGraph]);
  const graph = useMemo(() => {
    if (!island) return wholeGraph;
    // The island's own concept is left out: the bar names it, and every page's line to it says one word.
    const keep = new Set<string>([...island.pages, ...island.sources]);
    const nodes = wholeGraph.nodes.filter((node) => keep.has(node.id));
    const edges = wholeGraph.edges.filter((edge) => keep.has(edge.source) && keep.has(edge.target));
    return {
      nodes,
      edges,
      counts: {
        sources: nodes.filter((node) => node.kind === "source").length,
        pages: nodes.filter((node) => node.kind === "page").length,
        concepts: nodes.filter((node) => node.kind === "concept").length,
        cites: edges.filter((edge) => edge.relation === "cites").length,
        mentions: edges.filter((edge) => edge.relation === "mentions").length,
      },
    };
  }, [island, wholeGraph]);


  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  /** The open card's mark as an id, looked up each render, so a card whose mark is gone closes. */
  const [cardId, setCardId] = useState<string | null>(null);
  const [cardExpanded, setCardExpanded] = useState(false);
  /**
   * The card's side, the one placement fact in state (its growth origin); pixels go straight
   * onto the element, or a moving mark renders React every frame.
   */
  const [cardSide, setCardSide] = useState<LibraryGraphCardSide>("right");
  const placeCardElement = useCallback((box: LibraryGraphCardBox | null) => {
    const element = cardRef.current;
    if (box && element) {
      element.style.left = `${box.left}px`;
      element.style.top = `${box.top}px`;
      // A card taller than its room scrolls inside rather than overhang the edge.
      element.style.maxHeight = `${box.maxHeight}px`;
    }
    if (box) setCardSide((current) => (current === box.side ? current : box.side));
  }, []);

  const selectedId = selectionNodeId(selection);
  const activeId = hoveredId ?? focusedId;
  const activeNode = useMemo(
    () => graph.nodes.find((node) => node.id === activeId) ?? null,
    [activeId, graph.nodes],
  );
  // The hover label is the name alone: every press opens a card, and the card holds the doors.
  const activeLabel = activeNode ? activeNode.label : null;

  /**
   * A press opens the mark's card; pressing it again closes it, beside Escape and an outside
   * press. No mark moves (`docs/DECISIONS.md`, "The Library graph stands still").
   */
  const pressMark = useCallback((node: LibraryGraphNode) => {
    setCardId((current) => (current === node.id ? null : node.id));
    setCardExpanded(false);
  }, []);

  /**
   * Closes the card and refocuses the canvas only when focus was in the card or nowhere;
   * a press on another control keeps its focus (as in `LibraryHomePopover`).
   */
  const dismissCard = useCallback(() => {
    const active = document.activeElement;
    const inside = !active || active === document.body || cardRef.current?.contains(active);
    setCardId(null);
    setCardExpanded(false);
    if (inside) canvasRef.current?.focus({ preventScroll: true });
  }, []);

  const activate = useCallback(
    (node: LibraryGraphNode) => {
      setCardId(null);
      setCardExpanded(false);
      if (node.kind === "concept") {
        // A concept is not a file here; its map deeplink takes a person there.
        if (node.href) router.push(node.href);
        return;
      }
      onSelect({ kind: node.kind === "page" ? "wiki" : "source", ref: node.ref });
    },
    [onSelect, router],
  );

  // Every page asks for its name (a collision drops the quieter); the camera decides which files do.
  const standingLabels = true;
  const islandLabels = useMemo(() => ({ unsorted: t("graph.islandUnsorted"), unread: t("graph.islandUnread") }), [t]);
  const engine = useLibraryGraphEngine({
    graph,
    islandLabels,
    locale,
    canvasRef,
    reducedMotion,
    selectedId,
    hoveredId,
    focusedId,
    highlight,
    activeLabel,
    standingLabels,
    activity,
    visible,
    cardId,
    cardRef,
    onCardPlaced: placeCardElement,
    onHover: setHoveredId,
    onPressMark: pressMark,
    onActivate: activate,
    onPressIsland: setIsland,
    overview: island === null,
    onHoverIsland: (next: LibraryIslandPick | null) => {
      setHoveredIsland(next);
      if (next === null) setUnreadPressed(null);
    },
    onLeaveIsland: leaveIsland,
    focusedIslandId,
    onDismiss: dismissCard,
  });

  /** The open card's mark, or null once the folder no longer holds it. */
  const cardNode = useMemo(
    () => (cardId === null ? null : graph.nodes.find((node) => node.id === cardId) ?? null),
    [cardId, graph.nodes],
  );
  // Placed synchronously on open, or the card shows one frame at the canvas's corner.
  const placeCard = engine.placeCard;
  useLayoutEffect(() => {
    // The id is passed because the engine's state ref fills in a later passive effect.
    placeCard(cardNode?.id ?? null);
  }, [cardExpanded, cardNode, placeCard]);
  const cardStale = useMemo(
    () => libraryGraphFlowEdges(graph, cardId).stale.size > 0,
    [cardId, graph],
  );

  /* The keyboard walks the picture as it is read: column by column, top to bottom. */
  const nodes = graph.nodes;
  const walkOrder = engine.walkOrder;
  const ordered = useMemo(() => {
    if (walkOrder.length === 0) return nodes;
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const laid = walkOrder.map((id) => byId.get(id)).filter((node): node is (typeof nodes)[number] => node !== undefined);
    return laid.length === nodes.length ? laid : nodes;
  }, [nodes, walkOrder]);
  const focusedIsland = engine.islands.find((candidate) => candidate.id === focusedIslandId) ?? null;
  const stepIsland = useCallback(
    (delta: number) => {
      const list = engine.islands;
      if (list.length === 0) return;
      const current = list.findIndex((candidate) => candidate.id === focusedIslandId);
      const next = current === -1 ? (delta > 0 ? 0 : list.length - 1) : (current + delta + list.length) % list.length;
      setFocusedIslandId(list[next]?.id ?? null);
    },
    [engine.islands, focusedIslandId],
  );
  const stepFocus = useCallback(
    (delta: number) => {
      if (ordered.length === 0) return;
      const current = ordered.findIndex((node) => node.id === focusedId);
      const next = current === -1 ? (delta > 0 ? 0 : ordered.length - 1) : (current + delta + ordered.length) % ordered.length;
      setFocusedId(ordered[next]?.id ?? null);
    },
    [focusedId, ordered],
  );

  // Kind, name, position in the walk, and what Enter will do, which differs by kind.
  const announcement = focusedIsland && engine.picture === "islands"
    ? t("graph.announceIsland", {
        name: focusedIsland.label,
        position: engine.islands.indexOf(focusedIsland) + 1,
        total: engine.islands.length,
        pages: focusedIsland.pages.length,
        sources: focusedIsland.sources.length,
      })
    : activeNode
    ? t("graph.announce", {
        kind: t(`graph.kind.${activeNode.kind}`),
        name: activeNode.label,
        // Counted along the arrows' walk, so "3 of 40" is the third stop.
        position: ordered.indexOf(activeNode) + 1,
        total: ordered.length,
        action: t(activeNode.kind === "concept" ? "graph.actionMap" : "graph.actionSelect"),
      })
    : "";

  const counts = graph.counts;
  /*
   * The relations are counted apart, or the caption cannot say whether dashes matter. An
   * opened island's caption counts only what it draws: files, pages, cites.
   */
  const caption = island
    ? t("graph.countsIsland", { sources: counts.sources, pages: counts.pages, cites: counts.cites })
    : t("graph.counts", {
        sources: counts.sources,
        pages: counts.pages,
        concepts: counts.concepts,
        cites: counts.cites,
        mentions: counts.mentions,
      });

  return (
    /*
     * The pane, not a strip over the reader; the guide is a popup (`docs/DECISIONS.md`,
     * "The Library pane is the graph; the shelf is a popup").
     */
    <section
      data-testid="library-graph"
      aria-label={t("graph.title")}
      className="flex min-h-0 flex-1 flex-col px-5 py-2 sm:px-6 md:px-10"
    >
      <div className="flex flex-none flex-wrap items-center gap-x-3 gap-y-1 lg:flex-nowrap">
        {/* The counts are the picture's caption and only title. From `lg` the row never
            wraps and they shrink first, or the doors drop to a second row off the canvas. */}
        {/* Whole clauses give way from the end, never half of one: each is an unbreakable
            item on a clipped one-line row; `title` and `textContent` keep every count. */}
        <p
          data-testid="library-graph-counts"
          title={caption}
          className="flex max-h-[1lh] min-w-0 flex-wrap overflow-hidden text-label leading-body text-[color:var(--color-text-tertiary)] lg:shrink-[20]"
        >
          {caption.split(CAPTION_SEPARATOR).map((clause, index) => (
            <span
              key={index}
              data-counts-clause=""
              className={index === 0 ? "min-w-0 truncate" : "whitespace-pre"}
            >
              {index === 0 ? clause : `${CAPTION_SEPARATOR}${clause}`}
            </span>
          ))}
        </p>
        {/* The slot's children are this row's own flex children, not a right-anchored box, so
            a wrapped clause line starts on the caption's text edge; the doors anchor right
            through `ml-auto` on their group (`LibraryHomeStrip`). */}
        {headerEnd}
      </div>

      {graph.nodes.length === 0 ? (
        /*
         * An empty folder is answered by `LibraryPage` itself, but this widget still says so
         * rather than render a silent empty canvas.
         */
        <p
          data-testid="library-graph-empty"
          className="mt-2 text-label leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
        >
          {t("graph.empty")}
        </p>
      ) : (
        <>
        {/* Canvas and controls share a positioning context; the controls are real buttons,
            reachable by keyboard and touch-target gates. */}
        <div className="relative flex min-h-0 flex-1 flex-col">
        {/* The way back off an island, top-left like a map's "back to overview"; a `Surface`, so it has an exit motion. */}
        <Surface open={island !== null} className="absolute left-2 top-2 z-10 flex items-center gap-2" data-testid="library-graph-island-bar">
          {island ? (
          <>
            <button
              type="button"
              data-testid="library-graph-island-back"
              className={controlClass({ shape: "chip", tone: "muted" })}
              onClick={() => setIsland(null)}
            >
              <ArrowLeft size={ICON_SIZE.sm} aria-hidden />
              <span>{t("graph.islandBack")}</span>
            </button>
            <span className="text-label text-[color:var(--color-text-secondary)]" data-testid="library-graph-island-name">
              {t("graph.islandName", { name: island.label, pages: island.pages.length, sources: island.sources.length })}
            </span>
          </>
          ) : null}
        </Surface>
        <canvas
          ref={canvasRef}
          data-testid="library-graph-canvas"
          /* Machine-readable state: a canvas has no DOM to assert against. */
          data-hovered-node-id={hoveredId ?? ""}
          data-focused-node-id={focusedId ?? ""}
          data-selected-node-id={selectedId ?? ""}
          data-highlight={highlight === null ? "" : [...highlight].join(" ")}
          /* `data-view-scale` and `data-interaction` are written by the loop itself, only on change. */
          data-picture-aspect={engine.pictureAspect === null ? "" : engine.pictureAspect.toFixed(3)}
          data-labels="standing"
          data-active-kind={activeNode?.kind ?? ""}
          /*
           * A group, not an application, as `OntologyMap` decided for the same shape; only a
           * measured screen reader whose browse mode claims the arrows first reopens it.
           */
          role="group"
          tabIndex={0}
          aria-label={t("graph.canvasAria")}
          aria-describedby="library-graph-hint library-graph-keys"
          /* No border: the ground is the column's own `--color-canvas`, so the picture floats.
             The focus ring is the map's 2px indigo floor, which `outline-none` would drop. */
          className={cn(
            CANVAS_CLASS,
            "mt-2 block cursor-grab touch-none outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)]",
          )}
          onPointerDown={engine.onPointerDown}
          onPointerMove={engine.onPointerMove}
          onPointerUp={engine.onPointerUp}
          onPointerCancel={engine.onPointerCancel}
          onPointerLeave={engine.onPointerLeave}
          onDoubleClick={engine.onDoubleClick}
          onKeyDown={(event) => {
            const onIslands = engine.picture === "islands";
            if (event.key === "ArrowRight" || event.key === "ArrowDown") {
              event.preventDefault();
              if (onIslands) stepIsland(1);
              else stepFocus(1);
            } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
              event.preventDefault();
              if (onIslands) stepIsland(-1);
              else stepFocus(-1);
            } else if ((event.key === "Enter" || event.key === " ") && onIslands && focusedIsland) {
              event.preventDefault();
              setFocusedIslandId(null);
              setIsland(focusedIsland);
            } else if (event.key === "Enter" || event.key === " ") {
              const target = activeNode;
              if (!target) return;
              event.preventDefault();
              // The same card a press opens; it takes focus and Escape gives it back.
              pressMark(target);
            } else if (event.key === "Escape") {
              // With a card open its own capture listener has already answered this press.
              setFocusedId(null);
              setFocusedIslandId(null);
              setUnreadPressed(null);
              // With nothing else open, Escape is the way back off an island.
              if (cardId === null && island) setIsland(null);
            }
          }}
          /* Clears only the keyboard's position, except while a card is open: the card takes
             focus, and Escape must return to the mark, not the top of the walk. */
          onBlur={() => {
            if (cardId === null) setFocusedId(null);
            setFocusedIslandId(null);
          }}
        />
        {cardNode ? (
          <LibraryMarkPopover
            node={cardNode}
            facts={cardFacts?.(cardNode) ?? null}
            side={cardSide}
            // The cap, or the canvas minus gutters, resolved in CSS; placement measures `offsetWidth`.
            width={`min(${LIBRARY_CARD_MAX_WIDTH}px, calc(100% - ${LIBRARY_CARD_INSET * 2}px))`}
            cardRef={cardRef}
            flowStale={cardStale}
            expanded={cardExpanded}
            onExpand={() => setCardExpanded(true)}
            onOpen={() => activate(cardNode)}
            onOpenOnMap={cardNode.href ? () => activate(cardNode) : null}
            onClose={dismissCard}
            t={t}
          />
        ) : null}
        {/* Fit, desktop only: a phone pinches out, and a tile would cover its marks. It takes
            no `label`, since that mode wants a `.chrome-rail` ancestor; `title` names it. */}
        <div className="pointer-events-none absolute bottom-3 right-3 hidden md:block">
          <div className="pointer-events-auto">
            {/* Disabled while already framed, or a press repaints the same pixels; the tooltip names the state. */}
            <ChromeTile
              data-testid="library-graph-fit"
              data-framed={engine.framed ? "true" : "false"}
              icon={<Maximize2 />}
              title={engine.framed ? t("graph.fitDone") : t("graph.fit")}
              disabled={engine.framed}
              onClick={engine.fitToView}
            />
          </div>
        </div>
        </div>
        {/* The legend, `text-label` and tertiary because a newcomer must read it, capped at
            a reading measure. Every state's sentence sits in one grid cell so the row's height
            never changes, or the `flex-1` canvas above refits and moves every mark. */}
        <div className={cn("mt-1.5 grid max-w-[var(--measure-doc-column)]", captionQuiet && "max-lg:mt-0")}>
          {/* Invisible sizers for every state's sentence, so the tallest sets the height. */}
          {(compact ? ["graph.legendShort", "graph.legendShortCardOpen"] : ["graph.legend", "graph.legendCardOpen", "graph.legendIslands"]).map((key) => (
            <p
              key={key}
              aria-hidden
              className={cn(
                "invisible col-start-1 row-start-1 text-label leading-body [word-break:keep-all]",
                captionQuiet && "max-lg:sr-only",
                // Compact reserves one line: its legend and describe line are one sentence each.
                compact && "line-clamp-1",
              )}
            >
              {t(key as "graph.legend")}
            </p>
          ))}
          <p
            id="library-graph-hint"
            data-testid="library-graph-hint"
            /* Quiet goes on each line, not the cell: `sr-only` on the wrapper leaves the lines
               laid out at full size, still under the guide. */
            className={cn(
              "col-start-1 row-start-1 text-label leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]",
              captionQuiet && "max-lg:sr-only",
            )}
          >
            {/* A pointed-at mark or island is described in the same slot. An open card keeps
                the legend's vocabulary, or the reader loses the key; only the gesture clause
                swaps to the ways back out. */}
            {!activeNode && unreadPressed && engine.picture === "islands"
              ? t("graph.unreadPressed", { sources: unreadPressed.sources.length })
              : !activeNode && (hoveredIsland ?? focusedIsland) && engine.picture === "islands"
              ? (hoveredIsland ?? focusedIsland)!.kind === "unread"
                ? t("graph.describeUnread", { sources: (hoveredIsland ?? focusedIsland)!.sources.length })
                : t("graph.describeIsland", { name: (hoveredIsland ?? focusedIsland)!.label, pages: (hoveredIsland ?? focusedIsland)!.pages.length, sources: (hoveredIsland ?? focusedIsland)!.sources.length })
              : activeNode
              ? /* The open card's mark says how to leave it; any other mark, what a press does. */
                t(
                  `graph.${activeNode.id === cardId ? "describeOpen" : "describe"}.${activeNode.kind}`,
                  { name: activeNode.label },
                )
              : highlightNote
                ? highlightNote
                : compact
                ? /* Never empty: this is the canvas's `aria-describedby` target. */
                  t(cardNode ? "graph.legendShortCardOpen" : "graph.legendShort")
                : engine.picture === "islands" && !cardNode
                  ? t("graph.legendIslands")
                  : t(cardNode ? "graph.legendCardOpen" : "graph.legend")}
          </p>
        </div>
        {/* The keyboard path lives in the description only, never a rendered line on a phone. */}
        <span id="library-graph-keys" className="sr-only">
          {t("graph.keys")}
        </span>
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {announcement}
        </span>
        </>
      )}
    </section>
  );
}
