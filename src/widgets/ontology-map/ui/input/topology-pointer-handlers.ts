import { readOntologyMapTokensOrNull } from "../../tokens/topology-read-tokens";
import { hitTestEdges } from "./topology-edge-hit";
import { createPointerContext } from "./topology-pointer-context";
import { createPointerHitTests } from "./topology-pointer-hit-tests";
import { createPointerMoveHandler } from "./topology-pointer-move";
import { createPointerPressHandlers } from "./topology-pointer-press";
import { createPointerReleaseHandlers } from "./topology-pointer-release";
import type { PointerHandlerRefs, TopologyPointerHandlers } from "./topology-pointer-types";
import { createPointerZoomHandlers } from "./topology-pointer-zoom";

/** Builds the pointer/wheel handlers, closing over the hook's refs (cheap — plain closures, no hook rules to satisfy). */
export function createTopologyPointerHandlers(refs: PointerHandlerRefs): TopologyPointerHandlers {
  const ctx = createPointerContext(refs);
  const hits = createPointerHitTests(ctx);
  const { handlePointerUp, handlePointerCancel, handlePointerLeave } = createPointerReleaseHandlers(ctx, hits);
  const { handlePointerDown, handleContextMenu } = createPointerPressHandlers(ctx, hits, handlePointerCancel);
  const handlePointerMove = createPointerMoveHandler(ctx, hits, handlePointerUp);
  const { handleWheel, handleGesturePinch } = createPointerZoomHandlers(ctx);
  const { buildEdgeCandidates, hitVisibleNode } = hits;

  /**
   * Exposes the app's own edge decision (`buildEdgeCandidates` plus `hitTestEdges`) so external
   * instruments use the same formula as the app.
   */
  const probeEdgeAt = (screenX: number, screenY: number, thresholdPx = 7) => hitTestEdges(buildEdgeCandidates(), screenX, screenY, thresholdPx);
  /** The node a press at `(screenX, screenY)` would grab: the press's own hit test. */
  const probeNodeAt = (screenX: number, screenY: number) => {
    const world = ctx.worldRef.current;
    return world ? hitVisibleNode(world, ctx.cameraRef.current, readOntologyMapTokensOrNull(), screenX, screenY) : null;
  };
  return { handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel, handlePointerLeave, handleWheel, handleGesturePinch, handleContextMenu, probeEdgeAt, probeNodeAt };
}
