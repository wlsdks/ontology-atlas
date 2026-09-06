import type { LibraryGraphEdge, LibraryGraphNode, LibraryGraphNodeKind } from "../model/build-library-graph";
import type { LayoutPoint } from "../model/library-graph-layout";
import type { LibraryGraphInk } from "./library-graph-ink";

/**
 * One frame of the library graph. **No React, no DOM, no clock** — the caller owns the
 * canvas, the time and the state; this function only paints what it is handed, which is
 * what makes every rule below testable without a browser.
 *
 * ## What the marks encode
 *
 * | Node | Mark | Why that mark |
 * |---|---|---|
 * | page | filled circle, the brightest neutral | the thing this screen is for: what somebody wrote |
 * | source | filled square | a file, not a thought — the one mark here that is not round |
 * | concept | ring, unfilled | it lives on the map, not in this folder; hollow says "elsewhere" |
 *
 * | Edge | Mark |
 * |---|---|
 * | cites, hash still matching | solid |
 * | mentions | dashed |
 * | either, unverified | broken once at its midpoint |
 *
 * A source nobody has written up is a **hollow** square: the state the list beside this
 * canvas prints as "not compiled" gets a mark of its own rather than being inferred from
 * the absence of a 1.4:1 hairline (design-infoviz, 2026-09-06).
 *
 * Both take the same neutral ink; only the dash says which relation it is. Value on an
 * edge means one thing here — whether it touches the selected node — and measured
 * against the canvas ground every mark clears the 3:1 non-text floor: 13.6:1 (page),
 * 6.1:1 (source), 5.2:1 (concept and edge) and 4.2:1 (selected).
 *
 * **Every distinction survives with the colour removed.** Shape separates the three node
 * kinds and dash separates the two relations, so the picture is still readable when
 * indigo is the only colour on it — which it is, and only ever on the selection.
 *
 * ## What is deliberately absent
 *
 * No glow, no halo, no gradient, no shadow: `.claude/rules/forbidden.md`. A selected node
 * is bigger by its ring and different by its ink, which are both measurable; a bloom is
 * neither. Nothing pulses — the only motion this canvas has is the one settle the caller
 * drives, and it ends.
 */

export interface LibraryGraphFrame {
  nodes: readonly LibraryGraphNode[];
  edges: readonly LibraryGraphEdge[];
  positions: ReadonlyMap<string, LayoutPoint>;
  /** CSS pixels; the caller has already applied the device-pixel transform. */
  width: number;
  height: number;
  ink: LibraryGraphInk;
  selectedId: string | null;
  /**
   * Under the pointer. Separate from {@link focusedId} because they are separate states
   * (design-interaction, 2026-09-06): a mouse crossing the canvas used to erase where the
   * keyboard was, leaving a focused canvas pointing at nothing.
   */
  hoveredId: string | null;
  /** Where the keyboard is. Wears the focus ring even while the pointer is elsewhere. */
  focusedId: string | null;
  /** Drawn beside whichever of the two is showing. Absent while nothing is pointed at. */
  activeLabel: string | null;
}

/** Half-extent in CSS px. A source is square, so this is half its side. */
export const NODE_RADIUS: Record<LibraryGraphNodeKind, number> = {
  page: 5,
  source: 3.6,
  concept: 4,
};

/** The ring a selected or hovered node wears, outside its own mark. */
const SELECTION_RING_GAP = 3.5;
/** The keyboard's ring sits outside that one, so focus on a selected node is still visible. */
const FOCUS_RING_GAP = 6;
const LABEL_FONT_PX = 11;
const LABEL_PAD_X = 6;
const LABEL_PAD_Y = 4;
const LABEL_GAP = 6;
/** The break an unverified citation carries at its midpoint, in CSS px. */
const BROKEN_EDGE_GAP = 7;
const LABEL_RADIUS = 4;
/** Pointer slop around a mark for a mouse. A 3.6px square is smaller than any pointer. */
const FINE_HIT_REACH = 4;

function nodeCentre(
  frame: LibraryGraphFrame,
  id: string,
): LayoutPoint | null {
  return frame.positions.get(id) ?? null;
}

/**
 * Hit testing, shared by the pointer and the renderer so a person can never highlight
 * one node and select another. Generous by 4px: a 3.6px square is smaller than the
 * pointing device of anybody's hand.
 */
export function hitTestLibraryGraph(
  frame: Pick<LibraryGraphFrame, "nodes" | "positions">,
  point: LayoutPoint,
  /** Extra reach around the mark. The caller widens it for a coarse pointer. */
  reachBonus: number = FINE_HIT_REACH,
): LibraryGraphNode | null {
  let best: LibraryGraphNode | null = null;
  let bestDistance = Infinity;
  for (const node of frame.nodes) {
    const centre = frame.positions.get(node.id);
    if (!centre) continue;
    const dx = point.x - centre.x;
    const dy = point.y - centre.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const reach = NODE_RADIUS[node.kind] + reachBonus;
    if (distance <= reach && distance < bestDistance) {
      best = node;
      bestDistance = distance;
    }
  }
  return best;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export function drawLibraryGraph(ctx: CanvasRenderingContext2D, frame: LibraryGraphFrame): void {
  const { ink } = frame;
  ctx.save();
  ctx.fillStyle = ink.ground;
  ctx.fillRect(0, 0, frame.width, frame.height);

  // ── Edges first, so no line crosses the mark it points at. ──
  // `butt`, not `round`: a round cap adds half a line width to each dash end, which
  // measured a 0.64 duty cycle on a `[3, 3]` pattern — the gap a person is supposed to
  // read was a third narrower than specified (design-infoviz, 2026-09-06).
  ctx.lineCap = "butt";
  const active = frame.hoveredId ?? frame.focusedId;
  for (const edge of frame.edges) {
    const from = nodeCentre(frame, edge.source);
    const to = nodeCentre(frame, edge.target);
    if (!from || !to) continue;
    const touchesSelection =
      frame.selectedId !== null && (edge.source === frame.selectedId || edge.target === frame.selectedId);
    // Pointing at a dot is a question about its links, so its links answer. This is also
    // what gives every edge a reading well above the 3:1 floor on demand.
    const touchesActive = active !== null && (edge.source === active || edge.target === active);
    ctx.beginPath();
    ctx.setLineDash(edge.relation === "mentions" ? [2.5, 3.5] : []);
    ctx.strokeStyle = touchesSelection ? ink.selected : touchesActive ? ink.source : ink.edge;
    ctx.lineWidth = touchesSelection ? 1.5 : touchesActive ? 1.25 : 1;
    if (edge.certainty === "unverified") {
      // One break at the midpoint, orthogonal to the dash: the line is drawn as two
      // segments with a gap, so "there is a citation" and "it may no longer describe this
      // file" are two different marks rather than two shades of one.
      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2;
      const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      const gap = Math.min(BROKEN_EDGE_GAP, length / 3) / 2;
      const ux = (to.x - from.x) / length;
      const uy = (to.y - from.y) / length;
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(midX - ux * gap, midY - uy * gap);
      ctx.moveTo(midX + ux * gap, midY + uy * gap);
      ctx.lineTo(to.x, to.y);
    } else {
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // ── Nodes. ──
  for (const node of frame.nodes) {
    const centre = nodeCentre(frame, node.id);
    if (!centre) continue;
    const radius = NODE_RADIUS[node.kind];
    const isSelected = node.id === frame.selectedId;
    const isHovered = node.id === frame.hoveredId;
    const isFocused = node.id === frame.focusedId;
    const ownInk = node.kind === "page" ? ink.page : node.kind === "source" ? ink.source : ink.concept;
    const mark = isSelected ? ink.selected : ownInk;

    if (node.kind === "source") {
      if (node.state === "not-compiled") {
        // Hollow: nobody has written this file up. The empty square is the positive mark
        // for that state, so it does not have to be read out of a missing line.
        ctx.strokeStyle = mark;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(centre.x - radius, centre.y - radius, radius * 2, radius * 2);
      } else {
        ctx.fillStyle = mark;
        ctx.fillRect(centre.x - radius, centre.y - radius, radius * 2, radius * 2);
      }
    } else if (node.kind === "concept") {
      // Hollow: the ground shows through, which is the whole of what says "this one is
      // not a file in your folder".
      ctx.beginPath();
      ctx.strokeStyle = mark;
      ctx.lineWidth = 1.5;
      ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.fillStyle = mark;
      ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    if (isSelected) {
      ctx.beginPath();
      ctx.strokeStyle = ink.selectedRing;
      ctx.lineWidth = 1;
      ctx.arc(centre.x, centre.y, radius + SELECTION_RING_GAP, 0, Math.PI * 2);
      ctx.stroke();
    } else if (isHovered) {
      // Pointing is not choosing, so the hover ring is the neutral one — **and a dotted
      // one**. It used to differ from the selection ring by ink alone, which was the one
      // fact on this canvas carried by colour by itself (design-infoviz, 2026-09-06).
      ctx.beginPath();
      ctx.setLineDash([1, 2]);
      ctx.strokeStyle = ink.hoverRing;
      ctx.lineWidth = 1;
      ctx.arc(centre.x, centre.y, radius + SELECTION_RING_GAP, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // The keyboard's own mark, outside both of those: where focus is does not stop
    // being true because the pointer moved, and a focused node may also be the
    // selected one.
    if (isFocused) {
      ctx.beginPath();
      ctx.strokeStyle = ink.selectedRing;
      ctx.lineWidth = 2;
      ctx.arc(centre.x, centre.y, radius + FOCUS_RING_GAP, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // ── The one label, beside the node being pointed at. ──
  const activeNode = active ? frame.nodes.find((node) => node.id === active) ?? null : null;
  const activeCentre = active ? nodeCentre(frame, active) : null;
  if (activeNode && activeCentre && frame.activeLabel) {
    ctx.font = `${LABEL_FONT_PX}px ${ink.fontFamily}`;
    ctx.textBaseline = "middle";
    /*
     * **The label is fitted to the canvas before it is placed** (2026-09-06). The box was
     * only ever flipped and left-clamped, which holds while the canvas is a full-pane
     * band; once the canvas is no wider than the picture it frames, a long name —
     * `Checkout · Open on the map` measures 168px — is wider than the clearance on either
     * side and ran off the right edge. Truncating keeps the whole box inside the frame,
     * and an ellipsis says a name was shortened rather than that the file is called that.
     */
    const maxBoxWidth = Math.max(LABEL_PAD_X * 2, frame.width - 4);
    const text = truncateToWidth(ctx, frame.activeLabel, maxBoxWidth - LABEL_PAD_X * 2);
    const textWidth = ctx.measureText(text).width;
    const boxWidth = textWidth + LABEL_PAD_X * 2;
    const boxHeight = LABEL_FONT_PX + LABEL_PAD_Y * 2;
    // Flip to the other side rather than let the label leave the canvas: a name that
    // runs off the edge is the same as no name.
    // Measured from the **edge of the mark and its ring**, not from the node's centre:
    // an 8px gap from the centre put the box on top of the ring it was labelling.
    const clearance = NODE_RADIUS[activeNode.kind] + SELECTION_RING_GAP + LABEL_GAP;
    let x = activeCentre.x + clearance;
    if (x + boxWidth > frame.width - 2) x = activeCentre.x - clearance - boxWidth;
    if (x < 2) x = 2;
    // Both edges, not just the left one: flipping a box that is wider than the clearance
    // allows only moves which edge it leaves through.
    if (x + boxWidth > frame.width - 2) x = Math.max(2, frame.width - 2 - boxWidth);
    let y = activeCentre.y - boxHeight / 2;
    if (y < 2) y = 2;
    if (y + boxHeight > frame.height - 2) y = frame.height - 2 - boxHeight;

    ctx.fillStyle = ink.labelSurface;
    roundedRect(ctx, x, y, boxWidth, boxHeight, LABEL_RADIUS);
    ctx.fill();
    ctx.strokeStyle = ink.labelBorder;
    ctx.lineWidth = 1;
    roundedRect(ctx, x + 0.5, y + 0.5, boxWidth - 1, boxHeight - 1, LABEL_RADIUS);
    ctx.stroke();
    ctx.fillStyle = ink.labelInk;
    ctx.fillText(text, x + LABEL_PAD_X, y + boxHeight / 2);
  }

  ctx.restore();
}

/**
 * The longest prefix of `text` that fits `maxWidth`, with an ellipsis when anything was
 * dropped. Binary search rather than a per-character walk: a name is measured about seven
 * times instead of once per glyph, on the one label a frame ever draws.
 *
 * Returns `""` only when even the ellipsis does not fit, which is a canvas too small to
 * carry a label at all.
 */
function truncateToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = "…";
  if (ctx.measureText(ellipsis).width > maxWidth) return "";
  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (ctx.measureText(`${text.slice(0, middle)}${ellipsis}`).width <= maxWidth) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return `${text.slice(0, low)}${ellipsis}`;
}
