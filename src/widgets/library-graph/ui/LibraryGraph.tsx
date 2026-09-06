"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { Maximize2 } from "lucide-react";
import { useTranslations } from "next-intl";

import type { VaultDoc } from "@/entities/docs-vault";
import { useRouter } from "@/i18n/navigation";
import { usePrefersReducedMotion } from "@/shared/lib/use-prefers-reduced-motion";
import { cn } from "@/shared/lib/cn";
import { ChromeTile } from "@/shared/ui";

import {
  buildLibraryGraph,
  type LibraryGraphNode,
  type LibraryGraphPage,
  type LibraryGraphSource,
} from "../model/build-library-graph";
import { useLibraryGraphEngine } from "./use-library-graph-engine";

/**
 * **The library's graph — one live canvas of what this folder's write-ups are made of.**
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
 * A picture that shows the whole folder at once is an *overview*, so the pane **is** this
 * canvas whenever nothing is chosen, the way the map fills its own tab.
 *
 * ## Motion — a live simulation, reversing 2026-09-06
 *
 * ⚠️ This file used to say: *"One settle, then stillness … a live simulation beside a
 * document a person is reading is movement with nothing to say."* The owner looked at the
 * result on 2026-09-07 and rejected it — *"this graph does not move, it is fixed, and
 * that is a shame. Improve it now — it has to be excellent, built to the highest visual
 * standard."* The
 * argument was wrong about this folder: with six pages citing the same seven sources, a
 * settled layout is a hairball, and the only way to read a hairball is to **pull it
 * apart**, which needs physics that are still running when the hand arrives.
 *
 * So: `library-force-simulation.ts` steps on `requestAnimationFrame` while the picture is
 * arriving, re-heats when it is disturbed, and afterwards keeps a bounded ambient drift
 * (0.28px per axis, 0.4px radial, 7.2s) so the canvas never reads as a frozen image. Under
 * `prefers-reduced-motion` it settles synchronously and the drift does not exist —
 * an endless drift is exactly the family that preference is for. `docs/DECISIONS.md`,
 * 2026-09-07, carries the reversal, its numbers, and the dissent.
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
 * **No fixed height, and no width cap either — the canvas is the pane.**
 *
 * The height stopped being a band on 2026-09-06, when the owner made the picture the tab.
 * The **width** cap went on 2026-09-07: it existed because a uniform fit of a settled
 * ForceAtlas2 cloud into a wide box left gutters wider than the marks, so the box was cut
 * down to the picture. The live simulation's gravity is shaped like the canvas instead, so
 * the picture grows into the box (measured 67.8% of the width and 91.6% of the height on
 * the owner's own folder shape, against 33.5% before) — and a canvas a person can now pan
 * and zoom has to be the whole pane, because the frame is the workspace.
 */
const CANVAS_CLASS = "min-h-0 w-full flex-1";
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

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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

  const standingLabels = graph.nodes.length <= STANDING_LABEL_MAX_NODES;
  const engine = useLibraryGraphEngine({
    graph,
    canvasRef,
    reducedMotion,
    selectedId,
    hoveredId,
    focusedId,
    activeLabel,
    standingLabels,
    onHover: setHoveredId,
    onActivate: activate,
  });

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
        {/* The canvas and its one control share a positioning context; the control is a
            real button over the canvas rather than a painted mark, so it is reachable by
            the keyboard and measurable by every touch-target gate in the repository. */}
        <div className="relative flex min-h-0 flex-1 flex-col">
        <canvas
          ref={canvasRef}
          data-testid="library-graph-canvas"
          /* Machine-readable state, because a canvas has no DOM to assert against and
             every interaction claim would otherwise be unfalsifiable
             (design-interaction, 2026-09-06). */
          data-hovered-node-id={hoveredId ?? ""}
          data-focused-node-id={focusedId ?? ""}
          data-selected-node-id={selectedId ?? ""}
          /* The picture's own aspect, for the same reason as the three above: a canvas has
             no DOM, so a claim about the shape of what it drew is otherwise unfalsifiable.
             `data-view-scale` and `data-interaction` are written by the loop itself, once
             per frame and only when they change — a gesture's identity (a grabbed node
             versus a panned background) cannot be read from pixels at all. */
          data-picture-aspect={engine.pictureAspect === null ? "" : engine.pictureAspect.toFixed(3)}
          /* Which naming policy is in force. Same reason as the four above: a claim about
             what a canvas draws has to be checkable from outside it. */
          data-labels={standingLabels ? "standing" : "hover"}
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
            "mt-2 block cursor-grab touch-none outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)]",
          )}
          onPointerDown={engine.onPointerDown}
          onPointerMove={engine.onPointerMove}
          onPointerUp={engine.onPointerUp}
          onPointerCancel={engine.onPointerCancel}
          onPointerLeave={engine.onPointerLeave}
          onDoubleClick={engine.onDoubleClick}
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
        {/* The way back to the whole picture after a zoom or a pan. Desktop only: a
            coarse pointer fits by pinching out, and a floating 36px tile over a
            phone-sized canvas would cover the marks it is meant to help find. The shared
            `ChromeTile` rather than a hand-rolled square, so it inherits the 36px chrome
            contract and its own 44px coarse-pointer promotion; `title` is the accessible
            name, and no `label` because that mode wants a `.chrome-rail` ancestor this
            canvas has no reason to grow. */}
        <div className="pointer-events-none absolute bottom-3 right-3 hidden md:block">
          <div className="pointer-events-auto">
            <ChromeTile
              data-testid="library-graph-fit"
              icon={<Maximize2 />}
              title={t("graph.fit")}
              onClick={engine.fitToView}
            />
          </div>
        </div>
        </div>
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
