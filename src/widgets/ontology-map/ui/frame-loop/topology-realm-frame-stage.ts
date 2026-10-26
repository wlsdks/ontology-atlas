import type { DialWorld } from '../../dial/types';
import type { CameraAxes } from "../../engine/camera";
import type { ClusterChip } from "../../model/layout/density-gate";
import type { DomeRuntime } from "../../model/dome-view/runtime";
import { parseClusterMoreChipId } from "../../model/visibility/focus-state";
import { computeVisibleWardingRadius } from "../../model/realm/realm";
import type { DepthParallaxOffset } from "../../model/realm/realm-depth-parallax";
import {
  isRealmOutsideCulled,
  REALM_OUTSIDE_FLING_MS,
  REALM_EXIT_OUTSIDE_RETURN_DELAY_MS,
  REALM_EXIT_OUTSIDE_RETURN_MS,
  REALM_WARDING_DRAW_DELAY_MS,
  realmDustParallaxFactor,
  realmOutsideReturnAlpha,
  realmWardingDrawProgress,
  realmWardingEraseProgress,
  type RealmTransitionState,
} from "../../model/realm/realm-transition";
import {
  initWardingFit,
  stepWardingFit,
  type WardingFitState,
} from "../../model/realm/realm-warding-fit";
import { orbitButtonRect } from "../../render/cluster-chips";
import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import { worldToScreen } from "../camera/topology-camera-math";
import type { RealmRuntimeData } from "../world/topology-realm-runtime";
import { radiusForKind, type TopologyWorld } from "../world/topology-world";

type SourceRef<T> = { current: T; };
type RealmTierKind = "project" | "domain" | "capability" | "element";

export interface RealmFrameResult {
  realmDial: DialWorld | null;
  frameClusteredIds: ReadonlySet<string>;
  frameChips: readonly ClusterChip[];
  realmWarding: {
    centerX: number;
    centerY: number;
    radius: number;
    drawProgress: number;
    caption: string | null;
  } | null;
  realmTierKinds: ReadonlyMap<string, RealmTierKind> | null;
  realmDustParallax: number;
  realmDepthById: ReadonlyMap<string, number> | null;
  realmDepthParallax: {
    depth2: DepthParallaxOffset;
    depth3: DepthParallaxOffset;
  } | null;
  realmOutsideReturnAlphaById: Map<string, number> | null;
}

export interface RealmFrameStageSources {
  realmTransitionRef: SourceRef<RealmTransitionState>;
  realmDataRef: SourceRef<RealmRuntimeData | null>;
  reducedMotionRef: SourceRef<boolean>;
  realmParallaxRef: SourceRef<{
    depthById: ReadonlyMap<string, number>;
    depth2: DepthParallaxOffset;
    depth3: DepthParallaxOffset;
  } | null>;
  wardingFitRef: SourceRef<WardingFitState | null>;
  realmEnterButtonElRef: SourceRef<HTMLButtonElement | null>;
  focusedSlugRef: SourceRef<string | null>;
  onEnterRealmRef: SourceRef<((slug: string) => void) | undefined>;
  realmEnterTargetRef: SourceRef<string | null>;
  domeRuntimeRef: SourceRef<DomeRuntime | null>;
  getRealmCaption: () => string | null;
}

export function createRealmFrameStage(sources: RealmFrameStageSources) {
  const {
    realmTransitionRef,
    realmDataRef,
    reducedMotionRef,
    realmParallaxRef,
    wardingFitRef,
    realmEnterButtonElRef,
    focusedSlugRef,
    onEnterRealmRef,
    realmEnterTargetRef,
    domeRuntimeRef,
    getRealmCaption,
  } = sources;
  const result: RealmFrameResult = {
    realmDial: null,
    frameClusteredIds: new Set(),
    frameChips: [],
    realmWarding: null,
    realmTierKinds: null,
    realmDustParallax: 0,
    realmDepthById: null,
    realmDepthParallax: null,
    realmOutsideReturnAlphaById: null,
  };

  return function runRealmFrameStage(
    now: number,
    dt: number,
    tokens: OntologyMapTokens,
    world: TopologyWorld,
    camera: CameraAxes,
    width: number,
    height: number,
    effectiveExpanded: ReadonlySet<string>,
    frameClusteredIdsInput: ReadonlySet<string>,
    frameChipsInput: readonly ClusterChip[],
  ): RealmFrameResult {
    let realmDial: DialWorld | null = null;
    let frameClusteredIds = frameClusteredIdsInput;
    let frameChips = frameChipsInput;
    // --- Realm: hard-cull the outside nodes once the fling completes, and
    // compute the warding ring parameters. ---
    const realmState = realmTransitionRef.current;
    const realmData = realmDataRef.current;
    let realmWarding: { centerX: number; centerY: number; radius: number; drawProgress: number; caption: string | null; } | null = null;
    let realmTierKinds: ReadonlyMap<string, "project" | "domain" | "capability" | "element"> | null = null;
    let realmDustParallax = 0;
    // Depth presentation: sharpness (entering and active) comes from
    // depthById, parallax (active only) from the band offsets. The step above
    // filled the parallax ref only when active and non-trivial.
    let realmDepthById: ReadonlyMap<string, number> | null = null;
    let realmDepthParallax: { depth2: DepthParallaxOffset; depth3: DepthParallaxOffset; } | null = null;
    // Materialize alpha for outside nodes returning during an exit. Filled
    // only while exiting and not under reduced-motion, where the exit effect
    // has already snapped home and never reaches this frame.
    let realmOutsideReturnAlphaById: Map<string, number> | null = null;
    if (
      realmData &&
      (realmState.phase === "entering" || realmState.phase === "active" || realmState.phase === "exiting")
    ) {
      const exiting = realmState.phase === "exiting";
      if (realmData.flat && realmData.dial) {
        realmDial = exiting || (realmState.phase === "entering" && now - realmState.startMs < REALM_OUTSIDE_FLING_MS) ? (world.dial ?? null) : realmData.dial;
      }
      realmTierKinds = realmData.tierKindById;
      realmDepthById = realmData.depthById;
      // Parallax bands are active-only: during an exit the world is folding
      // up, so they do not apply.
      realmDepthParallax = !realmData.flat && !exiting && realmParallaxRef.current
        ? { depth2: realmParallaxRef.current.depth2, depth3: realmParallaxRef.current.depth3 }
        : null;
      if (realmState.phase === "entering" && !reducedMotionRef.current) {
        realmDustParallax = realmDustParallaxFactor(now - realmState.startMs);
      }
      // Fill the materialize alpha for each returning outside node. The
      // coordinate step above uses the same
      // `elapsed - REALM_EXIT_OUTSIDE_RETURN_DELAY_MS`, so reusing it here
      // keeps position and alpha in agreement within every frame.
      if (exiting && !reducedMotionRef.current) {
        const elapsed = now - realmState.startMs - REALM_EXIT_OUTSIDE_RETURN_DELAY_MS;
        const alphaMap = new Map<string, number>();
        for (const id of realmData.outsideFrom.keys()) {
          alphaMap.set(id, realmOutsideReturnAlpha(elapsed, REALM_EXIT_OUTSIDE_RETURN_MS, realmData.exitSnapshot?.outsideAlpha));
        }
        realmOutsideReturnAlphaById = alphaMap;
      }
      // Outside nodes are returning during an exit, so they are not culled
      // (`isRealmOutsideCulled` is false while exiting). The hard cull
      // applies only in entering/active, once the fling completes.
      if (isRealmOutsideCulled(realmState, now)) {
        frameClusteredIds = new Set<string>([...frameClusteredIds, ...realmData.outsideIds]);
      }
      // Density chips belonging to parents outside the realm do not exist
      // inside it either: culling the nodes but keeping the chips leaves
      // chips floating in empty space (seen on screen). "+N more" chips carry
      // a synthetic id, so it is resolved back to the real parent for the
      // membership test — batch chips from inside parents stay, those from
      // outside parents are culled with them.
      frameChips = frameChips.filter((ch) =>
        ch.parentId !== realmData.rootId && realmData.memberIds.has(parseClusterMoreChipId(ch.parentId) ?? ch.parentId),
      );
      // The warding radius is refitted to the reach of this frame's
      // **visible** members, excluding anything collapsed by the density gate
      // or by ego. The static `realmData.wardingRadius` counted collapsed
      // phyllotaxis children too and drew a circle far larger than the
      // visible world. Measuring against `insideTargets` (the settled
      // coordinates) keeps the target steady through the entry FLIP, and it
      // eases over 240 ms only when the visible set changes.
      if (!realmData.flat) {
      const wc = realmData.wardingCenter;
      const reaches: number[] = [];
      for (const id of realmData.memberIds) {
        if (frameClusteredIds.has(id)) continue;
        const t = realmData.insideTargets.get(id);
        if (!t) continue;
        const mn = world.nodeById.get(id);
        const nr = mn ? radiusForKind(mn.kind, tokens) * mn.magnitudeScale : 0;
        reaches.push(Math.hypot(t.x - wc.x, t.y - wc.y) + nr);
      }
      const targetWardingRadius = computeVisibleWardingRadius(reaches);
      const nextFit = stepWardingFit(
        wardingFitRef.current ?? initWardingFit(targetWardingRadius),
        targetWardingRadius,
        now,
        reducedMotionRef.current,
      );
      wardingFitRef.current = nextFit;
      realmWarding = {
        centerX: realmData.wardingCenter.x,
        centerY: realmData.wardingCenter.y,
        radius: nextFit.value,
        // An exit erases the warding ring in reverse (1 → 0); an entry draws
        // it after a delay (0 → 1).
        drawProgress: exiting
          ? realmWardingEraseProgress(now - realmState.startMs, undefined, realmData.exitSnapshot?.wardingProgress)
          : realmWardingDrawProgress(now - realmState.startMs - REALM_WARDING_DRAW_DELAY_MS),
        // Census engraving, so the ring says what it is the boundary of.
        caption: getRealmCaption(),
      };
      }
    }

    // Orbit enter button sits due east of the focused ring; bearings must stay distinct from the expand
    // badge (`render/cluster-chips.ts`, locked by `expand-settings.contract.test.ts`).
    {
      const btn = realmEnterButtonElRef.current;
      if (btn) {
        const fid = focusedSlugRef.current;
        const node = fid ? world.nodeById.get(fid) : undefined;
        const hasChildren = fid ? (world.childrenByParent.get(fid)?.length ?? 0) > 0 : false;
        const engaged = realmState.phase !== "idle";
        const eligible = Boolean(fid && node && hasChildren && !engaged && onEnterRealmRef.current);
        // The enter button fades via opacity + pointer-events (a 150 ms CSS
        // transition in the OntologyMap JSX) rather than hard-toggling
        // display, which would pop it in and out. Its transform keeps
        // updating every frame while the focused node exists, so it follows
        // the camera even mid-fade-out instead of freezing in place.
        if (node) {
          // In 3D the button follows the node's drawn ring position and
          // perspective scale too.
          const dFrame = domeRuntimeRef.current?.frame.get(node.id);
          const rr = radiusForKind(node.kind, tokens) * node.magnitudeScale * (dFrame?.s ?? 1) * camera.scale.value;
          const s = worldToScreen(camera, width, height, node.x + (dFrame?.dx ?? 0), node.y + (dFrame?.dy ?? 0));
          // Single source for the position — the expand control's rect
          // computation reads the same function.
          const orbit = orbitButtonRect(s.x, s.y, rr);
          const bx = orbit.x + orbit.w / 2;
          const by = orbit.y + orbit.h / 2;
          btn.style.transform = `translate(-50%, -50%) translate(${bx}px, ${by}px)`;
        }
        // Toggle the tab stop with visibility: `opacity: 0` stays focusable, so focus would land on an
        // invisible button.
        if (eligible) {
          realmEnterTargetRef.current = fid;
          btn.style.opacity = "1";
          btn.style.pointerEvents = "auto";
          btn.tabIndex = 0;
          btn.removeAttribute("aria-hidden");
        } else {
          realmEnterTargetRef.current = null;
          btn.style.opacity = "0";
          btn.style.pointerEvents = "none";
          btn.tabIndex = -1;
          btn.setAttribute("aria-hidden", "true");
        }
      }
    }


    result.realmDial = realmDial;
    result.frameClusteredIds = frameClusteredIds;
    result.frameChips = frameChips;
    result.realmWarding = realmWarding;
    result.realmTierKinds = realmTierKinds;
    result.realmDustParallax = realmDustParallax;
    result.realmDepthById = realmDepthById;
    result.realmDepthParallax = realmDepthParallax;
    result.realmOutsideReturnAlphaById = realmOutsideReturnAlphaById;
    return result;
  };
}
