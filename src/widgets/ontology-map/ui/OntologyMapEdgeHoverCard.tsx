"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { transientSurface } from "@/shared/ui/transient-surface";
import { currentFloatingRightBound } from "@/shared/lib/right-dock-reserve";
import { MAP_CANVAS_SURFACE_ROLE } from "@/shared/lib/focus-map-canvas";
import { placeHoverCard, type Rect } from "../interaction/hover-card-placement";
import { collectCanvasObstacles } from "../interaction/free-area";

export interface OntologyMapEdgeHoverCardProps {
  sentence: string;
  typeLabel: string;
  why: string | null;
  clickHint: string;
  x: number;
  y: number;
  /**
   * What the card must not cover — the discs and names drawn near the pointer,
   * in client coordinates (`topology-pointer-handlers.ts#collectHoverAvoidRects`).
   * Empty keeps the card at the pointer's lower right.
   */
  avoid?: readonly Rect[];
}

const OFFSET = 14;
const CARD_MAX_WIDTH = 280;
/** The height assumed for the first paint, before the card has been measured. */
const CARD_ESTIMATED_HEIGHT = 96;
const EDGE_MARGIN = 8;
const NO_AVOID: readonly Rect[] = [];
const CONTROL_SELECTOR = 'button, a[href], input, select, textarea, [role="tab"], [role="button"]';

/**
 * **The chrome standing over the map**, in client coordinates: the panels on the canvas (INDEX,
 * an inspector) and every visible control (the tool lane, the utility tiles, the INDEX tab).
 * Read once when the card appears — chrome does not move while a line is hovered.
 *
 * A layer that lets the pointer through, or one that covers most of the canvas, is not chrome:
 * it is a container, and avoiding it would leave the card nowhere to go.
 */
function collectHoverChromeRects(doc: Document, card: Element | null): Rect[] {
  const canvas = doc.querySelector(`[data-surface-role="${MAP_CANVAS_SURFACE_ROLE}"], [data-role="${MAP_CANVAS_SURFACE_ROLE}"]`);
  if (!canvas) return [];
  const c = canvas.getBoundingClientRect();
  const canvasRect = { x: c.x, y: c.y, width: c.width, height: c.height };
  const out: Rect[] = [];
  const keep = (el: Element, box: DOMRect) => {
    if (card?.contains(el) || box.width <= 0 || box.height <= 0) return;
    if (box.width * box.height > 0.5 * c.width * c.height) return;
    if (box.right <= c.x || box.left >= c.right || box.bottom <= c.y || box.top >= c.bottom) return;
    if (getComputedStyle(el).pointerEvents === "none") return;
    out.push({ x: box.x, y: box.y, w: box.width, h: box.height });
  };
  for (const panel of collectCanvasObstacles(canvas, canvasRect)) {
    out.push({ x: panel.x, y: panel.y, w: panel.width, h: panel.height });
  }
  for (const el of doc.querySelectorAll(CONTROL_SELECTOR)) {
    if (canvas.contains(el) || el.closest('[aria-hidden="true"], [inert]')) continue;
    keep(el, el.getBoundingClientRect());
  }
  return out.filter((r) => r.w * r.h <= 0.5 * c.width * c.height);
}

export function OntologyMapEdgeHoverCard({ sentence, typeLabel, why, clickHint, x, y, avoid = NO_AVOID }: OntologyMapEdgeHoverCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  // The card's own size decides which corner clears the drawn nodes, and it is
  // only known once painted; the first paint uses the estimate and the measured
  // size corrects it in the same frame, before the person sees it.
  const [size, setSize] = useState({ w: CARD_MAX_WIDTH, h: CARD_ESTIMATED_HEIGHT });
  const [chrome, setChrome] = useState<readonly Rect[]>(NO_AVOID);
  // Measured once on arrival, in the same frame as the size, before the card is seen.
  useLayoutEffect(() => {
    setChrome(collectHoverChromeRects(document, cardRef.current));
  }, []);
  useLayoutEffect(() => {
    const element = cardRef.current;
    if (!element) return;
    const box = element.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return;
    setSize((current) =>
      Math.abs(current.w - box.width) < 1 && Math.abs(current.h - box.height) < 1
        ? current
        : { w: box.width, h: box.height },
    );
    // The size follows the words, so the words are the reason to measure again.
  }, [sentence, typeLabel, why, clickHint]);
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 1080;
  const bounds = {
    x: EDGE_MARGIN,
    y: EDGE_MARGIN,
    w: Math.max(size.w, currentFloatingRightBound() - 2 * EDGE_MARGIN),
    h: Math.max(size.h, viewportHeight - 2 * EDGE_MARGIN),
  };
  const { left, top, corner } = placeHoverCard({ x, y }, size, avoid, bounds, OFFSET, chrome);
  return (
    <div
      ref={cardRef}
      data-corner={corner}
      {...transientSurface("hint")}
      data-testid="map-edge-hover-card"
      role="status"
      className="pointer-events-none fixed z-40 flex max-w-[280px] flex-col gap-1 rounded-[var(--map-panel-radius)] border border-[color:var(--map-panel-border)] bg-[color:var(--map-panel-surface)] px-3 py-2 shadow-[var(--map-panel-shadow)]"
      style={{ left, top }}
    >
      <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--map-panel-text-tertiary)]">
        {typeLabel}
      </p>
      {/*
        **The recorded reason leads when there is one** (owner, 2026-09-06: every hover on a
        containment edge read the same templated sentence). The template — "A holds B" — is
        true of every edge of its type, so it carries no information a person did not already
        have from the line; the `relation_notes` sentence is the one thing that differs edge
        by edge. With a note, the note is the protagonist and the template drops to a caption;
        without one, the template stands as before.
      */}
      {why ? (
        <>
          <p className="text-label leading-label text-[color:var(--map-panel-text-secondary)]">{sentence}</p>
          <p
            data-testid="map-edge-hover-why"
            className="line-clamp-3 text-body font-[var(--font-weight-signature)] leading-label text-[color:var(--map-panel-text-primary)]"
          >
            {why}
          </p>
        </>
      ) : (
        <p className="text-body font-[var(--font-weight-signature)] leading-label text-[color:var(--map-panel-text-primary)]">
          {sentence}
        </p>
      )}
      <p className="text-label text-[color:var(--map-panel-text-quaternary)]">{clickHint}</p>
    </div>
  );
}
