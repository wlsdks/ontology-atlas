/**
 * Camera-space conversions — `worldToScreen`/`screenToWorld`/`fitWorldTarget`/
 * `hitTestWorld` (prototype `worldToScreen()`/`screenToWorld()`/`fitTarget()`/
 * `hitTest()`, `docs/prototypes/topology-b2plus.html` §8/§9).
 *
 * Camera convention (`engine/spring.ts`/`engine/momentum.ts` JSDoc — already
 * committed, tested): `camera.x`/`camera.y` are the WORLD point the camera is
 * centered on, `camera.scale` the world-to-screen zoom factor — the
 * prototype's own convention, not `topology-map-canvas/lib/camera.ts`'s
 * `{tx,ty,k}` translate convention (a different parameterization the already-
 * built engine modules don't use). These are this file's local, tiny
 * (prototype-faithful) equivalents of that lib's `fitBounds`/pan math, kept
 * in the convention the engine layer expects.
 */

import type { CameraAxes, CameraTarget } from "../engine/camera";
import type { TopologyV2Tokens } from "../tokens/read-topology-v2-tokens";
import { radiusForKind, type TopologyWorld } from "./topology-world";
import type { WorldNode } from "./topology-world";

interface Point {
  x: number;
  y: number;
}

export function worldToScreen(camera: CameraAxes, viewportWidth: number, viewportHeight: number, wx: number, wy: number): Point {
  return {
    x: (wx - camera.x.value) * camera.scale.value + viewportWidth / 2,
    y: (wy - camera.y.value) * camera.scale.value + viewportHeight / 2,
  };
}

export function screenToWorld(camera: CameraAxes, viewportWidth: number, viewportHeight: number, sx: number, sy: number): Point {
  return {
    x: (sx - viewportWidth / 2) / camera.scale.value + camera.x.value,
    y: (sy - viewportHeight / 2) / camera.scale.value + camera.y.value,
  };
}

/** Ported from the prototype's `fitTarget()` — centers `bounds` in the viewport, clamped to `[scaleMin, maxScale]`. */
export function fitWorldTarget(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  viewportWidth: number,
  viewportHeight: number,
  maxScale: number,
  scaleMin: number,
): CameraTarget {
  const w = Math.max(1, bounds.maxX - bounds.minX);
  const h = Math.max(1, bounds.maxY - bounds.minY);
  let scale = Math.min(viewportWidth / w, viewportHeight / h);
  scale = Math.min(scale, maxScale);
  scale = Math.max(scale, scaleMin);
  return {
    tx: (bounds.minX + bounds.maxX) / 2,
    ty: (bounds.minY + bounds.maxY) / 2,
    tscale: scale,
  };
}

/** Ported from the prototype's `hitTest()` — nearest node under `(screenX, screenY)`, `null` if none is within its padded radius. */
export function hitTestWorld(
  world: TopologyWorld,
  camera: CameraAxes,
  viewportWidth: number,
  viewportHeight: number,
  tokens: TopologyV2Tokens,
  screenX: number,
  screenY: number,
  /** Optional filter — skips nodes that aren't currently hittable (e.g. semantic-zoom-hidden tiers). Defaults to "all hittable". */
  isHittable?: (node: WorldNode) => boolean,
): string | null {
  let bestId: string | null = null;
  let bestDistance = Infinity;
  for (const node of world.nodes) {
    if (isHittable && !isHittable(node)) continue;
    const screen = worldToScreen(camera, viewportWidth, viewportHeight, node.x, node.y);
    const effRadius = radiusForKind(node.kind, tokens) * camera.scale.value + 5;
    const distance = Math.hypot(screenX - screen.x, screenY - screen.y);
    if (distance <= effRadius && distance < bestDistance) {
      bestId = node.id;
      bestDistance = distance;
    }
  }
  return bestId;
}

/**
 * FIX (QA first-light pass, blocker 2 — "real-data density breakdown"): the
 * tight bounding-box fit (`fitWorldTarget`) is also what `overviewScaleRef`
 * feeds into `model/altitude.ts`'s `farHigh`/`farLow` as the "100%" scale —
 * `farHigh = overviewScale * 0.92`. Starting the camera exactly AT that same
 * scale means `cameraScale` is always ~8% above `farHigh`, so `farT` (and
 * therefore every zoom-gated label/shape) reads as "circuit"/near-field on
 * every load, for every dataset — verified against the dogfood vault (290
 * renderable nodes): capability labels all fired at once ("label soup") since
 * their absolute zoom-in threshold (`labels.ts`: `smoothstep(0.75, 1.02, …)`)
 * was already satisfied by the initial fit scale (~0.918).
 *
 * `.claude/rules/design.md`'s overview-first charter ("level 0 = project +
 * domain + hub 만") wants the *opposite* default. Rather than inventing a new
 * tuning constant, this reuses the already-existing
 * `--topology-v2-altitude-far-low-ratio` token — the same ratio that defines
 * "pure constellation" — as the initial/rest camera scale, so the passive
 * default naturally lands in the simplified end of the already-built
 * continuous farT/label-alpha system. The tight fit itself is unchanged and
 * still used for `overviewScaleRef` (the altitude band's own 100% anchor).
 */
export function computeOverviewCameraTarget(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  viewportWidth: number,
  viewportHeight: number,
  tokens: Pick<TopologyV2Tokens, "cameraScaleMax" | "cameraScaleMin" | "altitudeFarLowRatio">,
): CameraTarget {
  const fit = fitWorldTarget(bounds, viewportWidth, viewportHeight, tokens.cameraScaleMax, tokens.cameraScaleMin);
  return {
    tx: fit.tx,
    ty: fit.ty,
    tscale: Math.max(tokens.cameraScaleMin, fit.tscale * tokens.altitudeFarLowRatio),
  };
}

/**
 * Camera target for the current focus state — the full-graph overview fit
 * when `focusedSlug` is `null`, or the clicked node + its 1-hop ego bbox
 * (`--topology-v2-focus-bbox-margin`/`-focus-fit-max-scale`) otherwise
 * (`docs/TOPOLOGY-V2-DESIGN.md` §3.2 "카메라가 노드+1-hop 이웃 bbox 로 스프링
 * 다이브"). `null` only if `focusedSlug` doesn't resolve to a known node.
 */
export function computeFocusCameraTarget(
  world: TopologyWorld,
  tokens: TopologyV2Tokens,
  viewportWidth: number,
  viewportHeight: number,
  focusedSlug: string | null,
): CameraTarget | null {
  if (focusedSlug === null) {
    return computeOverviewCameraTarget(world.bounds, viewportWidth, viewportHeight, tokens);
  }
  const focusNode = world.nodeById.get(focusedSlug);
  if (!focusNode) return null;

  const neighborIds = world.neighborMap.get(focusedSlug) ?? new Set<string>();
  const egoNodes: WorldNode[] = [focusNode];
  for (const id of neighborIds) {
    const neighbor = world.nodeById.get(id);
    if (neighbor) egoNodes.push(neighbor);
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of egoNodes) {
    const r = radiusForKind(n.kind, tokens);
    minX = Math.min(minX, n.x - r);
    maxX = Math.max(maxX, n.x + r);
    minY = Math.min(minY, n.y - r);
    maxY = Math.max(maxY, n.y + r);
  }
  const margin = tokens.focusBboxMargin;
  return fitWorldTarget(
    { minX: minX - margin, minY: minY - margin, maxX: maxX + margin, maxY: maxY + margin },
    viewportWidth,
    viewportHeight,
    tokens.focusFitMaxScale,
    tokens.cameraScaleMin,
  );
}
