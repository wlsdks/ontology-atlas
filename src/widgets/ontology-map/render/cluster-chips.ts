/**
 * Pure Canvas 2D drawing of the chip standing in for a collapsed parent's children: neutral surface
 * plus the single indigo (`docs/DESIGN-SYSTEM.md`). Hit-testing and drawing must use the same
 * rectangle, so `clusterChipRect`, `clusterChipLabel` and `clusterChipScale` are the single source;
 * they live in `cluster-chips/control-placement.ts` and are re-exported here.
 */

import { FONT_WEIGHT } from "@/shared/ui/tokens/font-weight";
import { lerpColorHex } from "./grid";
import {
  BAR_FONT_SIZE,
  clusterBadgeLabel,
  clusterBadgeRect,
  clusterBarLabel,
  clusterBarRect,
  clusterChipLabel,
  clusterChipRect,
  clusterChipTravelPoint,
  clusterControlForm,
  type ClusterBarLabels,
  type ClusterChipDrawInput,
} from "./cluster-chips/control-placement";

export {
  CLUSTER_BADGE_HEIGHT,
  CLUSTER_BAR_HEIGHT,
  CLUSTER_CHIP_HEIGHT,
  clusterBadgeCenter,
  clusterBadgeLabel,
  clusterBadgeRect,
  clusterBarLabel,
  clusterBarRect,
  clusterChipLabel,
  clusterChipOccupancyRect,
  clusterChipRect,
  clusterChipScale,
  clusterChipTravelPoint,
  clusterControlForm,
  orbitButtonRect,
  type ClusterBarLabels,
  type ClusterChipRect,
} from "./cluster-chips/control-placement";
export { estimateCanvasTextWidth } from "./cluster-chips/text-width";

const CHIP_FONT_SIZE = 13;
/** The bar uses the body stack, not mono: mono has no Hangul and falls back, which makes the width estimator in `cluster-chips/text-width.ts` unknowable. */
const BAR_FONT_FAMILY = "-apple-system, 'SF Pro Text', sans-serif";
const BADGE_FONT_SIZE = 11;

interface ClusterBarDrawInput {
  parentScreenX: number;
  parentScreenY: number;
  nodeScreenRadius: number;
  count: number;
  expanded: boolean;
  hovered: boolean;
  /** How many one press opens — decides "all" vs "N" in the label. */
  batchSize: number;
  labels?: ClusterBarLabels;
  scale?: number;
}

/** An opaque plate with a verb: the bar overlaps nodes by design, and a translucent plate lets edges and numerals bleed between letters. */
function drawClusterBar(
  ctx: CanvasRenderingContext2D,
  input: ClusterBarDrawInput,
  colors: ClusterChipColors,
): void {
  const scale = input.scale ?? 1;
  const label = clusterBarLabel(input);
  const rect = clusterBarRect(
    input.parentScreenX,
    input.parentScreenY,
    input.nodeScreenRadius,
    label,
    scale,
  );

  // A tighter radius than the pill tells the docked bar from the floating pill by silhouette.
  roundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 7 * scale);
  ctx.fillStyle = input.hovered ? colors.hoverSurface : colors.surface;
  ctx.fill();
  ctx.lineWidth = input.hovered ? 1.5 : 1;
  ctx.strokeStyle = input.hovered ? colors.hoverBorder : colors.border;
  ctx.stroke();

  // Centred without measuring: `clusterBarRect` is the only ruler.
  ctx.font = `${FONT_WEIGHT.strong} ${BAR_FONT_SIZE * scale}px ${BAR_FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = input.hovered ? colors.hoverInk : colors.barInk ?? colors.numeralInk;
  ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 0.5 * scale);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

interface ClusterBadgeDrawInput {
  parentScreenX: number;
  parentScreenY: number;
  /** Parent's base screen radius (`radiusForKind × magnitudeScale × cameraScale`). */
  nodeScreenRadius: number;
  count: number;
  hovered: boolean;
  /** Decides the label's sign (`−N` / `+N`); defaults to `true`. */
  expanded?: boolean;
  scale?: number;
}

/** A mini `−N` on the parent's shoulder, only a collapse affordance; the caller has set `ctx.globalAlpha` to the parent's tier alpha. */
function drawClusterBadge(
  ctx: CanvasRenderingContext2D,
  input: ClusterBadgeDrawInput,
  colors: ClusterChipColors,
): void {
  const scale = input.scale ?? 1;
  const label = clusterBadgeLabel(input.count, input.expanded ?? true);
  const rect = clusterBadgeRect(input.parentScreenX, input.parentScreenY, input.nodeScreenRadius, label, scale);

  roundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, rect.h / 2);
  ctx.fillStyle = colors.surface;
  ctx.fill();
  ctx.lineWidth = input.hovered ? 1.5 : 1;
  ctx.strokeStyle = colors.border;
  ctx.stroke();

  // Neutral numeral ink, not indigoBright: the focused node stays the attention winner.
  ctx.fillStyle = colors.numeralInk;
  ctx.font = `${FONT_WEIGHT.strong} ${BADGE_FONT_SIZE * scale}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 0.5 * scale);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

export interface ClusterChipColors {
  surface: string;
  /** Rest hairline border (neutral nodeStrokeDomain) — never competes with selection indigo. */
  border: string;
  plusInk: string;
  numeralInk: string;
  /** Rest ink of the bar's text, falling back to `numeralInk`: the bar is summoned after selection, so the permanent-chrome ink would be unreadably darker than a background node's outline. */
  barInk?: string;
  /** Parent→chip tether stroke (edgeContains — offset in lightness from the depends ink). */
  tether: string;
  hoverSurface: string;
  hoverBorder: string;
  hoverInk: string;
}

/** Manual rounded-rect path — `ctx.roundRect` is missing in jsdom and similar. */
function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

/** Draws one chip, multiplying into the caller's `ctx.globalAlpha` (the parent's tier alpha) and restoring it. */
export function drawClusterChip(
  ctx: CanvasRenderingContext2D,
  input: ClusterChipDrawInput,
  colors: ClusterChipColors,
): void {
  const scale = input.scale ?? 1;
  const affordance = input.affordance ?? "pill";
  const docked =
    input.parentScreenX !== undefined &&
    input.parentScreenY !== undefined &&
    input.nodeScreenRadius !== undefined;
  const form = clusterControlForm({
    affordance,
    expanded: input.expanded,
    focused: input.focused ?? false,
    dockable: docked,
  });
  // The bar affordance gives an unselected parent no control; occupancy returns null from the same decision.
  if (form === "none") return;

  if (form === "bar") {
    drawClusterBar(
      ctx,
      {
        parentScreenX: input.parentScreenX as number,
        parentScreenY: input.parentScreenY as number,
        nodeScreenRadius: input.nodeScreenRadius as number,
        count: input.count,
        expanded: input.expanded,
        hovered: input.hovered,
        batchSize: input.batchSize ?? input.count,
        labels: input.barLabels,
        scale,
      },
      colors,
    );
    return;
  }

  // The badge affordance is a badge in both states, with no pill to crossfade; only the sign flips.
  if (form === "badge" && affordance === "badge") {
    drawClusterBadge(
      ctx,
      {
        parentScreenX: input.parentScreenX as number,
        parentScreenY: input.parentScreenY as number,
        nodeScreenRadius: input.nodeScreenRadius as number,
        count: input.count,
        expanded: input.expanded,
        hovered: input.hovered,
        scale,
      },
      colors,
    );
    return;
  }

  // Both forms are drawn while the reveal ramp runs: branching on `expanded` and drawing one would
  // skip the crossfade and never reach `clusterChipTravelPoint` on expand. Omitted `revealT` is 1.
  const baseAlpha = ctx.globalAlpha;
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const badgeAlpha =
    input.revealT === undefined ? (input.expanded ? 1 : 0) : clamp01(input.revealT);
  const pillAlpha =
    input.revealT === undefined ? (input.expanded ? 0 : 1) : clamp01(1 - input.revealT);
  if (badgeAlpha < 0.01 && pillAlpha < 0.01) return;

  // The expanded form is the shoulder badge, which needs the parent coordinates and node radius; without them nothing is drawn.
  if (
    badgeAlpha >= 0.01 &&
    input.parentScreenX !== undefined &&
    input.parentScreenY !== undefined &&
    input.nodeScreenRadius !== undefined
  ) {
    ctx.globalAlpha = baseAlpha * badgeAlpha;
    drawClusterBadge(
      ctx,
      {
        parentScreenX: input.parentScreenX,
        parentScreenY: input.parentScreenY,
        nodeScreenRadius: input.nodeScreenRadius,
        count: input.count,
        hovered: input.hovered,
        scale,
      },
      colors,
    );
  }

  if (pillAlpha < 0.01) {
    ctx.globalAlpha = baseAlpha;
    return;
  }
  ctx.globalAlpha = baseAlpha * pillAlpha;

  // The departing or arriving pill is always the collapsed `+N`, or both ends of the crossfade would say the same thing.
  const label = clusterChipLabel(input.count, false);
  // While fading the pill walks to the badge seat; at rest (revealT 0 or omitted) it stays on the anchor.
  const travel = clusterChipTravelPoint(input);
  const rect = clusterChipRect(travel.x, travel.y, label, scale);

  // Hover easing is colour only: quiet neutral waking to indigo; no transform, zoom step or glow.
  const t = input.hoverT ?? (input.hovered ? 1 : 0);
  const mix = (rest: string, hover: string): string =>
    t <= 0 ? rest : t >= 1 ? hover : lerpColorHex(rest, hover, t);
  const surface = mix(colors.surface, colors.hoverSurface);
  const border = mix(colors.border, colors.hoverBorder);
  const plusColor = mix(colors.plusInk, colors.hoverInk);
  const numColor = mix(colors.numeralInk, colors.hoverInk);

  // The tether's texture differs from the depends dashes so it does not join the edge soup; the pill is filled afterwards and covers its inner segment.
  if (input.parentScreenX !== undefined && input.parentScreenY !== undefined) {
    ctx.save();
    ctx.setLineDash([3 * scale, 3 * scale]);
    ctx.beginPath();
    ctx.moveTo(input.parentScreenX, input.parentScreenY);
    ctx.lineTo(travel.x, travel.y);
    ctx.strokeStyle = colors.tether;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(input.parentScreenX, input.parentScreenY, 2 * scale, 0, Math.PI * 2);
    ctx.fillStyle = colors.plusInk;
    ctx.fill();
    ctx.restore();
  }

  roundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, rect.h / 2);
  ctx.fillStyle = surface;
  ctx.fill();
  ctx.lineWidth = input.hovered ? 1.5 : 1;
  ctx.strokeStyle = border;
  ctx.stroke();

  // `＋` indigo, numeral neutral, caret in the border ink; the hit box comes from the rect above, so the text centres freely.
  ctx.font = `${FONT_WEIGHT.strong} ${CHIP_FONT_SIZE * scale}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const plus = "+";
  const num = String(input.count);
  const caret = ` ${input.hovered ? "⌄" : "›"}`;
  const plusW = ctx.measureText(plus).width;
  const numW = ctx.measureText(num).width;
  const caretW = ctx.measureText(caret).width;
  const ty = travel.y + 0.5 * scale;
  let tx = travel.x - (plusW + numW + caretW) / 2;
  ctx.fillStyle = plusColor;
  ctx.fillText(plus, tx, ty);
  tx += plusW;
  ctx.fillStyle = numColor;
  ctx.fillText(num, tx, ty);
  tx += numW;
  ctx.fillStyle = border;
  ctx.fillText(caret, tx, ty);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
  ctx.globalAlpha = baseAlpha;
}
