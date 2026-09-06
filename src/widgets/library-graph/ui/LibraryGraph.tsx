"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight } from "lucide-react";

import type { VaultDoc } from "@/entities/docs-vault";
import { useRouter } from "@/i18n/navigation";
import { useLocalStorageBoolean } from "@/shared/lib/use-local-storage-boolean";
import { usePrefersReducedMotion } from "@/shared/lib/use-prefers-reduced-motion";
import { useViewportBelow } from "@/shared/lib/use-viewport-below";
import { cn } from "@/shared/lib/cn";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/icon-size";

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
}

/**
 * Fixed by us, not by content: 320px at desktop, 240 in the one-column layout — and
 * **bounded by the height it is spending**, because 320 was chosen by width and paid in
 * height. Measured 2026-09-06: at 1040×720, this repository's own responsive floor, the
 * open section took 423 of 720px and left the document 297 (design-responsive). `34dvh`
 * holds the section under 46% of the row at every measured height and reaches the 320
 * ceiling from about 940px of viewport.
 */
const CANVAS_CLASS = "h-[240px] w-full lg:h-[min(320px,34dvh)]";
const FIT_PADDING = 26;
/**
 * The person's own answer to "do I want this open", per machine.
 *
 * `local-first.md` permits browser storage for a preference; it is never a second store
 * of anything the folder knows. The map's INDEX panel already persists this way, so a
 * disclosure of the same class that forgot every time would be the inconsistency
 * (design-interaction, 2026-09-06).
 */
const GRAPH_OPEN_KEY = "library:graph-open:v1";
/** Touch reach around a mark, in CSS px. Half of `--touch-target-min` (44) is the floor. */
const COARSE_HIT_REACH = 18;
/** `lg` — the same number the canvas height and the screen's own two-pane rule use. */
const WIDE_BREAKPOINT = 1024;

function selectionNodeId(selection: LibraryGraphSelection | null): string | null {
  if (!selection) return null;
  return selection.kind === "wiki" ? `page:${selection.ref}` : `source:${selection.ref}`;
}

export function LibraryGraph({ docs, wikiPages, sources, selection, onSelect }: LibraryGraphProps) {
  const t = useTranslations("library");
  const router = useRouter();
  const reducedMotion = usePrefersReducedMotion();
  const narrow = useViewportBelow(WIDE_BREAKPOINT);
  /*
   * **Open by default where there is room, closed where there is not.**
   *
   * The owner asked for the canvas to be *in this tab*, so at desktop it is there without
   * being asked for. Below `lg` this column only exists after a person has chosen
   * something to read, and 240px of canvas above that document would push the title of
   * the thing they just asked for under the fold — so the narrow default is closed
   * (design-lead and design-interaction, 2026-09-06, whose dissent is in the ledger).
   * Either way the person's own choice is remembered and wins.
   */
  const storedOpen = useLocalStorageBoolean(GRAPH_OPEN_KEY, !narrow);
  const [chosenOpen, setChosenOpen] = useState<boolean | null>(null);
  const open = chosenOpen ?? storedOpen;
  /**
   * One increment per **request** for the picture: the first time it can be drawn, and
   * every time a person opens the section. Deliberately not a width: the settle used to
   * restart on any resize, so dragging the window edge pinned the canvas on the seed
   * spiral for the whole drag, and below `lg` re-revealing the reader replayed the whole
   * arrival under a document that had cut in instantly (design-motion, 2026-09-06).
   */
  const [settleRequest, setSettleRequest] = useState(0);
  /** Latched on the first open: the force pass is kept afterwards, never re-run. */
  const [everOpened, setEverOpened] = useState(false);
  const toggleOpen = useCallback(() => {
    const next = !open;
    setChosenOpen(next);
    if (next) {
      setEverOpened(true);
      setSettleRequest((value) => value + 1);
    }
    try {
      window.localStorage.setItem(GRAPH_OPEN_KEY, next ? "1" : "0");
    } catch {
      /* private mode: the choice still holds for this session */
    }
  }, [open]);

  const graph = useMemo(
    () => buildLibraryGraph({ docs, wikiPages, sources }),
    [docs, sources, wikiPages],
  );
  /*
   * `.claude/rules/architecture.md`: the condition that draws a surface must guard the
   * work that builds its model. The force pass is the expensive part of this widget, so
   * it does not run while the section is closed, and it re-runs only when the graph's
   * own shape changes — not when a person selects or hovers something.
   */
  /**
   * The force pass, kept across a close and reopen.
   *
   * `architecture.md` asks that a surface that is not drawn does not pay for its model,
   * and this satisfies it exactly: nothing runs until the section is first opened.
   * Re-running it on every reopen would put up to 95ms of synchronous ForceAtlas2 on the
   * click frame, in front of a 420ms settle (design-motion, 2026-09-06). The cache is
   * keyed by the graph's own identity, so a folder that changed gets a new layout.
   */
  const layout = useMemo(
    () => (everOpened || open ? layoutLibraryGraph(graph) : null),
    [everOpened, graph, open],
  );

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inkRef = useRef<LibraryGraphInk | null>(null);
  const positionsRef = useRef<Map<string, LayoutPoint>>(new Map());
  const progressRef = useRef(1);
  const drawRef = useRef<() => void>(() => undefined);

  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

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
  }, [open]);

  // ── One settle per request, then nothing moves. ──
  const settledForRef = useRef<{ layout: LibraryGraphLayout | null; request: number }>({
    layout: null,
    request: -1,
  });
  useEffect(() => {
    // Width is the gate — can this be drawn yet — never the trigger.
    if (!layout || size.width === 0) return;
    if (settledForRef.current.layout === layout && settledForRef.current.request === settleRequest) {
      return;
    }
    settledForRef.current = { layout, request: settleRequest };
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
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const elapsed = now - started;
      progressRef.current = Math.min(1, elapsed / duration);
      drawRef.current();
      if (progressRef.current < 1) frame = requestAnimationFrame(tick);
    };
    progressRef.current = 0;
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // `size.width` stays in the list because the first measurement arrives after mount and
    // the effect has to run again once there is a box; the ref above is what keeps that
    // second run — and every later resize — from restarting the arrival.
  }, [layout, reducedMotion, settleRequest, size.width]);

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
    <section
      data-testid="library-graph"
      data-open={open ? "true" : "false"}
      aria-label={t("graph.title")}
      className="flex-none border-b border-[color:var(--color-border-soft)] px-3 py-2"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded={open}
          data-testid="library-graph-toggle"
          className={controlClass({ shape: "chip", tone: "muted", className: "gap-1.5" })}
        >
          {open ? (
            <ChevronDown size={ICON_SIZE.sm} aria-hidden />
          ) : (
            <ChevronRight size={ICON_SIZE.sm} aria-hidden />
          )}
          {t("graph.title")}
        </button>
        {/* The counts are the caption of the picture, so they stand beside its title
            whether it is open or closed: closed, they are the whole of what it says. */}
        <p
          data-testid="library-graph-counts"
          className="min-w-0 truncate text-label leading-body text-[color:var(--color-text-tertiary)]"
        >
          {caption}
        </p>
      </div>

      {open ? (
        wikiPages.length === 0 ? (
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
                "mt-2 block outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)]",
              )}
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
        )
      ) : null}
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
