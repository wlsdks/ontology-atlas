"use client";

import { useEffect, useRef, useState } from "react";

import { usePrefersReducedMotion } from "@/shared/lib/use-prefers-reduced-motion";
import { cn } from "@/shared/lib/cn";

import type { VaultHistoryWeek, VaultLayer } from "../../lib/vault-history";

/**
 * What the folder held, week by week: one track per layer on one shared scale, each measured from a flat zero,
 * because a stacked area's moving baseline hides layers moving in opposite directions. Columns of cubes rise one
 * week at a time (item staging); reduced motion draws the finished chart on the first frame. Each track is only
 * as tall as its contents: the shared scale lives in the block, which means the same files in every track.
 */

const LAYER_ORDER: readonly VaultLayer[] = ["concept", "module", "writeUp", "document"];

/**
 * Two inks, not four: four values would claim a rank the layers do not have. Indigo marks the layers the map draws,
 * neutral the layers the Library holds (`classifyVaultPath`); position and a label already carry identity.
 */
export const LAYER_INK: Record<VaultLayer, string> = {
  concept: "bg-[color:var(--color-indigo-line-a90)]",
  module: "bg-[color:var(--color-indigo-line-a90)]",
  writeUp: "bg-[color:var(--color-text-secondary)]",
  document: "bg-[color:var(--color-text-secondary)]",
};

/**
 * The rule a genuinely empty layer keeps: tertiary ink is perceivable against the card and is no block's ink,
 * so it is never mistaken for a mark.
 */
export const EMPTY_LAYER_RULE =
  "border-t border-dashed border-[color:var(--color-text-tertiary)]";

/** The finest a block is ever allowed to mean, so a small folder is not drawn as dust. */
const FILES_PER_CUBE = 4;
/** The tallest a track grows, in blocks; past it a block means more files and the scale note says so. */
const MAX_CUBES = 30;
/** Stride between one week's column starting to rise and the next. */
const COLUMN_STRIDE_MS = 34;

export interface VaultHistoryTracksLabels {
  /** Track names, in the product's own words. */
  layer: Record<VaultLayer, string>;
  /** Accessible summary per track: "N this week, M at the start of the window". */
  trackSummary: (layer: string, latest: number, earliest: number) => string;
  /** The scale note, e.g. "one block = 4 files". */
  scaleNote: (filesPerCube: number) => string;
  axisStart: string;
  axisEnd: string;
}

export function VaultHistoryTracks({
  weeks,
  peak,
  labels,
  milestones,
}: {
  weeks: readonly VaultHistoryWeek[];
  peak: number;
  labels: VaultHistoryTracksLabels;
  /** Dates the chart cannot state, in words, under the axis. */
  milestones?: React.ReactNode;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const containerRef = useRef<HTMLDivElement | null>(null);
  /** Columns released to rise. Under reduced motion every column is at rest, derived here so the still chart is the first frame. */
  const [released, setReleased] = useState(0);
  // Without `IntersectionObserver` the chart is shown finished: missing the animation loses nothing, missing the
  // data loses the surface. Derived here as a fact of the environment.
  const canWatch = typeof IntersectionObserver !== "undefined";
  const risen = reducedMotion || !canWatch ? weeks.length : released;

  useEffect(() => {
    if (reducedMotion || !canWatch) return;
    const node = containerRef.current;
    if (!node) return;
    // The chart rises when it is seen, not on mount.
    let timer = 0;
    // The counter advances outside the state updater: React may run an updater more than once, and each run would start
    // another racing timer chain.
    let n = 0;
    const start = () => {
      timer = window.setInterval(() => {
        n += 1;
        setReleased(n);
        if (n >= weeks.length) window.clearInterval(timer);
      }, COLUMN_STRIDE_MS);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        start();
      },
      // Threshold 0: a tall card may never reach a larger visible fraction, which would leave the figure blank.
      { threshold: 0, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, [reducedMotion, canWatch, weeks.length]);

  // One block means the same number of files in every track; the peak only sets how coarse the block must be.
  const filesPerCube = Math.max(FILES_PER_CUBE, Math.ceil(peak / MAX_CUBES));
  // A layer holding a file is never drawn as none: rounding alone put small counts at zero cubes, which draws the
  // "measured, and none" rule.
  const cubesOf = (count: number) =>
    count === 0 ? 0 : Math.max(1, Math.round(count / filesPerCube));

  return (
    <div ref={containerRef} className="flex flex-col gap-4">
      {LAYER_ORDER.map((layer) => {
        const latest = weeks.at(-1)?.counts[layer] ?? 0;
        const earliest = weeks[0]?.counts[layer] ?? 0;
        const trackCubes = Math.max(...weeks.map((week) => cubesOf(week.counts[layer])), 0);
        return (
          <section
            key={layer}
            data-testid={`vault-history-track-${layer}`}
            aria-label={labels.trackSummary(labels.layer[layer], latest, earliest)}
            className="flex flex-col gap-1.5"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-label text-[color:var(--color-text-secondary)]">
                {labels.layer[layer]}
              </span>
              <span className="font-mono text-caption text-[color:var(--color-text-tertiary)]">
                {latest}
              </span>
            </div>
            {/* `items-end` is the shared baseline: every track measures from the same flat zero. */}
            <ol
              aria-hidden
              // A genuinely empty track keeps a one-pixel baseline: "measured, and none", where an absent track would say "not measured".
              className={cn(
                "flex items-end gap-px",
                trackCubes === 0 && EMPTY_LAYER_RULE,
              )}
              style={{ height: `calc(${trackCubes} * var(--vault-history-cube))` }}
            >
              {weeks.map((week, index) => {
                const cubes = cubesOf(week.counts[layer]);
                const up = index < risen;
                return (
                  <li
                    key={week.week}
                    className="flex min-w-0 flex-1 flex-col-reverse justify-start gap-px"
                    // The stagger is the `released` counter, not a per-item delay, so an interrupted rise stops where it is.
                    style={{
                      transition: `opacity var(--motion-base) var(--motion-ease)`,
                      opacity: up ? 1 : 0,
                    }}
                  >
                    {Array.from({ length: cubes }, (_, cube) => (
                      <span
                        key={cube}
                        className={cn(
                          "block w-full rounded-micro",
                          LAYER_INK[layer],
                        )}
                        style={{
                          height: "calc(var(--vault-history-cube) - 1px)",
                          transition: "transform var(--motion-base) var(--motion-ease)",
                          // Every cube in a column shares one transform and duration, so a column rises as one. The 3px
                          // travel stays under the drawn 4px cube; a longer travel moved cubes through each other.
                          transform: up ? "none" : "translateY(3px)",
                        }}
                      />
                    ))}
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
      <div className="flex items-center justify-between text-caption text-[color:var(--color-text-quaternary)]">
        <span>{labels.axisStart}</span>
        <span>{labels.scaleNote(filesPerCube)}</span>
        <span>{labels.axisEnd}</span>
      </div>
      {milestones}
    </div>
  );
}
