"use client";

import { useEffect, useMemo, useRef } from "react";

import { usePrefersReducedMotion } from "@/shared/lib/use-prefers-reduced-motion";
import { cn } from "@/shared/lib/cn";

import {
  buildConstellation,
  type ConstellationInput,
} from "../../expressive/constellation-model";
import type { ConstellationHandle } from "../../expressive/constellation-scene";

/** Loaded on mount: every workbench route prefetches the Library page, and three.js with it. */
const loadConstellationScene = () => import("../../expressive/constellation-scene");

/**
 * The Library's backdrop: one canvas that can be deleted with `../../expressive/` to restore the
 * screen. `aria-hidden`, because the copy on top states every count it draws.
 */
export function LibraryConstellation({
  input,
  dim,
  distance,
  className,
}: {
  /**
   * The folder to draw. Omit for the anonymous object — the shape of the thing a person
   * is about to make, on the screen where they have not made it yet.
   */
  input?: ConstellationInput;
  /** Brightness 0–1; the workbench turns it down, the empty state leaves it alone. */
  dim?: number;
  /** Camera distance in object radii — larger draws the object smaller. */
  distance?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  /*
   * Rebuilt only when the counts actually move. Without this the object is rebuilt on
   * every render of a screen whose model is recomputed constantly, which is the
   * "do not compute data for a surface that is not rendered" rule pointed the other way.
   */
  const signature = input
    ? `${input.sourceCount}:${input.pageSourceCounts.join(",")}`
    : "anonymous";
  const model = useMemo(() => buildConstellation(input), [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let handle: ConstellationHandle | null = null;
    let disposed = false;
    loadConstellationScene()
      .then(({ mountLibraryConstellation }) => {
        if (!disposed) handle = mountLibraryConstellation(canvas, model, { reducedMotion, dim, distance });
      })
      .catch((error: unknown) => {
        console.error("[library-constellation] backdrop failed to draw", error);
      });
    return () => {
      disposed = true;
      handle?.dispose();
    };
    // `model` is the only input that redraws; the rest remount by design.
  }, [model, reducedMotion, dim, distance]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      data-testid="library-constellation"
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
    />
  );
}
