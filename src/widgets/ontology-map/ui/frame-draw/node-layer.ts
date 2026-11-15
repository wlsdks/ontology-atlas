import type { ReservedBox } from "../../render/label-layout";
import { drawnScreenRadiusByIdReused } from "./frame-state";
import type { FrameInputs } from "./frame-begin";

// `nodeLayer` may wrap the context; every later pass paints through the wrapped one.
export function beginNodeLayer(frame: FrameInputs) {
  const ctx = frame.nodeLayer?.(frame.ctx) ?? frame.ctx;
  drawnScreenRadiusByIdReused.clear();
  const nodeDiscReservations: ReservedBox[] = [];
  return { ctx, drawnScreenRadiusById: drawnScreenRadiusByIdReused, nodeDiscReservations };
}

export type NodeLayer = Readonly<ReturnType<typeof beginNodeLayer>>;
