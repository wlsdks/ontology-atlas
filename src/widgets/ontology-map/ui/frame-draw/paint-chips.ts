import { CLUSTER_CHIP_LABEL_PRIORITY, NODE_DISC_LABEL_PRIORITY, type ReservedBox } from "../../render/label-layout";
import { clusterChipOccupancyRect, drawClusterChip, clusterChipScale } from "../../render/cluster-chips";
import { radiusForKind } from "../topology-world";
import { BACKGROUND_DIM_WHEN_EXPANDED, ZERO_DOME_FRAME } from "./frame-state";
import { type FrameScope } from "./frame-scope";

const CLUSTER_CHIP_HOVER_MS = 150;

let clusterChipHoverAnim: {
    id: string;
    startAt: number;
} | null = null;

export function paintClusterChips(F: FrameScope): void {
  const { camera, hoveredClusterId, clusterChips, reducedMotion, now, world, tokens, spotlightIds,
    chipRevealById, expand, clusterBarLabels, focusedNodeId, tierNameBoxes, ctx, spotlightSink,
    trailLensActive, trailRamp, domeOn, domeFrameFor, project, effectiveAlphaById,
    nodeDiscReservations } = F;
  const chipScale = clusterChipScale(camera.scale.value);
  if (clusterChipHoverAnim !== null && clusterChipHoverAnim.id !== hoveredClusterId) {
    clusterChipHoverAnim = null;
  }
  const chipReservations: ReservedBox[] = [];
  for (const chip of clusterChips) {
    const parentAlpha = effectiveAlphaById.get(chip.parentId) ?? 1;
    if (parentAlpha <= 0.02) continue;
    const isChipHovered = hoveredClusterId === chip.parentId;
    let hoverT = 0;
    if (isChipHovered) {
      if (reducedMotion) {
        hoverT = 1;
      } else {
        if (clusterChipHoverAnim === null) clusterChipHoverAnim = { id: chip.parentId, startAt: now };
        hoverT = Math.min(1, (now - clusterChipHoverAnim.startAt) / CLUSTER_CHIP_HOVER_MS);
      }
    }
    const parentNode = world.nodeById.get(chip.parentId);
    const chipDOff = parentNode ? domeFrameFor(parentNode.id) : ZERO_DOME_FRAME;
    const screen = project(chip.anchor.x + chipDOff.dx, chip.anchor.y + chipDOff.dy);
    const parentScreen = parentNode ? project(parentNode.x + chipDOff.dx, parentNode.y + chipDOff.dy) : null;
    const nodeScreenRadius = parentNode
      ? radiusForKind(parentNode.kind, tokens) * parentNode.magnitudeScale * camera.scale.value
      : undefined;
    ctx.globalAlpha =
      parentAlpha *
      spotlightSink(
        (spotlightIds !== null && spotlightIds.has(chip.parentId)) || isChipHovered) *
      (trailLensActive ? 1 - (1 - BACKGROUND_DIM_WHEN_EXPANDED) * trailRamp : 1);
    const chipDrawInput = {
      screenX: screen.x,
      screenY: screen.y,
      count: chip.count,
      expanded: chip.expanded,
      hovered: isChipHovered,
      hoverT,
      revealT: chip.ego ? undefined : chipRevealById?.get(chip.parentId),
      scale: chipScale,
      parentScreenX: parentScreen?.x,
      parentScreenY: parentScreen?.y,
      nodeScreenRadius,
      affordance: expand.affordance,
      batchSize: expand.batchSize,
      barLabels: clusterBarLabels ?? undefined,
      focused: chip.ego === true || focusedNodeId === chip.parentId,
    };
    const occupancy = clusterChipOccupancyRect(chipDrawInput);
    if (occupancy) {
      chipReservations.push({
        bbox: {
          minX: occupancy.x,
          minY: occupancy.y,
          maxX: occupancy.x + occupancy.w,
          maxY: occupancy.y + occupancy.h,
        },
        priority: CLUSTER_CHIP_LABEL_PRIORITY,
      });
    }
    drawClusterChip(
      ctx,
      chipDrawInput,
      {
        surface: tokens.nodeFillDim,
        border: tokens.clusterChipBorderRest,
        plusInk: tokens.clusterChipInkRest,
        numeralInk: tokens.clusterChipInkRest,
        tether: tokens.edgeContains,
        barInk: tokens.numeralFace,
        hoverSurface: tokens.nodeFillCapability,
        hoverBorder: tokens.indigo,
        hoverInk: tokens.indigoBright,
      });
        ctx.globalAlpha = 1;
    }
    if (domeOn && tierNameBoxes !== null) {
        for (const box of tierNameBoxes) {
            nodeDiscReservations.push({
                priority: NODE_DISC_LABEL_PRIORITY,
                bbox: { minX: box.minX, maxX: box.maxX, minY: box.minY, maxY: box.maxY },
            });
        }
    }
  F.chipReservations = chipReservations;
}
