"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { Maximize2 } from "lucide-react";
import { useTranslations } from "next-intl";

import type { VaultDoc } from "@/entities/docs-vault";
import { EMPTY_LIBRARY_WORK_ACTIVITY, type LibraryWorkActivity } from "@/features/library";
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
 * ## Motion — live under a hand, still under a gaze
 *
 * The physics is live: `library-force-simulation.ts` steps on `requestAnimationFrame`
 * while the picture is arriving and re-heats when a hand disturbs it. With ten pages
 * citing the same eight files a settled layout is a hairball, and the only way to read a
 * hairball is to **pull it apart** — which needs forces still running when the hand
 * arrives (2026-09-07, owner).
 *
 * ⚠️ **It also used to keep a 0.28px/7.2s ambient drift after it settled**, so the canvas
 * never read as a frozen image. The owner reversed that on 2026-09-08 in the installed
 * app — *"why does it wriggle whenever I put the mouse on the graph? it is hard to look
 * at … get rid of that strange effect"* — and the drift is gone entirely. What is left is
 * the rule the reversal is really about: **motion here is only ever the answer to
 * something a person did.** Hover changes ink and nothing else; the loop stops painting
 * the moment nothing is moving. `docs/DECISIONS.md`, 2026-09-08.
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
   * The marks a sentence **outside this canvas** is currently about.
   *
   * The Library's home strip has one clause per unfinished fact, and pressing the stale
   * one has to show *which* citation it means. The picture answers that the way a hover
   * already does — these node ids keep their ink and the rest of the folder ramps down to
   * quaternary — and, per 2026-09-08 "The Library graph stands still", **no mark moves**.
   * A pointer or the keyboard still wins over it. Null is the resting state.
   */
  highlight?: ReadonlySet<string> | null;
  /**
   * What the {@link highlight} is, in one sentence, for the legend's own slot.
   *
   * ⚠️ **Because a picture that dims is otherwise a state with no words.** Three cold
   * walkers pressed the home strip's stale clause and all three recorded the same two
   * failures (2026-09-12): *"no list appeared… the words looked exactly as they did
   * before the press, so I couldn't tell the filter was on"*, and *"there is no visible
   * way to return the dimmed half to normal."* Two of them also counted the lit marks
   * against the clause's number and got six against three — correctly, because a citation
   * has two ends, and nothing said so.
   *
   * The legend's slot is the answer rather than a new box: it is already the line that
   * says what the marks mean and already swaps for a description of the pointed-at mark,
   * and both sentences share one grid cell so the row's height never moves. A hover still
   * wins over it — pointing at a dot is a more specific question than the clause.
   */
  highlightNote?: string | null;
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
  /**
   * **The caption yields while a surface stands over it** (2026-09-06).
   *
   * The legend is a line at the foot of this section, so at `lg` and above the Library's
   * guide — 360×469, hung from the row's top right — never reaches it. Below `lg` the
   * canvas is the top half of one column and the panel does: measured at 768×1024 and
   * 390×844, `elementsFromPoint` found the panel over all three probe points of this
   * sentence. Overlap is not tolerated because a surface "mostly still works"
   * (`docs/DESIGN-SYSTEM.md`, Don'ts), and the two honest fixes are to move the surface
   * clear or to let the quieter thing stand aside; a sentence explaining marks that are
   * themselves behind the panel is the quieter thing.
   *
   * It stays in the document as `sr-only`, never unmounted: it is the canvas's
   * `aria-describedby` target, and dropping it would take the marks' meaning away from
   * the reader who has no picture at all.
   */
  captionQuiet?: boolean;
  /**
   * **This canvas is a column beside something else, not the pane** (direction B,
   * 2026-09-08). The legend is a teaching line written for a picture that fills the pane;
   * in a 368px column it wrapped to four lines and became more furniture than picture
   * (measured at 1512 with the reader open). Compact keeps the slot — so a hover still has
   * somewhere to say what a mark is — and drops the standing sentence.
   */
  compact?: boolean;
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
  activity = EMPTY_LIBRARY_WORK_ACTIVITY,
  visible = true,
  highlight = null,
  highlightNote = null,
  headerEnd,
  captionQuiet = false,
  compact = false,
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
    highlight,
    activeLabel,
    standingLabels,
    activity,
    visible,
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
        {headerEnd ? (
          /* `min-w-0` + wrap: below ~560px the status strip takes its own line instead of
             truncating its payload or clipping the shelf chip out of reach (design-responsive,
             council 2026-09-07: measured at 320 and 390); at 768 and above one line as before. */
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1">{headerEnd}</div>
        ) : null}
      </div>

      {graph.nodes.length === 0 ? (
        /*
         * ⚠️ **The Library no longer reaches this branch** (2026-09-06). A folder with no
         * sources and no pages draws no nodes, and that is exactly the state `LibraryPage`
         * now answers with a centred empty stage instead of a workbench — the owner read
         * the old frame, where this sentence lay under a 560px popup, as broken. The
         * branch stays because this widget is not the Library's alone to guarantee: a
         * canvas that renders nothing and says nothing is worse than one that says so.
         */
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
          /* Which marks a sentence off-canvas is holding, so a spec can assert the ramp
             without reading pixels — the same reason the three ids above are written. */
          data-highlight={highlight === null ? "" : [...highlight].join(" ")}
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
           * `group`, not `application`. `OntologyMap` decided this for the identical
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
            because quaternary is for what may go unread (design-lead, 2026-09-06).

            ⚠️ **The row's height is the legend's, at every width and in every state.**
            The line below swaps the legend sentence for a description of the pointed-at
            mark, and "the same slot" was only true where both fitted on one line. Measured
            on 2026-09-08: at 1040×720, 768 and 390 the legend wraps and the description
            does not, so the row lost 20px the instant a pointer touched a dot — and the
            canvas is `flex-1` above it, so it *grew by 20px*, re-fitted, and moved every
            mark. That is a whole line-height of movement on every hover, against the 0.4px
            of ambient drift removed the same day, and it is the larger half of what the
            owner saw. Both sentences are laid in one grid cell so the taller of them sets
            the height and the visible one never changes it. */}
        <div className={cn("mt-1.5 grid", captionQuiet && "max-lg:mt-0")}>
          <p
            aria-hidden
            className={cn(
              "invisible col-start-1 row-start-1 text-label leading-body [word-break:keep-all]",
              captionQuiet && "max-lg:sr-only",
              // Compact reserves one line, not the legend's four: the short legend and the
              // describe line are each one sentence, so the row's height never moves.
              compact && "line-clamp-1",
            )}
          >
            {compact ? t("graph.legendShort") : t("graph.legend")}
          </p>
          <p
            id="library-graph-hint"
            data-testid="library-graph-hint"
            /* Quiet is per line, not on the cell: `sr-only` on the wrapper leaves each
               line laid out at its own size inside a clipped box, so the legend still
               measured as painted and the guide still had it underneath (CI, 2026-09-08).
               Both lines take it, so the row collapses and the shelf gets the room. */
            className={cn(
              "col-start-1 row-start-1 text-label leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]",
              captionQuiet && "max-lg:sr-only",
            )}
          >
            {/* While a mark is under the pointer or the keyboard, the legend's line says what
                that one mark is and what pressing it does — the same slot, so nothing moves.
                Owner direction 2026-09-07: the bridge to the map has to read at a glance. */}
            {activeNode
              ? t(`graph.describe.${activeNode.kind}`, { name: activeNode.label })
              : highlightNote
                ? /* The emphasis a sentence off-canvas is holding, said in words: what is
                     lit, and the two ways back. See `highlightNote`. */
                  highlightNote
                : compact
                ? /* **Never empty.** This paragraph is the canvas's `aria-describedby`
                     target, and the canvas has no DOM of its own: blanking it in the
                     column took the mark vocabulary away from a first-time reader and
                     from assistive technology at the same moment (design-infoviz,
                     2026-09-08). Compact states it in one line instead of four. */
                  t("graph.legendShort")
                : t("graph.legend")}
          </p>
        </div>
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
