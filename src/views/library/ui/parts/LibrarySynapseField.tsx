"use client";

import { useEffect, useRef } from "react";

import { ambientSleepFactor, isAmbientAsleep } from "@/widgets/ontology-map";
import { usePrefersReducedMotion } from "@/shared/lib/use-prefers-reduced-motion";
import { cn } from "@/shared/lib/cn";

import {
  createSynapseField,
  stepSynapseField,
  synapseLinks,
} from "../../expressive/synapse-field";

/**
 * **The ambient network behind the Library's guided pane** — canvas-2D, one call, and
 * deletable along with `../../expressive/synapse-field.ts` to put the screen back.
 *
 * Canvas-2D rather than WebGL: the field is dots and hairlines with no depth, no lighting
 * and no occlusion, so a GPU context would buy nothing and cost a second one on a screen
 * that already has the map's. The maths is in the expressive module; this file owns the
 * frame, the device pixel ratio, the ink and the sleep.
 *
 * ## The things that keep a background from becoming a nuisance
 *
 * - **It sleeps.** `ambientSleepFactor` is the map's own contract: full speed until 30s
 *   after the last input, then a 2s deceleration to a complete stop. A pane left open
 *   costs nothing, and any input restores it on the next frame.
 * - **It stops dead under reduced motion.** One still frame of the seeded field, drawn
 *   once, with no loop at all.
 * - **It never reaches the type.** The host fades it at the pane's rim and the copy has
 *   its own ground; the ink here is quaternary at a fraction of full alpha, which is
 *   under every contrast floor precisely because it is carrying no fact.
 * - **It stops when covered.** `paused` releases the loop while a dialog covers the pane.
 * - **It parks outside the viewport.** Returning resumes the same field with a fresh
 *   clock, so time spent off-screen cannot jump its points forward.
 */
export function LibrarySynapseField({
  paused = false,
  className,
}: {
  /** True while a dialog covers this pane. */
  paused?: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const root = document.documentElement;
    const styles = getComputedStyle(root);
    /*
     * ⚠️ **One ink for the whole field, and it is not the accent** (guardian, 2026-09-09).
     * The links shipped in `--color-indigo-accent`, which on this very route means *this
     * is the one you have open*: the shelf's selected row wears it as its edge, and
     * `library-graph-ink.ts` gives it to the selected node's ring on the folder graph one
     * chip away. A ground that carries no fact by design must not wear the ink a fact
     * wears — a coloured mesh of 209 links behind a pane about a real folder is the one
     * thing on the screen a person could read as their own graph. The field's own node
     * ink leaves it as the dust it is.
     */
    const fieldInk =
      styles.getPropertyValue("--color-text-quaternary").trim() || "#82828a";

    let width = 1;
    let height = 1;
    let nodes = createSynapseField({ count: 1, reach: 1, width: 1, height: 1 });

    /*
     * Density is per area, not a fixed count: one field constant across a 1512px pane and
     * a 390px one is either a crowd on the phone or three dots on the desktop. The reach
     * follows the pane's short side for the same reason — links must form at the same
     * *visual* distance whatever the box is.
     */
    const measure = (): void => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.round(
        Math.min(64, Math.max(14, (width * height) / 26_000)),
      );
      nodes = createSynapseField({
        count,
        reach: Math.max(90, Math.min(width, height) * 0.42),
        width,
        height,
      });
    };

    const draw = (): void => {
      context.clearRect(0, 0, width, height);
      const reach = Math.max(90, Math.min(width, height) * 0.42);
      const links = synapseLinks(nodes, reach);

      context.lineWidth = 1;
      context.strokeStyle = fieldInk;
      for (const link of links) {
        const a = nodes[link.a]!;
        const b = nodes[link.b]!;
        // Squared so only genuinely close pairs carry a visible line; a field where every
        // pair in range draws at a readable alpha is a mesh, not a constellation.
        context.globalAlpha = link.strength * link.strength * 0.3;
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.stroke();
      }

      context.fillStyle = fieldInk;
      context.globalAlpha = 0.5;
      for (const node of nodes) {
        context.beginPath();
        context.arc(node.x, node.y, 1.4, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
    };

    const observer = new ResizeObserver(() => {
      measure();
      draw();
    });
    observer.observe(canvas);
    measure();
    draw();

    // One still frame is all a covered or reduced-motion pane gets: the field is drawn so
    // it is there when the cover lifts, and no loop is registered at all.
    if (reducedMotion || paused) return () => observer.disconnect();
    if (typeof IntersectionObserver === "undefined") return () => observer.disconnect();

    let raf: number | null = null;
    let inViewport = false;
    let previous = performance.now();
    let lastInput = previous;
    function loop(now: number): void {
      raf = null;
      if (document.hidden || !inViewport) return;
      const factor = ambientSleepFactor(now, lastInput);
      if (isAmbientAsleep(factor)) return;
      const dt = now - previous;
      previous = now;
      stepSynapseField(nodes, dt * factor, width, height);
      draw();
      raf = requestAnimationFrame(loop);
    }
    const onInput = (): void => {
      lastInput = performance.now();
      if (raf !== null || document.hidden || !inViewport) return;
      previous = lastInput;
      raf = requestAnimationFrame(loop);
    };
    const park = (): void => {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
    };
    const onVisibility = (): void => {
      if (!document.hidden) { onInput(); return; }
      park();
    };
    const viewport = new IntersectionObserver((entries) => {
      const entry = entries.at(-1);
      if (!entry) return;
      inViewport = entry.isIntersecting;
      if (inViewport) onInput();
      else park();
    });
    viewport.observe(canvas);
    window.addEventListener("pointermove", onInput, { passive: true });
    window.addEventListener("keydown", onInput, { passive: true });
    window.addEventListener("wheel", onInput, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      park();
      viewport.disconnect();
      observer.disconnect();
      window.removeEventListener("pointermove", onInput);
      window.removeEventListener("keydown", onInput);
      window.removeEventListener("wheel", onInput);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reducedMotion, paused]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      data-testid="library-synapse-field"
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
    />
  );
}
