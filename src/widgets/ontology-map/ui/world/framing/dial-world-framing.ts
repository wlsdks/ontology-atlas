import type { DialTokens, DialWorld } from "../../../dial/types";
import { resolveDialAttention } from "../../../dial/dial-model";

export type DialBearing = { dial?: DialWorld | null;
};

const DIAL_OVERVIEW_SCALE_FLOOR = 0.01;

export function dialOverviewFit(world: DialBearing): { padPx: DialWorld["overviewPadPx"]; scaleFloor: number; labelBottomAllowance?: number;
} | undefined {
  return world.dial ? { padPx: world.dial.overviewPadPx, scaleFloor: DIAL_OVERVIEW_SCALE_FLOOR, ...(world.dial.scene.branches ? { labelBottomAllowance: 0 } : {}) } : undefined;
}

export interface DialFocusFrame {
  ids: ReadonlySet<string>;
  nameScale: number;
}

export function dialFocusFrame(world: DialBearing, focusId: string, tokens: Pick<DialTokens, "pitch" | "capName">): DialFocusFrame | undefined {
  const model = world.dial?.model;
  if (!model) return undefined;
  if (!model.capabilityById.has(focusId)) {
    if (focusId === model.projectId || model.domainById.has(focusId) || !model.domainOf.has(focusId) || !world.dial?.scene.positions.has(focusId)) return undefined;
    return { ids: new Set([focusId]), nameScale: tokens.capName / tokens.pitch };
  }
  const a = resolveDialAttention(model, null, focusId);
  return { ids: new Set([focusId, ...a.needsCaps, ...a.usedByCaps, ...a.relatesCaps]), nameScale: tokens.capName / tokens.pitch };
}
