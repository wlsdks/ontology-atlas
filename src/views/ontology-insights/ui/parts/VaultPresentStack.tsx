"use client";

import { useEffect, useRef, useState } from "react";

import { usePrefersReducedMotion } from "@/shared/lib/use-prefers-reduced-motion";
import { cn } from "@/shared/lib/cn";

import { VAULT_LAYERS, type VaultLayer, type VaultLayerCounts } from "../../lib/vault-history";
import { EMPTY_LAYER_RULE, LAYER_INK } from "./VaultHistoryTracks";

/**
 * What the folder holds now, counted from paths, as one bounded pile of blocks per layer. It asserts nothing about
 * when, so it draws everywhere without Git; where Git answers, the weekly tracks replace it.
 * Blocks land one at a time, bottom row first; reduced motion draws the finished wall on the first frame.
 */

/** One list, shared with every aggregate, so a fifth layer cannot be forgotten here. */
const LAYER_ORDER = VAULT_LAYERS;

/**
 * The figure is a fixed size: the largest layer fills `BLOCKS_MAX` blocks and every layer uses the same block,
 * so a block may stand for several files and `scaleNote` says how many. The number under each pile is the magnitude.
 */
const BLOCKS_MAX = 36;
/** Blocks across one pile, so a full pile is a square rather than a stripe. */
const PILE_COLUMNS = 6;
/**
 * At 40ms against a 120ms fall about three blocks move at once, under the four-object tracking limit, and the
 * longest pour is 36 blocks = 1.44s for any folder size. The piles pour together and each stops when it runs out.
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
  // Without an observer the wall is shown, not hidden: missing the animation loses nothing, missing the counts loses
  // the surface. Derived at render, since it is a fact of the environment.
  const canWatch = typeof IntersectionObserver !== "undefined";

  // Every layer from the shared list, so no layer is omitted from the maximum.
  const largest = Math.max(...LAYER_ORDER.map((layer) => present[layer]), 1);
  const filesPerBlock = Math.max(1, Math.ceil(largest / BLOCKS_MAX));
  // A layer holding anything is never drawn as nothing; only a true zero reaches zero.
  const blocksOf = (count: number) =>
    count === 0 ? 0 : Math.max(1, Math.round(count / filesPerBlock));
  const blocks = LAYER_ORDER.map((layer) => blocksOf(present[layer]));
  /** The deepest pile decides how long the pour runs. */
  const deepest = Math.max(...blocks, 0);
  const poured = reducedMotion || !canWatch ? deepest : landed;

  useEffect(() => {
    if (reducedMotion || !canWatch) return;
    const node = containerRef.current;
    if (!node) return;
    let timer = 0;
    // The counter advances outside the state updater: React may run an updater more than once, and each run would start
    // another timer chain racing the stagger.
    let n = 0;
    const step = () => {
      n += 1;
      setLanded(n);
      if (n >= deepest) window.clearInterval(timer);
    };
    // The wall builds when it is seen, not on mount, so it does not play to nobody on a long tabbed board.
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        timer = window.setInterval(step, POUR_STRIDE_MS);
      },
      // Threshold 0: a tall card on a phone never reaches a larger visible fraction, which left the figure blank.
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
      {/* From 640 the layers are a four-column grid, each pile and count on the column's start line. */}
      <div className="flex flex-col gap-3 @min-[640px]/insights:grid @min-[640px]/insights:grid-cols-4 @min-[640px]/insights:items-end @min-[640px]/insights:gap-5">
        {LAYER_ORDER.map((layer, index) => {
          const count = present[layer];
          const size = blocks[index] ?? 0;
          return (
            <section
              key={layer}
              data-testid={`vault-present-tower-${layer}`}
              aria-label={labels.towerSummary(labels.layer[layer], count)}
              // `row-reverse` shows name and count on the left while the wall stays first in the DOM, so screen reader order
              // matches the wide layout: picture, then count.
              className="flex min-w-0 flex-row-reverse items-end gap-3 @min-[640px]/insights:flex-col @min-[640px]/insights:items-start @min-[640px]/insights:gap-2"
            >
              {/* `flex-wrap-reverse` fills from the bottom row up; `justify-start` aligns the partly filled top row with those under it. */}
              <ol
                aria-hidden
                style={{
                  width: `calc(${PILE_COLUMNS} * var(--vault-history-cube) * 2 + ${PILE_COLUMNS - 1}px)`,
                }}
                className={cn(
                  "flex flex-wrap-reverse content-start justify-start gap-px",
                  // A true zero keeps a floor: an absent wall would read as "not counted".
                  size === 0 && `min-h-px ${EMPTY_LAYER_RULE}`,
                )}
              >
                {Array.from({ length: size }, (_, i) => {
                  const up = i < poured;
                  return (
                    <li
                      key={i}
                      className={cn(
                        // Square: at wall scale the smallest ramp radius turns blocks into dots.
                        "block rounded-none",
                        LAYER_INK[layer],
                      )}
                      style={{
                        // Twice the weekly track's block, on one ramp step, so a mark means the same size across the surface.
                        width: "calc(var(--vault-history-cube) * 2)",
                        height: "calc(var(--vault-history-cube) * 2)",
                        transition:
                          "opacity var(--motion-fast) var(--motion-ease), transform var(--motion-fast) var(--motion-ease-place)",
                        opacity: up ? 1 : 0,
                        // A block drops onto the wall rather than fading in place.
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
      {/* Silent while a block is one file. */}
      {filesPerBlock > 1 ? (
        <p className="text-caption text-[color:var(--color-text-quaternary)]">
          {labels.scaleNote(filesPerBlock)}
        </p>
      ) : null}
    </div>
  );
}
