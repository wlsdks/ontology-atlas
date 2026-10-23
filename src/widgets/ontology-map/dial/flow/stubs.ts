import { flowHeadSize } from "./arrow-size";
import type { FlowMarksInput } from "../flow-marks";
import { stubText } from "../far-counts";
import type { DialLink } from "../links";
import type { Box, DialTokens, Point } from "../types";

const STUB_SHORT = 0.74;
export interface Stub {
  link: DialLink;
  near: { p: Point; r: number };
  nearId: string;
  farId: string;
  farP: Point;
  angle: number;
  presence: number;
  counts?: { needs: number; used: number };
}

export interface StubPlan {
  st: Stub;
  start: Point;
  end: Point;
  cos: number;
  sin: number;
  needs: number;
  used: number;
  text: string;
  startX: number;
  ty: number;
  box: Box;
}

function stubLength(tokens: DialTokens, free: Box): number {
  return Math.max(tokens.stubMinPx, Math.min(tokens.stubMaxPx, tokens.stubFreeShare * Math.min(free.maxX - free.minX, free.maxY - free.minY)));
}

function minimumReach(tokens: DialTokens, st: Stub): number {
  return st.near.r + 4 + flowHeadSize(tokens, tokens.flowFocusMax, tokens.flowFocusMax, true);
}

export function fanAngles(angles: readonly number[], gapDeg: number): number[] {
  const order = angles.map((a, i) => ({ a, i })).sort((x, y) => x.a - y.a || x.i - y.i);
  const minGap = (gapDeg * Math.PI) / 180;
  for (let k = 1; k < order.length; k += 1) if (order[k]!.a - order[k - 1]!.a < minGap) order[k]!.a = order[k - 1]!.a + minGap;
  const out = new Array<number>(angles.length);
  for (const o of order) out[o.i] = o.a;
  return out;
}

export function planStubs(input: FlowMarksInput, stubs: Stub[], nameFont: string, nameFontPx: number): StubPlan[] {
  const { tokens, model } = input;
  const length = stubLength(tokens, input.freeRect);
  const byNear = new Map<string, Stub[]>();
  for (const st of stubs) {
    const list = byNear.get(st.nearId);
    if (list) list.push(st);
    else byNear.set(st.nearId, [st]);
  }
  const plans: StubPlan[] = [];
  for (const list of byNear.values()) {
    list.sort((x, y) => x.angle - y.angle || (x.farId < y.farId ? -1 : 1));
    const angles = fanAngles(list.map((s) => s.angle), tokens.stubGapDeg);
    list.forEach((st, k) => {
      const reach = Math.max(minimumReach(tokens, st), length * (k % 2 === 0 ? 1 : STUB_SHORT));
      const cos = Math.cos(angles[k]!);
      const sin = Math.sin(angles[k]!);
      const start = { x: st.near.p.x + cos * (st.near.r + 4), y: st.near.p.y + sin * (st.near.r + 4) };
      const end = { x: st.near.p.x + cos * reach, y: st.near.p.y + sin * reach };
      const nearIsU = st.nearId === st.link.u;
      const needs = st.counts?.needs ?? (nearIsU ? st.link.uv : st.link.vu);
      const used = st.counts?.used ?? (nearIsU ? st.link.vu : st.link.uv);
      const name = model.capabilityById.get(st.farId)?.label ?? model.domainById.get(st.farId)?.label ?? st.farId;
      const text = stubText(name, needs, used);
      const align: CanvasTextAlign = cos > 0.25 ? "left" : cos < -0.25 ? "right" : "center";
      const tx = end.x + cos * 8;
      const ty = end.y + sin * 10;
      const width = input.measureText(text, nameFont);
      const startX = align === "left" ? tx : align === "right" ? tx - width : tx - width / 2;
      const box = { minX: startX - 2, maxX: startX + width + 2, minY: ty - nameFontPx * 0.7, maxY: ty + nameFontPx * 0.7 };
      plans.push({ st, start, end, cos, sin, needs, used, text, startX, ty, box });
    });
  }
  return plans.sort((x, y) => Number(y.st.link.attended) - Number(x.st.link.attended) || y.st.link.total - x.st.link.total || (x.st.link.key < y.st.link.key ? -1 : x.st.link.key > y.st.link.key ? 1 : x.st.nearId < y.st.nearId ? -1 : 1));
}


export function* stubCandidates(input: FlowMarksInput, original: StubPlan): Generator<StubPlan> {
  yield original;
  if (!original.st.link.attended) return;
  const origin = original.st.near.p;
  const angle = Math.atan2(original.sin, original.cos);
  const reach = Math.hypot(original.end.x - origin.x, original.end.y - origin.y);
  const width = original.box.maxX - original.box.minX;
  const halfHeight = (original.box.maxY - original.box.minY) / 2;
  const offsets = [0, ...[15, 30, 45, 60, 75, 90, 120, 150].flatMap((degrees) => [degrees, -degrees]), 180];
  for (const degrees of offsets) for (const factor of [1, STUB_SHORT, 1.5]) {
    if (degrees === 0 && factor === 1) continue;
    const cos = Math.cos(angle + degrees * Math.PI / 180);
    const sin = Math.sin(angle + degrees * Math.PI / 180);
    const start = { x: origin.x + cos * (original.st.near.r + 4), y: origin.y + sin * (original.st.near.r + 4) };
    const distance = Math.max(minimumReach(input.tokens, original.st), reach * factor);
    const end = { x: origin.x + cos * distance, y: origin.y + sin * distance };
    const tx = end.x + cos * 8;
    const ty = end.y + sin * 10;
    const left = cos > 0.25 ? tx - 2 : cos < -0.25 ? tx - width + 2 : tx - width / 2;
    const box = { minX: left, maxX: left + width, minY: ty - halfHeight, maxY: ty + halfHeight };
    yield { ...original, start, end, cos, sin, box, startX: left + 2, ty };
  }
}
