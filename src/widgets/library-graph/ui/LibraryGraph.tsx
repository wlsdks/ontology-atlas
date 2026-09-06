"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import type { VaultDoc } from "@/entities/docs-vault";
import { useRouter } from "@/i18n/navigation";
import { usePrefersReducedMotion } from "@/shared/lib/use-prefers-reduced-motion";
import { cn } from "@/shared/lib/cn";

import {
  buildLibraryGraph,
  type LibraryGraph,
  type LibraryGraphNode,
  type LibraryGraphPage,
  type LibraryGraphSource,
} from "../model/build-library-graph";
import {
  fitToBox,
  interpolatePositions,
  layoutLibraryGraph,
  type LayoutPoint,
  type LibraryGraphLayout,
} from "../model/library-graph-layout";
import { drawLibraryGraph, hitTestLibraryGraph } from "../render/draw-library-graph";
import { readLibraryGraphInk, type LibraryGraphInk } from "../render/library-graph-ink";

/**
 * **The library's graph — one small canvas of what this folder's write-ups are made of.**
 *
 * The owner asked for it on 2026-09-06, and asked for it to be *separate from the map*:
 * *"a canvas that shows all the connected data in 2D … separate from (map, architecture)!
 * small circles, like a force graph, inside this tab."* The separation is the design, not
 * a limitation. The map draws the ontology a person curates; this draws the paper trail
 * underneath it — which file was read, what was written from it, and which concepts that
 * write-up reaches. Merging them would put a PDF on the meaning graph, which is exactly
 * what `sources/` exists to prevent.
 *
 * ## Why it is a section, not a third pane
 *
 * The Library is already an index and a reader, and a person opening it came to read.
 * A picture that shows the whole folder at once is an *overview*, so it sits above the
 * reader as one disclosure the person opens and closes, rather than taking a column from
 * either. Closed, it costs one row.
 *
 * ## Motion
 *
 * One settle, then stillness. The force pass runs to completion before the first frame
 * (`layoutLibraryGraph`), and the animation only carries the dots from their seed ring to
 * where they already belong — the picture arriving, not a simulation running. A live
 * simulation beside a document a person is reading is movement with nothing to say.
 *
 * The clock is `--topology-motion-camera-duration` (420ms), which
 * `.claude/rules/design.md` names as the repository's canvas-travel value ("camera/drag
 * values 420/720ms are canvas-only"). ⚠️ Its **name** still says topology because the map
 * was the only canvas when it was minted; renaming it is a `design-contract` change and
 * belongs to that gate, not to this widget. Inventing a second 600ms value here would
 * have been the actual defect: an off-ramp duration that no gate can see.
 *
 * Under `prefers-reduced-motion` the settled frame is drawn once, with no interpolation.
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
  /**
   * What the screen hangs at the right of the caption row — the Library passes its status
   * strip and the chip that opens the shelf.
   *
   * A slot rather than props, because both are the **view's** facts: which step is next,
   * and where the guide lives. `src/widgets/` sits below `src/views/` in the import
   * direction, so a widget cannot reach either; handing the rendered nodes down is the
   * direction that is allowed and the one that keeps this canvas about the canvas.
   */
  headerEnd?: ReactNode;
}

/**
 * **No fixed height any more — the canvas is the pane.**
 *
 * It used to be `h-[240px] lg:h-[min(320px,34dvh)]`: a band bounded by the height it was
 * spending, because it sat above a reader that had to keep most of the column. The owner
 * removed that premise on 2026-09-06 — the pane *is* this picture — so the height is the
 * box's, exactly as the map's canvas takes its tab.
 *
 * The **width** is still not "all of it": `w-full` is the ceiling and the real width is
 * the picture's own, capped at render time (see `canvasMaxWidth`), which is what keeps a
 * uniform fit from leaving gutters wider than the marks.
 */
const CANVAS_CLASS = "min-h-0 w-full flex-1";
const FIT_PADDING = 26;
/**
 * The narrowest the canvas is ever allowed to become.
 *
 * The width cap below is derived from the picture, and a folder whose graph settles into
 * a near-circle would otherwise pull the box down to roughly its own height — a canvas too
 * small to carry a label, and a focus ring around a postage stamp.
 */
const MIN_CANVAS_WIDTH = 320;
/**
 * The order at which every mark stops carrying its own name and hover takes over.
 *
 * **Chosen by what fits, not by taste.** A standing name is about 11px tall and up to
 * 132px wide, and the collision pass hides whichever ones cannot stand clear — so past
 * some order the picture is a field of hidden labels plus the few that happened to win,
 * which reads as an arbitrary subset rather than a policy. 60 is where the seeded folders
 * measured here stop placing most of them; above it the honest answer is that this is an
 * overview and a name is something you ask a dot for.
 */
const STANDING_LABEL_MAX_NODES = 60;
/** Touch reach around a mark, in CSS px. Half of `--touch-target-min` (44) is the floor. */
const COARSE_HIT_REACH = 18;

function selectionNodeId(selection: LibraryGraphSelection | null): string | null {
  if (!selection) return null;
  return selection.kind === "wiki" ? `page:${selection.ref}` : `source:${selection.ref}`;
}

export function LibraryGraph({
  docs,
  wikiPages,
  sources,
  selection,
  onSelect,
  headerEnd,
}: LibraryGraphProps) {
  const t = useTranslations("library");
  const router = useRouter();
  const reducedMotion = usePrefersReducedMotion();

  const graph = useMemo(
    () => buildLibraryGraph({ docs, wikiPages, sources }),
    [docs, sources, wikiPages],
  );
  /**
   * The force pass — **once per folder, and never again**.
   *
   * `.claude/rules/architecture.md` asks that a surface which is not drawn does not pay
   * for its model. This one is now always drawn: the Library's pane **is** this canvas
   * whenever nothing is chosen, so the up-to-95ms pass is the first frame's own cost
   * rather than a cost paid for something hidden. It is memoised on the graph's identity,
   * so selecting a document, hovering a dot or standing the whole widget aside while a
   * page is open never re-runs it.
   */
  const layout = useMemo(() => layoutLibraryGraph(graph), [graph]);

  /**
   * **The picture's own aspect, which is what the canvas is then cut to.**
   *
   * A uniform fit takes the smaller of the two scales, so in a box far wider than the
   * cloud it is the **height** that decides how big the picture is and the extra width is
   * spent on nothing. Measured on the seeded folder at 1512 before this: a 1144px canvas
   * carrying a 462px picture — 40.4% fill, with a 341px gutter on each side — while the
   * height was already 86.6% used. No scale can spend that width without distorting
   * distance, which `fitToBox` exists to refuse.
   *
   * So the **box** moves instead: the canvas is never wider than the picture it frames
   * plus the label allowance the fit already reserves. The picture is unchanged — a
   * uniform fit under a capped height cannot grow — but the frame, the focus ring and the
   * hit area stop being three times the width of what they contain, and the section lines
   * up with the reader's own column instead of spanning the pane behind it.
   */
  const pictureAspect = useMemo(() => {
    if (!layout || layout.settled.size < 2) return null;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const point of layout.settled.values()) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
    const spanX = maxX - minX;
    const spanY = maxY - minY;
    if (!(spanX > 0) || !(spanY > 0)) return null;
    return spanX / spanY;
  }, [layout]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inkRef = useRef<LibraryGraphInk | null>(null);
  const positionsRef = useRef<Map<string, LayoutPoint>>(new Map());
  const progressRef = useRef(1);
  const drawRef = useRef<() => void>(() => undefined);

  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  /**
   * The width cap, in CSS pixels, or null while nothing has been measured.
   *
   * It reads the canvas's **height** and never its width, so applying it cannot feed
   * itself: the observer fires once more with the narrower box, the height is the same
   * number, and the cap does not move. The height comes from CSS
   * (`h-[240px] lg:h-[min(320px,34dvh)]`), so it is independent of this value by
   * construction rather than by luck.
   */
  const canvasMaxWidth =
    pictureAspect !== null && size.height > 0
      ? Math.max(
          MIN_CANVAS_WIDTH,
          Math.round((size.height - FIT_PADDING * 2) * pictureAspect + FIT_PADDING * 2),
        )
      : null;

  const selectedId = selectionNodeId(selection);
  const activeId = hoveredId ?? focusedId;
  const activeNode = useMemo(
    () => graph.nodes.find((node) => node.id === activeId) ?? null,
    [activeId, graph.nodes],
  );
  /**
   * What the label says. A concept is the one mark whose click **leaves this screen**,
   * so its destination is part of its name rather than a surprise afterwards
   * (design-interaction, 2026-09-06: one verb must not stand for three outcomes).
   */
  const activeLabel = activeNode
    ? activeNode.kind === "concept" && activeNode.href
      ? `${activeNode.label} · ${t("graph.openOnMap")}`
      : activeNode.label
    : null;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layout || size.width === 0 || size.height === 0) return;
    /*
     * The ink is resolved from the canvas element itself and cached. A throw here would
     * mean the application's own palette is missing from `app/globals.css`, in which case
     * every other surface is already broken — so it is left to propagate rather than
     * absorbed into a silent default that renders in no colour.
     */
    inkRef.current ??= readLibraryGraphInk(canvas);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;

    const box = { width: size.width, height: size.height, padding: FIT_PADDING };
    const seeds = fitToBox(layout.seeds, box);
    const settled = fitToBox(layout.settled, box);
    const positions = interpolatePositions(seeds, settled, progressRef.current);
    positionsRef.current = positions;

    const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    const deviceWidth = Math.round(size.width * dpr);
    const deviceHeight = Math.round(size.height * dpr);
    if (canvas.width !== deviceWidth) canvas.width = deviceWidth;
    if (canvas.height !== deviceHeight) canvas.height = deviceHeight;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawLibraryGraph(context, {
      nodes: graph.nodes,
      edges: graph.edges,
      positions,
      width: size.width,
      height: size.height,
      ink: inkRef.current,
      selectedId,
      hoveredId,
      focusedId,
      activeLabel,
      standingLabels: graph.nodes.length <= STANDING_LABEL_MAX_NODES,
    });
  }, [activeLabel, focusedId, graph.edges, graph.nodes, hoveredId, layout, selectedId, size.height, size.width]);

  // ── The canvas's own width, measured rather than guessed. ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setSize((current) =>
        Math.abs(current.width - rect.width) < 0.5 && Math.abs(current.height - rect.height) < 0.5
          ? current
          : { width: rect.width, height: rect.height },
      );
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  // ── One settle per layout, then nothing moves. ──
  const settledForRef = useRef<{ layout: LibraryGraphLayout | null }>({ layout: null });
  /** The animation frame in flight, owned across effect runs rather than by one of them. */
  const frameRef = useRef(0);
  useEffect(() => {
    // Width is the gate — can this be drawn yet — never the trigger.
    if (!layout || size.width === 0) return;
    if (settledForRef.current.layout === layout) return;
    settledForRef.current = { layout };
    if (reducedMotion) {
      progressRef.current = 1;
      drawRef.current();
      return;
    }
    const canvas = canvasRef.current;
    const duration = canvas ? readCanvasTravelMs(canvas) : 0;
    if (duration <= 0) {
      progressRef.current = 1;
      drawRef.current();
      return;
    }
    /*
     * ⚠️ **The frame lives in a ref, and this effect does not cancel it on the way out.**
     *
     * It used to hold the id in a local and cancel it from the cleanup, which is correct
     * only while nothing in the dependency list can change during the 420ms the settle
     * lasts. `size.width` can — it did the moment the canvas started taking its width from
     * the picture (2026-09-06): the first measurement is the full column, the cap narrows
     * the box, the observer reports the new width, this effect re-runs, its cleanup kills
     * the animation, and the guard above returns before starting another. Measured, the
     * picture froze at about 0.85 of the way in: a 1.72-aspect cloud drew at 0.83 and
     * filled 231 of 462 usable pixels, which reads as a small graph rather than a stopped
     * one. Cancelling now belongs to the two events that mean it: a **new** settle, and
     * unmount.
     */
    cancelAnimationFrame(frameRef.current);
    const started = performance.now();
    const tick = (now: number) => {
      const elapsed = now - started;
      progressRef.current = Math.min(1, elapsed / duration);
      drawRef.current();
      if (progressRef.current < 1) frameRef.current = requestAnimationFrame(tick);
    };
    progressRef.current = 0;
    frameRef.current = requestAnimationFrame(tick);
    // `size.width` stays in the list because the first measurement arrives after mount and
    // the effect has to run again once there is a box; the ref above is what keeps that
    // second run — and every later resize — from restarting the arrival.
  }, [layout, reducedMotion, size.width]);

  /** The settle's only other end: the widget going away. */
  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  // ── Every other reason to repaint: selection, hover, keyboard focus, a resize. ──
  useEffect(() => {
    // The animation loop paints through this ref so it never closes over a stale frame:
    // a hover arriving mid-settle has to change the next frame, not the frame after the
    // settle finishes.
    drawRef.current = draw;
    draw();
  }, [draw]);

  const pointFromEvent = (event: { clientX: number; clientY: number }): LayoutPoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  /**
   * A finger is not a mouse pointer, and a painted dot is invisible to every touch-target
   * gate in this repository (they measure DOM elements). `any-pointer: coarse` is the
   * capability question — never a viewport width — and it widens the reach rather than
   * the mark, so the picture keeps its scale (design-responsive, 2026-09-06).
   */
  const coarsePointer = (): boolean =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(any-pointer: coarse)").matches;
  const hitTest = (point: LayoutPoint): LibraryGraphNode | null =>
    hitTestLibraryGraph(
      { nodes: graph.nodes, positions: positionsRef.current },
      point,
      coarsePointer() ? COARSE_HIT_REACH : undefined,
    );

  const activate = useCallback(
    (node: LibraryGraphNode) => {
      if (node.kind === "concept") {
        // A concept is not a file in this folder, so there is nothing here to open. It
        // belongs to the map, and the map's own deeplink is what takes a person there.
        // The label said so before the click.
        if (node.href) router.push(node.href);
        return;
      }
      onSelect({ kind: node.kind === "page" ? "wiki" : "source", ref: node.ref });
    },
    [onSelect, router],
  );

  const ordered = graph.nodes;
  const stepFocus = useCallback(
    (delta: number) => {
      if (ordered.length === 0) return;
      const current = ordered.findIndex((node) => node.id === focusedId);
      const next = current === -1 ? (delta > 0 ? 0 : ordered.length - 1) : (current + delta + ordered.length) % ordered.length;
      setFocusedId(ordered[next]?.id ?? null);
    },
    [focusedId, ordered],
  );

  /**
   * A coarse pointer has no hover, so the first tap would otherwise **be** the commit on
   * a 9px target — including the one commit that leaves the screen. On touch the first
   * tap names the dot and the second one opens it (design-interaction, 2026-09-06).
   */
  const coarseTapRef = useRef<string | null>(null);

  /**
   * What a screen reader is told: the kind, the name, where in the traversal it is, and
   * **what Enter will do** — the one thing a bare title cannot say, and the one thing that
   * differs between a dot that selects here and a dot that leaves for the map.
   */
  const announcement = activeNode
    ? t("graph.announce", {
        kind: t(`graph.kind.${activeNode.kind}`),
        name: activeNode.label,
        position: graph.nodes.indexOf(activeNode) + 1,
        total: graph.nodes.length,
        action: t(activeNode.kind === "concept" ? "graph.actionMap" : "graph.actionSelect"),
      })
    : "";

  const counts = graph.counts;
  /*
   * The two relations are counted apart. One "links" number could not say whether the
   * dashed mark matters in this folder at all, and the caption is the picture's only
   * written statement of what it contains (design-infoviz, 2026-09-06).
   */
  const caption = t("graph.counts", {
    sources: counts.sources,
    pages: counts.pages,
    concepts: counts.concepts,
    cites: counts.cites,
    mentions: counts.mentions,
  });

  return (
    /*
     * **The pane, not a strip on top of it** (2026-09-06, owner). This was a `flex-none`
     * band of at most 320px above the reader, opened by a chip: *"shouldn't the Library
     * tab's default be the graph on top? why is the area split above and below?"* The
     * split was the defect — an overview and a guide taking turns for the same column,
     * neither of them the screen. So the picture is what the tab shows, the way the map
     * fills its own tab, and the guide it used to share the column with became a popup
     * one press away. `docs/DECISIONS.md`, 2026-09-06.
     */
    <section
      data-testid="library-graph"
      aria-label={t("graph.title")}
      className="flex min-h-0 flex-1 flex-col px-5 py-2 sm:px-6 md:px-10"
    >
      <div className="flex flex-none flex-wrap items-center gap-x-3 gap-y-1">
        {/* The counts are the caption of the picture, and now its only title: with the
            canvas always drawn there is no disclosure left to name. */}
        <p
          data-testid="library-graph-counts"
          className="min-w-0 truncate text-label leading-body text-[color:var(--color-text-tertiary)]"
        >
          {caption}
        </p>
        {/* Whatever the screen wants to hang on this row — the status strip and the door
            to the shelf, both of which are the view's facts, not the canvas's. A widget
            below `views` cannot reach them, so they arrive as a slot. */}
        {headerEnd ? <div className="ml-auto flex items-center gap-2">{headerEnd}</div> : null}
      </div>

      {graph.nodes.length === 0 ? (
        <p
          data-testid="library-graph-empty"
          className="mt-2 text-label leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
        >
          {t("graph.empty")}
        </p>
      ) : (
        <>
        <canvas
          ref={canvasRef}
          data-testid="library-graph-canvas"
          /* Machine-readable state, because a canvas has no DOM to assert against and
             every interaction claim would otherwise be unfalsifiable
             (design-interaction, 2026-09-06). */
          data-hovered-node-id={hoveredId ?? ""}
          data-focused-node-id={focusedId ?? ""}
          data-selected-node-id={selectedId ?? ""}
          /* The picture's own aspect and the width it earned, for the same reason as
             the four above: a canvas has no DOM, so a claim about how much of it the
             picture fills is otherwise unfalsifiable. */
          data-picture-aspect={pictureAspect === null ? "" : pictureAspect.toFixed(3)}
          /* Which naming policy is in force. Same reason as the four above: a claim about
             what a canvas draws has to be checkable from outside it. */
          data-labels={graph.nodes.length <= STANDING_LABEL_MAX_NODES ? "standing" : "hover"}
          data-active-kind={activeNode?.kind ?? ""}
          /*
           * `group`, not `application`. `TopologyMapV2` decided this for the identical
           * shape — a hit-tested canvas graph with arrow traversal — and named the one
           * condition that reopens it: a measured screen reader whose browse mode
           * claims the arrows first. Taking every key away pre-emptively, without that
           * measurement, would silently reverse a standing decision.
           */
          role="group"
          tabIndex={0}
          aria-label={t("graph.canvasAria")}
          aria-describedby="library-graph-hint library-graph-keys"
          /* No border and the canvas ground **is** `--color-canvas`, the same ink this
             column is painted in, so the picture floats in the section instead of
             sitting in a mostly empty box: at 1512 the frame was the largest bounded
             shape on the screen while its marks used a third of it (design-lead,
             2026-09-06). The focus ring is the map's, verbatim — its own outline is the
             repository's 2px indigo floor, which `outline-none` had opted out of. */
          className={cn(
            CANVAS_CLASS,
            "mx-auto mt-2 block outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)]",
          )}
          /* A measured number, not a design value: it is the picture's own width plus
             the fit's padding, so it belongs to the data rather than to the ramp. The
             box keeps the column's **left** edge rather than centring inside it, so
             the picture begins where its own caption and legend begin. */
          style={canvasMaxWidth === null ? undefined : { maxWidth: `${canvasMaxWidth}px` }}
          onPointerMove={(event) => {
            if (event.pointerType === "touch") return;
            const point = pointFromEvent(event);
            if (!point) return;
            const hit = hitTest(point);
            setHoveredId(hit?.id ?? null);
            // Nothing else on this canvas says a dot can be pressed, and no gate can
            // see a cursor over a painted mark (`cursor-affordance.spec.ts` measures
            // DOM elements only).
            event.currentTarget.style.cursor = hit ? "pointer" : "default";
          }}
          onPointerLeave={() => setHoveredId(null)}
          onClick={(event) => {
            const point = pointFromEvent(event);
            if (!point) return;
            const hit = hitTest(point);
            if (!hit) return;
            /*
             * A coarse pointer never hovered, so the first tap would otherwise be the
             * commit on a 9px target — including the one commit that leaves this
             * screen. The first tap names the dot; the second one opens it.
             */
            if (coarsePointer() && coarseTapRef.current !== hit.id) {
              coarseTapRef.current = hit.id;
              setHoveredId(hit.id);
              return;
            }
            coarseTapRef.current = null;
            activate(hit);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowDown") {
              event.preventDefault();
              stepFocus(1);
            } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
              event.preventDefault();
              stepFocus(-1);
            } else if (event.key === "Enter" || event.key === " ") {
              const target = activeNode;
              if (!target) return;
              event.preventDefault();
              activate(target);
            } else if (event.key === "Escape") {
              setFocusedId(null);
            }
          }}
          /* Only the keyboard's own position leaves with the keyboard. A pointer that
             has wandered off is cleared by `pointerleave`, not by this. */
          onBlur={() => setFocusedId(null)}
        />
        {/* The legend: what the three marks mean, and the one verb. `text-label`
            rather than `text-caption` because 9.5px is this product's uppercase-eyebrow
            size and this is the sentence a newcomer has to read; `text-tertiary`
            because quaternary is for what may go unread (design-lead, 2026-09-06). */}
        <p
          id="library-graph-hint"
          data-testid="library-graph-hint"
          className="mt-1.5 text-label leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
        >
          {t("graph.legend")}
        </p>
        {/* The keyboard path is said to the people who need it and not to the ones
            who do not: it is part of the canvas's description, never a rendered line
            telling a phone to press arrow keys. */}
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

/**
 * The settle's clock, in milliseconds, read from the canvas travel token.
 *
 * Parsed rather than transcribed: a copied `420` in this file would be a second value
 * nothing keeps in step with the CSS ramp, which is precisely how the JS motion mirror
 * drifted two steps in 2026-07-28. Zero means "no motion is possible here" — the caller
 * draws the settled frame at once, which is also the reduced-motion behaviour.
 */
function readCanvasTravelMs(element: Element): number {
  const raw = getComputedStyle(element).getPropertyValue("--topology-motion-camera-duration").trim();
  if (raw.endsWith("ms")) return Number.parseFloat(raw);
  if (raw.endsWith("s")) return Number.parseFloat(raw) * 1000;
  return 0;
}
