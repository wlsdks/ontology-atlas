import type { FlowMarksInput } from "../flow-marks";
import { crossesBox } from "../label-marks";
import { domainOfEnd, type DialLink } from "../links";
import type { Point } from "../types";
import { quadAt, trimmedPiece } from "../flow/geometry";
import { localRelationControl } from "../flow/local-control";
import { branchPortFraction } from "./ports";

export interface BranchEnd { p: Point; r: number }
export interface BranchCurve {
  from: string; to: string; count: number;
  p0: Point; c: Point; p1: Point;
  piece: [Point, Point, Point];
  line: Point[];
}
export type BranchRouter = (link: DialLink, a: BranchEnd, b: BranchEnd) => readonly BranchCurve[];

function samplePiece(piece: readonly [Point, Point, Point] | null): Point[] | null {
  return piece ? Array.from({ length: 17 }, (_, k) => quadAt(...piece, k / 16)) : null;
}

// Cache only this frame: name boxes, animation endpoints and camera can all change.
export function createBranchRouter(input: FlowMarksInput, control: (link: DialLink, a: BranchEnd, b: BranchEnd) => Point): BranchRouter {
  const cache = new Map<string, BranchCurve[]>();
  return (l, a, b) => {
    const key = `${l.key}|${l.uv}|${l.vu}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const curves: BranchCurve[] = [];
    const base = control(l, a, b);
    const boundary = (id: string, other: string, end: BranchEnd, toward: Point, turn = false): Point => {
      const box = input.endBox?.(id);
      const cluster = input.scene.clusterByDomain.get(id);
      const otherCluster = input.scene.clusterByDomain.get(domainOfEnd(input.model, other));
      if (box && cluster && cluster.domainId !== otherCluster?.domainId && cluster.branchPair === otherCluster?.branchPair) {
        const fraction = branchPortFraction(input, id, other);
        const y = turn && toward.y < box.minY ? box.minY : turn && toward.y > box.maxY ? box.maxY : box.minY + (box.maxY - box.minY) * fraction;
        return { x: cluster.branchSide === 1 ? box.minX : box.maxX, y };
      }
      const dx = toward.x - end.p.x;
      const dy = toward.y - end.p.y;
      const t = box ? Math.min((box.maxX - box.minX) / 2 / Math.max(1e-6, Math.abs(dx)), (box.maxY - box.minY) / 2 / Math.max(1e-6, Math.abs(dy))) : end.r / Math.max(1, Math.hypot(dx, dy));
      return { x: end.p.x + dx * t, y: end.p.y + dy * t };
    };
    const run = (from: string, to: string, start: BranchEnd, end: BranchEnd, count: number, offset: number) => {
      const dx = end.p.x - start.p.x;
      const dy = end.p.y - start.p.y;
      const len = Math.max(1, Math.hypot(dx, dy));
      const original = { x: base.x - dy / len * offset, y: base.y + dx / len * offset };
      const local = localRelationControl(start.p, end.p, base);
      let c = { x: local.x - dy / len * offset, y: local.y + dx / len * offset };
      let turn = false;
      if (input.avoidTexts?.length) {
        const mid = { x: (start.p.x + end.p.x) / 2, y: (start.p.y + end.p.y) / 2 };
        const free = input.freeRect;
        const turnX = (id: string, other: string, endpoint: BranchEnd) => {
          const side = input.scene.clusterByDomain.get(id)?.branchSide;
          const direction = side ? -side : Math.sign(mid.x - endpoint.p.x);
          return boundary(id, other, endpoint, c).x + direction * 8;
        };
        const startX = turnX(from, to, start);
        const endX = turnX(to, from, end);
        const above = Math.min(start.p.y, end.p.y) - input.tokens.ledgerGapPx * 3;
        const below = Math.max(start.p.y, end.p.y) + input.tokens.ledgerGapPx * 3;
        const basic = [original,
          { x: c.x, y: free.minY + 8 }, { x: c.x, y: free.maxY - 8 },
          { x: free.minX + 8, y: mid.y }, { x: free.maxX - 8, y: mid.y },
          { x: mid.x, y: free.minY + 8 }, { x: mid.x, y: free.maxY - 8 },
        ];
        const turning = [c, ...basic,
          { x: startX, y: free.minY + 8 }, { x: startX, y: free.maxY - 8 },
          { x: endX, y: free.minY + 8 }, { x: endX, y: free.maxY - 8 },
          ...[c.x, startX, endX].flatMap((x) => [{ x, y: above }, { x, y: below }]),
        ];
        const hits = (control: Point, ceiling = Infinity, edge = false) => {
          const piece = trimmedPiece(boundary(from, to, start, control, edge), control, boundary(to, from, end, control, edge), input.tokens.flowTrimStartPx, input.tokens.flowTrimEndPx);
          const line = samplePiece(piece);
          if (!line) return Infinity;
          let count = 0;
          for (const box of input.avoidTexts!) {
            if (crossesBox([line], box)) count += 1;
            if (count >= ceiling) break;
          }
          return count;
        };
        let best = hits(c);
        for (const { candidate, edge } of [...basic.map((candidate) => ({ candidate, edge: false })), ...turning.map((candidate) => ({ candidate, edge: true }))]) {
          if (best === 0) break;
          const fromCluster = input.scene.clusterByDomain.get(from);
          const toCluster = input.scene.clusterByDomain.get(to);
          if (fromCluster && toCluster && fromCluster.branchPair === toCluster.branchPair
            && [fromCluster, toCluster].some((cluster) => (candidate.x - (input.nodeScreen(cluster.domainId) ?? input.toScreen(cluster.chip.x, cluster.chip.y)).x) * (cluster.branchSide ?? 1) >= 0)) continue;
          const count = hits(candidate, best, edge);
          if (count < best) { best = count; c = candidate; turn = edge; }
        }
      }
      const p0 = boundary(from, to, start, c, turn);
      const p1 = boundary(to, from, end, c, turn);
      const piece = trimmedPiece(p0, c, p1, input.tokens.flowTrimStartPx, input.tokens.flowTrimEndPx);
      const line = samplePiece(piece);
      if (piece && line) curves.push({ from, to, count, p0, c, p1, piece, line });
    };
    const offset = l.uv > 0 && l.vu > 0 ? input.tokens.flowSplitPx * 3 : 0;
    if (l.uv > 0 || l.relatesOnly) run(l.u, l.v, a, b, l.uv, offset);
    if (l.vu > 0) run(l.v, l.u, b, a, l.vu, offset);
    cache.set(key, curves);
    return curves;
  };
}
