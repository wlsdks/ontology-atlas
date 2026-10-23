import { localRelationControl } from "../flow/local-control";
import type { DialFrameMarks } from "../frame/marks";
import type { Box, DialFrameResult, Point } from "../types";

interface Curve { a: Point; b: Point; control: Point }

export function clipBranchRelation(frame: DialFrameResult | null, from: string, to: string, curve: Curve): Curve {
  if (!frame?.contextOnly) return curve;
  const blocks = (frame.marks as DialFrameMarks).blocks ?? [];
  const boxFor = (id: string) => blocks.find((block) => block.id === id && block.alpha > 0.5)?.box;
  const { a, b } = curve;
  const c = localRelationControl(a, b, curve.control);
  const point = (t: number) => ({ x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t * t * b.x, y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t * t * b.y });
  const inside = (p: Point, box: Box) => p.x >= box.minX - 6 && p.x <= box.maxX + 6 && p.y >= box.minY - 6 && p.y <= box.maxY + 6;
  const exit = (box: Box | undefined, reverse: boolean) => {
    if (!box || !inside(point(reverse ? 1 : 0), box)) return reverse ? 1 : 0;
    let lo = 0;
    let hi = 0.5;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (inside(point(reverse ? 1 - mid : mid), box)) lo = mid;
      else hi = mid;
    }
    return reverse ? 1 - hi : hi;
  };
  const t0 = exit(boxFor(from), false);
  const t1 = exit(boxFor(to), true);
  return {
    a: point(t0), b: point(t1),
    control: {
      x: (1 - t0) * (1 - t1) * a.x + ((1 - t0) * t1 + t0 * (1 - t1)) * c.x + t0 * t1 * b.x,
      y: (1 - t0) * (1 - t1) * a.y + ((1 - t0) * t1 + t0 * (1 - t1)) * c.y + t0 * t1 * b.y,
    },
  };
}
