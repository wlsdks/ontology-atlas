"use client";

import { useEffect, useRef, useState } from "react";

import { usePrefersReducedMotion } from "@/shared/lib/use-prefers-reduced-motion";
import { cn } from "@/shared/lib/cn";

import { VAULT_LAYERS, type VaultLayer, type VaultLayerCounts } from "../../lib/vault-history";
import { EMPTY_LAYER_RULE, LAYER_INK } from "./VaultHistoryTracks";

/**
 * **What the folder holds now — one block per file, assembling itself.**
 *
 * ## Why this exists
 *
 * The week-by-week tracks need Git, and Git is the installed app. The first build drew
 * nothing whatever in the other three states, so a person in a browser met a paragraph
 * explaining an absence: honest about time, and silent about the folder sitting right
 * there. The owner said it plainly — *"nothing new seems to have appeared on Analysis; or
 * did I not see it?"* They had not missed it. There was nothing to see.
 *
 * ⚠️ **The present is not a weaker history; it is a different claim, and a safe one.** It
 * says how much the folder holds, counted from paths this instant, and asserts nothing
 * about when anything happened — which is exactly why it can be drawn everywhere, with no
 * Git and no timestamps, on a fact that a clone or a checkout cannot move. Where Git *does*
 * answer, this is replaced by the tracks, which say the same thing and say when as well.
 *
 * ## Why a bounded pile
 *
 * The owner asked for cubes that put themselves together, and the first build read that as
 * one block per file. It does not survive a real folder — see `BLOCKS_MAX`. The pile keeps
 * the blocks and drops the promise that you can count them: the number under it is the
 * magnitude, and the pile is what accumulation and proportion look like.
 *
 * ## The build
 *
 * Blocks land one at a time, bottom row first, left to right — the reading order of the
 * thing they are building. The 2026 work on perceptual capacity limits puts reliable
 * tracking at roughly four moving objects and prescribes moving them in subsets; one block
 * at a time is the smallest subset there is, so the eye always has exactly one thing to
 * follow. Reduced motion draws the finished wall on the first frame, with no schedule.
 */

/** One list, shared with every aggregate, so a fifth layer cannot be forgotten here. */
const LAYER_ORDER = VAULT_LAYERS;

/**
 * **The figure is a fixed size; a block's meaning is what moves.**
 *
 * ⚠️ **One block per file does not survive a real folder.** The owner asked the question
 * that settles it — *"what does this look like when there are a lot? that's odd, isn't
 * it"* — and design-infoviz had already measured why: subitizing caps at four, so "the
 * reader can check the count by looking" was false at 125 by roughly thirty times. The
 * argument was wrong, and the figure built on it grew without bound: a hundred files is a
 * slab, five thousand is either dust or a cap that quietly lies.
 *
 * Magnitude was never the wall's job. It is printed under every pile at 17.9:1. What the
 * pile carries is **accumulation and proportion** — how much this layer holds against the
 * others — and that needs a bounded figure, not a faithful one.
 *
 * So the pile holds at most `BLOCKS_MAX` blocks, the largest layer fills it, and every other
 * layer is drawn against the same block. A block therefore stands for a stated number of
 * files, and the figure says which in words whenever that is more than one. The picture is
 * the same size for a folder of forty and a folder of forty thousand; only the sentence
 * under it changes. That is the same contract the weekly tracks keep, and the two figures
 * now agree instead of arguing.
 */
const BLOCKS_MAX = 36;
/** Blocks across one pile, so a full pile is a square rather than a stripe. */
const PILE_COLUMNS = 6;
/**
 * Between one block landing and the next, inside a pile.
 *
 * The owner asked for blocks that trickle into a pile the way something poured into a bucket
 * settles, each layer on its own. That needs blocks a person can actually see land, and until
 * the pile was bounded it was arithmetically impossible: design-motion measured the previous
 * build putting **19-20 blocks mid-transition at every instant** — a soft wavefront, nothing
 * landing — and proved no stride fixes it at 126 blocks, because discreteness wants
 * `gesture / stride` near 2 and 126 blocks would then take 7.6 seconds.
 *
 * Bounding the pile is what bought the motion. At 40ms against a 120ms fall the concurrency
 * is 3, under the four-object tracking limit, and the longest possible pour is `BLOCKS_MAX`
 * blocks = **1.44s** — for a folder of any size, because a bigger folder puts more files in a
 * block rather than more blocks in the pile.
 *
 * The four piles pour at once and each stops when its own blocks run out, so a layer holding
 * a little finishes early while the largest keeps going. That is the picture: four buckets
 * filling side by side at one rate, which is also what makes their depths readable against
 * each other while they fill.
 */
const POUR_STRIDE_MS = 40;

export interface VaultPresentStackLabels {
  layer: Record<VaultLayer, string>;
  /** Accessible summary per wall: "concepts: N files". */
  towerSummary: (layer: string, count: number) => string;
  /** Stated only when a block had to stand for more than one file. */
  scaleNote: (filesPerBlock: number) => string;
}

export function VaultPresentStack({
  present,
  labels,
}: {
  present: VaultLayerCounts;
  labels: VaultPresentStackLabels;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [landed, setLanded] = useState(0);
  /*
   * No observer means the wall is shown, not hidden — the same rule the tracks keep. A
   * reader missing an animation has lost nothing; a reader missing the counts has lost the
   * surface. Derived at render, because it is a fact of the environment rather than
   * something to write from an effect.
   */
  const canWatch = typeof IntersectionObserver !== "undefined";

  // Every layer, from the shared list — the hand-written subset here omitted `module`, which
  // is the same defect three council seats found in three other aggregates.
  // Every layer, from the shared list — the hand-written subset here omitted `module`, which
  // is the same defect three council seats found in three other aggregates.
  const largest = Math.max(...LAYER_ORDER.map((layer) => present[layer]), 1);
  const filesPerBlock = Math.max(1, Math.ceil(largest / BLOCKS_MAX));
  // A layer holding anything is never drawn as nothing; only a true zero reaches zero.
  const blocksOf = (count: number) =>
    count === 0 ? 0 : Math.max(1, Math.round(count / filesPerBlock));
  const blocks = LAYER_ORDER.map((layer) => blocksOf(present[layer]));
  /** The deepest pile decides how long the pour runs; the others stop when they run out. */
  const deepest = Math.max(...blocks, 0);
  const poured = reducedMotion || !canWatch ? deepest : landed;

  useEffect(() => {
    if (reducedMotion || !canWatch) return;
    const node = containerRef.current;
    if (!node) return;
    let timer = 0;
    /*
     * ⚠️ **The counter is advanced outside the state updater, deliberately.** Scheduling the
     * next tick *inside* `setState(current => ...)` looks tidy and is a trap: React may run
     * an updater more than once for one update, and each run started another timer chain.
     * Measured on this very wall — 126 blocks that should take 1.13s finished in 160ms,
     * because several chains were racing and the stagger had quietly stopped existing.
     */
    let n = 0;
    const step = () => {
      n += 1;
      setLanded(n);
      if (n >= deepest) window.clearInterval(timer);
    };
    /*
     * The wall builds when it is actually looked at, not when it mounts. This board has tabs
     * and a long scroll, so a wall that built on mount would have played to nobody and then
     * stood finished for the person who eventually arrived.
     */
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        timer = window.setInterval(step, POUR_STRIDE_MS);
      },
      /*
       * ⚠️ **A threshold that a tall card cannot reach leaves the figure blank.** At 0.3,
       * design-responsive measured the wall still at `opacity: 0` on all 126 blocks after
       * three seconds at rest at 320, 390 and 844x390 — the card is taller than the room
       * above the fold there, so the fraction visible peaks at 0.111 and the build never
       * fires. The figure was not slow on a phone; it was absent.
       *
       * Any part of it being on screen is the honest trigger: the question this answers is
       * "has a person had the chance to see it", and a sliver is a chance. `rootMargin`
       * arms it slightly before it arrives so the first row is not already past.
       */
      { threshold: 0, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, [reducedMotion, canWatch, deepest]);

  return (
    <div
      ref={containerRef}
      data-testid="vault-present-stack"
      className="flex flex-col gap-3"
    >
      {/*
        ⚠️ **A layer's column is shared out by what it holds.** Four equal shares gave the
        layer holding 125 files the same 175px as the three holding nothing — measured, 525
        of 760px, 69% of the figure, carrying one block and two rules — so the wall that had
        something to show grew downward as a chimney while most of the row stood empty
        (design-lead, design-infoviz and design-responsive, independently, 2026-09-09).
        `flex-grow` is the block count, floored at `--vault-layer-col-min` so a name always
        fits under its column.

        Below the same width where four labelled columns stop fitting at all (4 x 72 + gaps
        exceeds the room at 390), the figure turns: one layer per row, its name and count on
        the left, its wall taking the rest. Measured there at 390 the card falls 503 -> 359.
      */}
      {/*
        From 640 the four layers are a four-column grid across the card, each pile and its
        count on the column's start line: spread with `justify-between` inside a centred cap,
        the first pile began a third of the way into the card (2026-09-25, design sweep).
      */}
      <div className="flex flex-col gap-3 @min-[640px]/insights:grid @min-[640px]/insights:grid-cols-4 @min-[640px]/insights:items-end @min-[640px]/insights:gap-5">
        {LAYER_ORDER.map((layer, index) => {
          const count = present[layer];
          const size = blocks[index] ?? 0;
          return (
            <section
              key={layer}
              data-testid={`vault-present-tower-${layer}`}
              aria-label={labels.towerSummary(labels.layer[layer], count)}
              /*
                `row-reverse` puts the name and count at the left of the row while keeping
                the wall first in the DOM, so the reading order a screen reader gets is the
                same one the wide layout shows: the picture, then what it counts.
              */
              className="flex min-w-0 flex-row-reverse items-end gap-3 @min-[640px]/insights:flex-col @min-[640px]/insights:items-start @min-[640px]/insights:gap-2"
            >
              {/*
                `flex-wrap-reverse` fills from the bottom row upward, so the wall grows the
                way a stack does. `justify-start` keeps the newest, partly filled row aligned
                with the ones under it instead of centring a ragged top edge.
              */}
              <ol
                aria-hidden
                /* Six blocks across, so a full pile is a square and not a stripe. */
                style={{
                  width: `calc(${PILE_COLUMNS} * var(--vault-history-cube) * 2 + ${PILE_COLUMNS - 1}px)`,
                }}
                className={cn(
                  "flex flex-wrap-reverse content-start justify-start gap-px",
                  // A layer at a true zero keeps a floor rather than vanishing: an absent
                  // wall would read as "not counted", a floor reads as "counted, and none".
                  size === 0 && `min-h-px ${EMPTY_LAYER_RULE}`,
                )}
              >
                {Array.from({ length: size }, (_, i) => {
                  const up = i < poured;
                  return (
                    <li
                      key={i}
                      className={cn(
                        /*
                          Square, not rounded. At the size a wall of a hundred blocks puts
                          them at, the smallest radius on the ramp is a third of the block
                          and the wall rendered as a field of dots. A brick has corners.
                        */
                        "block rounded-none",
                        LAYER_INK[layer],
                      )}
                      style={{
                        // Twice the weekly track's block: the two figures share one ramp step
                        // so a mark means the same size wherever the surface draws one.
                        width: "calc(var(--vault-history-cube) * 2)",
                        height: "calc(var(--vault-history-cube) * 2)",
                        transition:
                          "opacity var(--motion-fast) var(--motion-ease), transform var(--motion-fast) var(--motion-ease-place)",
                        opacity: up ? 1 : 0,
                        // A block drops the last of the way onto the wall rather than fading
                        // in where it will end up; it is put in place, not revealed.
                        transform: up ? "none" : "translateY(calc(var(--vault-history-cube) * -2.8))",
                      }}
                    />
                  );
                })}
              </ol>
              <div className="flex w-16 shrink-0 flex-col items-start gap-0.5 @min-[640px]/insights:w-auto">
                <span className="font-mono text-body-lg tabular-nums text-[color:var(--color-text-primary)]">
                  {count}
                </span>
                <span className="text-label text-[color:var(--color-text-tertiary)]">
                  {labels.layer[layer]}
                </span>
              </div>
            </section>
          );
        })}
      </div>
      {/* Silent while a block is a file, because then there is no scale to explain. */}
      {filesPerBlock > 1 ? (
        <p className="text-caption text-[color:var(--color-text-quaternary)]">
          {labels.scaleNote(filesPerBlock)}
        </p>
      ) : null}
    </div>
  );
}
