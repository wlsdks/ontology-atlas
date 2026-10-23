import type { CameraTarget } from "../../../engine/camera";
import type { Box, DialWorld, Point } from "../../../dial/types";
import { branchMemberCount } from "../../../dial/branches/member-disclosure";
import { branchNameLines, branchTextStyle } from "../../../dial/branches/text";
import { BRANCH_ROW_PITCH } from "../../../dial/branches/layout";
import { createMeasureText } from "../../../dial/fit";
import { readDialTokens } from "../../../dial/tokens";
import type { OntologyMapTokens } from "../../../tokens/read-map-tokens";
import { SELECTION_NUDGE_MARGIN_PX } from "../../../model/camera/flat-selection-camera";
import type { TopologyWorld } from "../../world/topology-world";
import { focusTargetLeashPx } from "../topology-camera-math";

type Insets = { obstacleInsetLeft?: number; obstacleInsetRight?: number };

/** Fit the disclosed names and controls against the occupied canvas, not the entire map's label pad. */
export function branchFocusTarget(world: TopologyWorld, dial: DialWorld | null | undefined, id: string, tokens: OntologyMapTokens & Insets, width: number, height: number, options: { positions?: ReadonlyMap<string, Point>; scopedCapability?: boolean } = {}): CameraTarget | null {
  const domainCluster = dial?.scene.branches ? dial.scene.clusterByDomain.get(id) : null;
  if (!domainCluster && !options.scopedCapability) return null;
  const owner = dial?.model?.capabilityById.get(id)?.domainId;
  const cluster = domainCluster ?? (owner && dial?.scene.branches ? dial.scene.clusterByDomain.get(owner) : null);
  const node = world.nodeById.get(id);
  const root = node && { ...node, ...options.positions?.get(id) };
  if (!dial || !cluster || !root) return null;
  const style = readDialTokens();
  const measure = createMeasureText();
  const count = branchMemberCount(dial.scene, cluster.domainId);
  const members = cluster.items.filter(item => !item.direct).slice(0, count);
  const side = cluster.branchSide ?? 1;
  const titleStyle = branchTextStyle("domain", "domain", style.labelScale);
  const memberStyle = branchTextStyle("capability", "capability", style.labelScale);
  const titleLines = branchNameLines(root.label ?? id, titleStyle.font, style.nameMaxPx, measure);
  const cardWidth = Math.max(style.nameMaxPx + style.ledgerGapPx * 2, ...titleLines.map(line => measure(line, titleStyle.font) + style.ledgerGapPx * 2));
  const cardHeight = (style.ledgerGapPx + style.chipMinPx) * 2 + (titleLines.length - 1) * titleStyle.height;
  const labels = members.map(item => {
    const point = options.positions?.get(item.id) ?? world.nodeById.get(item.id) ?? item;
    const label = world.nodeById.get(item.id)?.label ?? item.id;
    const lines = branchNameLines(label, memberStyle.font, style.nameMaxPx, measure);
    return { point, width: Math.max(...lines.map(line => measure(line, memberStyle.font))), height: lines.length * memberStyle.height + 4 };
  });
  const left = tokens.obstacleInsetLeft ?? tokens.safeInsetLeft;
  const right = tokens.obstacleInsetRight ?? tokens.safeInsetRight;
  const air = width - left - right >= 400 ? SELECTION_NUDGE_MARGIN_PX : 24;
  const free = { minX: left + air, maxX: width - right - air, minY: tokens.safeInsetTop + style.ledgerGapPx, maxY: height - tokens.safeInsetBottom - style.ledgerGapPx };
  if (!domainCluster) {
    const scale = Math.min(tokens.cameraScaleMax, Math.max(0.65, style.capName / style.pitch));
    const radius = Math.min(tokens.radiusCapability * 1.5, Math.max(style.discGlyphPx, style.pitch * BRANCH_ROW_PITCH * scale / 3));
    const lines = branchNameLines(root.label, memberStyle.font, style.nameMaxPx, measure);
    const nameWidth = Math.max(...lines.map(line => measure(line, memberStyle.font)));
    const near = radius + style.chipMinPx;
    const far = near + nameWidth + 2;
    const nameCentre = side * (far - radius) / 2;
    return { tx: root.x + (nameCentre - (free.minX + free.maxX - width) / 2) / scale,
      ty: root.y - (free.minY + free.maxY - height) / 2 / scale, tscale: scale };
  }
  const boundsAt = (scale: number): Box => {
    const boxes: Box[] = [{ minX: root.x * scale - cardWidth / 2, maxX: root.x * scale + cardWidth / 2, minY: root.y * scale - cardHeight / 2, maxY: root.y * scale + cardHeight / 2 }];
    const radius = Math.min(tokens.radiusCapability * 1.5, Math.max(style.discGlyphPx, style.pitch * BRANCH_ROW_PITCH * scale / 3));
    for (const { point, width: nameWidth, height: nameHeight } of labels) {
      const x = point.x * scale;
      const y = point.y * scale;
      const reach = radius + style.chipMinPx + nameWidth + 2;
      boxes.push({ minX: x - (side < 0 ? reach : radius), maxX: x + (side > 0 ? reach : radius), minY: y - Math.max(radius, nameHeight / 2), maxY: y + Math.max(radius, nameHeight / 2) });
    }
    const last = members.at(-1);
    if (last) {
      const x = last.x * scale;
      const y = (last.y + style.pitch * BRANCH_ROW_PITCH) * scale;
      const reach = radius + style.chipMinPx + style.nameMaxPx + style.ledgerGapPx * 2;
      boxes.push({ minX: x - (side < 0 ? reach : 0), maxX: x + (side > 0 ? reach : 0), minY: y - memberStyle.height / 2 - 2, maxY: y + style.ledgerGapPx + memberStyle.height / 2 + 2 });
    }
    return { minX: Math.min(...boxes.map(box => box.minX)), maxX: Math.max(...boxes.map(box => box.maxX)), minY: Math.min(...boxes.map(box => box.minY)), maxY: Math.max(...boxes.map(box => box.maxY)) };
  };
  let lo = 0.02;
  let hi = tokens.cameraScaleMax;
  for (let i = 0; i < 24; i++) {
    const scale = (lo + hi) / 2;
    const bounds = boundsAt(scale);
    if (bounds.maxX - bounds.minX <= free.maxX - free.minX && bounds.maxY - bounds.minY <= free.maxY - free.minY) lo = scale;
    else hi = scale;
  }
  const bounds = boundsAt(lo);
  return { tx: ((bounds.minX + bounds.maxX) / 2 - (free.minX + free.maxX - width) / 2) / lo,
    ty: ((bounds.minY + bounds.maxY) / 2 - (free.minY + free.maxY - height) / 2) / lo, tscale: lo };
}

export function branchTargetLeash(node: { x: number; y: number }, target: CameraTarget, width: number, height: number, tokens: OntologyMapTokens) {
  const leash = focusTargetLeashPx(tokens, width, height);
  return { x: Math.max(leash.x, Math.abs(node.x - target.tx) * target.tscale + 1),
    y: Math.max(leash.y, Math.abs(node.y - target.ty) * target.tscale + 1) };
}
