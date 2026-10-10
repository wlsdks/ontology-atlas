import type { NodeEgoState } from "../../model/focus-state";
import { isPathLensNode } from "../../model/path-lens";
import { classifyZoomTier } from "../../model/tier-visibility";
import {
  LABEL_TOP_K,
  isEgoNeighborLabelExempt,
  selectDiscLabelEligible,
  selectTopKLabels,
  type LabelRankEntry,
} from "../../model/label-lod";
import {
  ACTIVITY_MARK_GAP,
  ACTIVITY_MARK_RADIUS,
  computeLensLabelAlpha,
  draw as labelsDraw,
  resolveLabelBaselineY,
  resolveFlippedLabelBaselineY,
  measureLabelWidth,
  measureLabelVerticalMetrics,
  scaledLabelFontSize,
} from "../../render/labels";
import {
  ellipsizeToWidth,
  greedyPlaceLabels,
  filterFadingLabelCollisions,
  ReservedBoxIndex,
  clampAnchorIntoSafeRect,
  isSafeRectProtectedLabel,
  isWithinSafeRect,
  resolveLabelPriority,
  floorFlipBaseline,
  type LabelCandidate,
  type SafeRect,
} from "../../render/label-layout";
import { isPreviewEndpoint, isPreviewEndpointHidden } from "../../render/preview-edge";
import { rankedDiscChildren, rankedEgoNeighbors } from "../frame-cache/structure";
import { radiusForKind, type WorldNode } from "../topology-world";
import { passState } from "./frame-state";
import { type FrameScope } from "./frame-scope";

const LABEL_SIDE_GAP = 3;
const labelScreenScratch = { x: 0, y: 0 };

let prevPlacedLabelIds: ReadonlySet<string> = new Set();

let lastLabelRampNow = 0;

interface LabelPayload {
  nodeId: string;
  kind: WorldNode["kind"];
  text: string;
  screenX: number;
  screenY: number;
  screenRadius: number;
  baselineY: number;
  egoState: NodeEgoState;
  isHovered: boolean;
  revealAlpha: number;
  emphasisAlpha: number;
  lensSink: number;
  agentFocus: boolean;
  depthU: number;
}

export function paintLabels(F: FrameScope): void {
  const { tokens, panelInsets, viewportWidth, viewportHeight, zoomRatio, clusterChips, world,
    expand, focusedNodeId, previewEdge, clusteredIds, selectedEdge, mapLensKind, spotlightIds,
    hoveredNodeId, spotlightRamp, camera, reviewQuestionIds, agentFocusNodeId, labelPresentById,
    now, reducedMotion, appearById, ctx, pathLensActive, constellationLensActive, spotlightSink,
    isTrailKept, lensNodeEgoState, realmParallaxOffsetFor, domeOn, nodeFrameAt, labelScale, camX,
    camY, camScale, halfW, halfH, neighborsOfFocused, egoAllNormal, effectiveAlphaById,
    drawnScreenRadiusById, nodeDiscReservations, chipReservations } = F;
  const safeRect: SafeRect = {
    left: Math.max(tokens.safeInsetLeft, panelInsets?.left ?? 0),
    right: viewportWidth - Math.max(tokens.safeInsetRight, panelInsets?.right ?? 0),
    top: tokens.safeInsetTop,
    bottom: viewportHeight - tokens.safeInsetBottom,
  };
  const labelZoomTier = classifyZoomTier(zoomRatio);
  const applyLabelTopK = labelZoomTier !== "element";
  const expandedDiscChildIds = new Set<string>();
  const discLabelEligibleIds = (() => {
    if (!applyLabelTopK) return new Set<string>();
    const rankedByDisc: (readonly string[])[] = [];
    for (const chip of clusterChips) {
      if (!chip.expanded) continue;
      const childIds = world.childrenByParent.get(chip.parentId) ?? [];
      for (const id of childIds) expandedDiscChildIds.add(id);
      rankedByDisc.push(rankedDiscChildren(world, chip.parentId));
    }
    return selectDiscLabelEligible(rankedByDisc, expand.labelAttempts);
  })();
  const egoNeighborLabelEligibleIds: ReadonlySet<string> | null =
    applyLabelTopK && focusedNodeId !== null && neighborsOfFocused.size > expand.labelAttempts
      ? selectDiscLabelEligible(
        [rankedEgoNeighbors(world, neighborsOfFocused)],
        expand.labelAttempts)
      : null;
  const labelRankEntries: LabelRankEntry[] = [];
  const labelCandidates: LabelCandidate<LabelPayload>[] = [];
  const labelBboxById = new Map<string, {
    minX: number; minY: number; maxX: number; maxY: number;
  }>();
  const labelFlipSlots = new Map<string, {
    baselineY: number; ascent: number; descent: number;
  }>();
  for (let index = 0; index < world.nodes.length; index += 1) {
    const node = world.nodes[index];
    const previewEndpoint = isPreviewEndpoint(previewEdge, node.id);
    const previewTarget = node.id === previewEdge?.targetId;
    if (isPreviewEndpointHidden(clusteredIds.has(node.id), previewEdge, node.id)) continue;
    const revealAlpha = effectiveAlphaById.get(node.id) ?? 1;
    if (revealAlpha <= 0.02) continue;
    const egoState = previewTarget
      ? "neighbor"
      : egoAllNormal
        ? "normal"
        : lensNodeEgoState(node.id, focusedNodeId, neighborsOfFocused, selectedEdge);
    const trailKept = isTrailKept(node.id);
    const pathKept = isPathLensNode(mapLensKind, node.id, spotlightIds);
    const constellationKept =
      mapLensKind === "constellation" && spotlightIds?.has(node.id) === true;
    const isHovered = hoveredNodeId !== null && node.id === hoveredNodeId;
    if (
      applyLabelTopK &&
      expandedDiscChildIds.has(node.id) &&
      !discLabelEligibleIds.has(node.id) &&
      egoState !== "center" &&
      egoState !== "neighbor" &&
      !isHovered &&
      !previewEndpoint &&
      !trailKept &&
      !pathKept &&
      !constellationKept
    ) {
      continue;
    }
    const pathLabelSink = pathLensActive || constellationLensActive
      ? spotlightSink(pathKept || constellationKept || isHovered || previewEndpoint)
      : 1;
    const baseCompactAlpha = computeLensLabelAlpha({
      kind: node.kind,
      egoState,
      isHovered,
      revealAlpha,
      lensSink: pathLabelSink,
    });
    const compactAlpha = constellationKept
      ? Math.max(baseCompactAlpha, spotlightRamp)
      : baseCompactAlpha;
    const labelDome = nodeFrameAt(index);
    if (compactAlpha <= 0.02) continue;

    const labelPOff = realmParallaxOffsetFor(node.id);
    const labelDOff = labelDome;
    const screen = labelScreenScratch;
    screen.x = (node.x + labelPOff.x + labelDOff.dx - camX) * camScale + halfW;
    screen.y = (node.y + labelPOff.y + labelDOff.dy - camY) * camScale + halfH;
    const screenRadius =
      drawnScreenRadiusById.get(node.id) ?? radiusForKind(node.kind, tokens) * camera.scale.value;
    const anchorY = resolveLabelBaselineY(node.kind, screen.y, screenRadius, labelScale);
    const text = ellipsizeToWidth(reviewQuestionIds?.has(node.id) ? `? ${node.label}` : node.label, tokens.labelMaxWidth * labelScale, (candidate) => measureLabelWidth(ctx, node.kind, candidate, labelScale));
    const width = measureLabelWidth(ctx, node.kind, text, labelScale);
    const fontSize = scaledLabelFontSize(node.kind, labelScale);
    const agentFocus = agentFocusNodeId !== null && node.id === agentFocusNodeId;
    const markReserve = agentFocus ? ACTIVITY_MARK_GAP * 2 + ACTIVITY_MARK_RADIUS * 2 : 0;
    let anchorX = screen.x;
    let clampedAnchorY = anchorY;
    let baselineY = anchorY;
    const floorFlip = isWithinSafeRect(anchorX, anchorY, safeRect)
      ? null
      : floorFlipBaseline(anchorX, anchorY, resolveFlippedLabelBaselineY(screen.y, screenRadius), screen.y, safeRect, viewportHeight);
    if (floorFlip !== null) {
      baselineY = floorFlip;
    }
    else if (!isWithinSafeRect(anchorX, anchorY, safeRect)) {
      if (!isSafeRectProtectedLabel({
        egoState,
        isHovered,
        trailKept: trailKept || pathKept || constellationKept,
        kind: node.kind,
        isHub: node.isHub,
      })) {
        continue;
      }
      const clamped = clampAnchorIntoSafeRect(anchorX, anchorY, safeRect, width / 2 + 4, fontSize + 4);
      anchorX = clamped.x;
      clampedAnchorY = clamped.y;
      baselineY = clampedAnchorY;
    }
    const shiftX = anchorX - screen.x;
    const shiftY = clampedAnchorY - anchorY;
    if (applyLabelTopK) {
      const exempt = egoState === "center" ||
        isHovered ||
        trailKept ||
        pathKept ||
        constellationKept ||
        (egoState === "neighbor" && isEgoNeighborLabelExempt(node.id, egoNeighborLabelEligibleIds));
      labelRankEntries.push({ id: node.id, degree: world.neighborMap.get(node.id)?.size ?? 0, exempt });
    }
    const priority = resolveLabelPriority({
      kind: node.kind,
      isSelected: egoState === "center",
      isHovered,
      isHub: node.isHub,
      isLensSubject: pathKept || constellationKept,
    });
    const vertical = measureLabelVerticalMetrics(ctx, node.kind, labelScale);
    const boxAt = (baselineY: number) => ({
      minX: anchorX - width / 2 - LABEL_SIDE_GAP,
      maxX: anchorX + width / 2 + markReserve + LABEL_SIDE_GAP,
      minY: baselineY - vertical.ascent,
      maxY: baselineY + vertical.descent,
    });
    const candidateBbox = boxAt(baselineY);
    labelBboxById.set(node.id, candidateBbox);
    labelFlipSlots.set(node.id, {
      baselineY: resolveFlippedLabelBaselineY(screen.y, screenRadius) + (clampedAnchorY - anchorY),
      ascent: vertical.ascent,
      descent: vertical.descent,
    });
    const flipSlot = labelFlipSlots.get(node.id);
    labelCandidates.push({
      priority,
      altBbox: flipSlot
        ? { minX: candidateBbox.minX, maxX: candidateBbox.maxX, minY: flipSlot.baselineY - flipSlot.ascent, maxY: flipSlot.baselineY + flipSlot.descent }
        : undefined,
      order: domeOn ? Math.round(labelDome.u * 100000) : index,
      ownerId: node.id,
      bbox: candidateBbox,
      payload: {
        nodeId: node.id,
        kind: node.kind,
        text,
        screenX: screen.x + shiftX,
        screenY: screen.y + shiftY,
        baselineY,
        screenRadius,
        egoState,
        isHovered,
        revealAlpha,
        lensSink: pathLabelSink,
        emphasisAlpha: constellationKept ? spotlightRamp : 0,
        agentFocus,
        depthU: domeOn ? labelDome.u : 0,
      },
    });
  }
  const placedLabelCandidates = applyLabelTopK
    ? (() => {
      const allowed = selectTopKLabels(labelRankEntries, LABEL_TOP_K);
      return labelCandidates.filter((candidate) => allowed.has(candidate.payload.nodeId));
    })()
    : labelCandidates;
  const discIndex = new ReservedBoxIndex(nodeDiscReservations);
  for (const candidate of placedLabelCandidates) {
    const nodeId = candidate.payload.nodeId;
    if (!discIndex.overlapsForeign(candidate.bbox, nodeId, candidate.priority)) {
      continue;
    }
    const slot = labelFlipSlots.get(nodeId);
    if (slot === undefined)
      continue;
    const flipped = {
      minX: candidate.bbox.minX,
      maxX: candidate.bbox.maxX,
      minY: slot.baselineY - slot.ascent,
      maxY: slot.baselineY + slot.descent,
    };
    if (discIndex.overlapsForeign(flipped, nodeId, candidate.priority))
      continue;
    candidate.bbox = flipped;
    candidate.payload.baselineY = slot.baselineY;
    labelBboxById.set(nodeId, flipped);
  }
  const placedResult = greedyPlaceLabels(placedLabelCandidates, (c) => prevPlacedLabelIds.has(c.payload.nodeId), chipReservations.length === 0 ? discIndex : [...chipReservations, ...nodeDiscReservations]);
  for (const candidate of placedResult) {
    if (!candidate.usedAlt)
      continue;
    const slot = labelFlipSlots.get(candidate.payload.nodeId);
    if (slot === undefined)
      continue;
    candidate.payload.baselineY = slot.baselineY;
    labelBboxById.set(candidate.payload.nodeId, candidate.bbox);
  }
  const placedIds = new Set<string>(placedResult.map((c) => c.payload.nodeId));
  const presenceById = labelPresentById;
  let drawList: {
    payload: LabelPayload;
    presenceAlpha: number;
  }[] = [];
  if (presenceById) {
    const dtSec = lastLabelRampNow === 0 ? 0 : Math.min((now - lastLabelRampNow) / 1000, 0.05);
    lastLabelRampNow = now;
    const stepPer = tokens.tipFadeMs > 0 ? dtSec / (tokens.tipFadeMs / 1000) : 1;
    const onScreenIds = new Set<string>();
    for (const candidate of labelCandidates) {
      const id = candidate.payload.nodeId;
      onScreenIds.add(id);
      const target = placedIds.has(id) ? 1 : 0;
      const prev = presenceById.get(id) ?? (target === 1 && prevPlacedLabelIds.has(id) ? 1 : 0);
      const next = reducedMotion
        ? target
        : Math.min(1, Math.max(0, prev + (target === 1 ? stepPer : -stepPer)));
      presenceById.set(id, next);
      if (next > 0.02)
        drawList.push({ payload: candidate.payload, presenceAlpha: next });
    }
    for (const id of [...presenceById.keys()])
      if (!onScreenIds.has(id))
        presenceById.delete(id);
  }
  else {
    for (const c of placedResult)
      drawList.push({ payload: c.payload, presenceAlpha: 1 });
  }
  if (domeOn) {
    drawList = filterFadingLabelCollisions(drawList, entry => placedIds.has(entry.payload.nodeId), entry => labelBboxById.get(entry.payload.nodeId));
  }
  prevPlacedLabelIds = placedIds;
  if (domeOn)
    drawList.sort((a, b) => b.payload.depthU - a.payload.depthU);
  passState.drawnLabelBoxes = [];
  for (const { payload, presenceAlpha } of drawList) {
    if (presenceAlpha > 0.5) {
      const box = labelBboxById.get(payload.nodeId);
      if (box)
        passState.drawnLabelBoxes.push({ nodeId: payload.nodeId, text: payload.text, ...box });
    }
    labelsDraw(ctx, {
      kind: payload.kind,
      text: payload.text,
      screenX: payload.screenX,
      screenY: payload.screenY,
      screenRadius: payload.screenRadius,
      baselineY: payload.baselineY,
      egoState: payload.egoState,
      isHovered: payload.isHovered,
      revealAlpha: payload.revealAlpha,
      emphasisAlpha: payload.emphasisAlpha,
      agentFocus: payload.agentFocus,
      fontScale: labelScale,
      presenceAlpha: presenceAlpha *
        payload.lensSink *
        (appearById ? Math.min(1, Math.max(0, appearById.get(payload.nodeId) ?? 1)) : 1),
    }, {
      labelProject: tokens.labelProject,
      labelDomain: tokens.labelDomain,
      labelCapability: tokens.labelCapability,
      labelElement: tokens.labelElement,
      amberHub: tokens.amberHub,
      labelHalo: tokens.canvasBgNear,
    });
  }
  F.safeRect = safeRect;
}
