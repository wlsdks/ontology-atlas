import { describe, expect, it } from "vitest";
import type { FlowMarksInput } from "../flow-marks";
import type { DialLink } from "../links";
import { crossesBox } from "../label-marks";
import { createBranchRouter } from "./routes";

const poses = [{"width":1920,"points":{"capability:repo-structure-analysis":{"x":625.7954929577464,"y":406.79549295774643},"capability:construction-qualification-gate":{"x":920.2045070422536,"y":554},"capability:import-dependency-inference":{"x":920.2045070422536,"y":701.2045070422536}},"free":{"minX":0,"minY":148,"maxX":1468,"maxY":984},"boxes":[{"minX":1157.4135211267605,"maxX":1220.4760211267605,"minY":609.6022535211268,"maxY":629.6022535211268},{"minX":1157.4135211267605,"maxX":1230.9960406580105,"minY":632.1022535211268,"maxY":647.1022535211268},{"minX":802.1849757922536,"maxX":897.7045070422536,"minY":397.79549295774643,"maxY":415.79549295774643},{"minX":790.0853664172536,"maxX":897.7045070422536,"minY":471.3977464788732,"maxY":489.3977464788732},{"minX":802.1849757922536,"maxX":897.7045070422536,"minY":545,"maxY":563},{"minX":790.0853664172536,"maxX":897.7045070422536,"minY":618.6022535211268,"maxY":636.6022535211268},{"minX":790.0853664172536,"maxX":897.7045070422536,"minY":692.2045070422536,"maxY":710.2045070422536},{"minX":790.0853664172536,"maxX":897.7045070422536,"minY":765.8067605633803,"maxY":783.8067605633803},{"minX":497.77596170774643,"maxX":593.2954929577464,"minY":397.79549295774643,"maxY":415.79549295774643},{"minX":804.5775539172536,"maxX":897.7045070422536,"minY":839.4090140845071,"maxY":857.4090140845071},{"minX":1249.3693925509117,"maxX":1330.7937089571617,"minY":529.0750790733019,"maxY":544.475079073302}]},{"width":2560,"points":{"capability:repo-structure-analysis":{"x":852.7371126760563,"y":517.4321126760564},"capability:construction-qualification-gate":{"x":1285.8728873239436,"y":734},"capability:import-dependency-inference":{"x":1285.8728873239436,"y":950.5678873239436}},"free":{"minX":0,"minY":148,"maxX":2060.61,"maxY":1344},"boxes":[{"minX":1661.8086619718308,"maxX":1724.8711619718308,"minY":824.2839436619719,"maxY":844.2839436619719},{"minX":1661.8086619718308,"maxX":1735.3911815030808,"minY":846.7839436619719,"maxY":861.7839436619719},{"minX":1167.8533560739436,"maxX":1263.3728873239436,"minY":508.43211267605636,"maxY":526.4321126760564},{"minX":1155.7537466989436,"maxX":1263.3728873239436,"minY":616.7160563380282,"maxY":634.7160563380282},{"minX":1017.0941296214789,"maxX":1137.017957746479,"minY":589.6450704225352,"maxY":607.6450704225352},{"minX":1167.8533560739436,"maxX":1263.3728873239436,"minY":725,"maxY":743},{"minX":1041.293348371479,"maxX":1137.017957746479,"minY":697.9290140845071,"maxY":715.9290140845071},{"minX":1155.7537466989436,"maxX":1263.3728873239436,"minY":833.2839436619719,"maxY":851.2839436619719},{"minX":1053.392957746479,"maxX":1137.017957746479,"minY":806.2129577464789,"maxY":824.2129577464789},{"minX":1031.682020246479,"maxX":1137.017957746479,"minY":860.3549295774648,"maxY":878.3549295774648},{"minX":1155.7537466989436,"maxX":1263.3728873239436,"minY":941.5678873239436,"maxY":959.5678873239436},{"minX":1069.006238996479,"maxX":1137.017957746479,"minY":914.4969014084506,"maxY":932.4969014084506},{"minX":1155.7537466989436,"maxX":1263.3728873239436,"minY":1049.8518309859155,"maxY":1067.8518309859155},{"minX":1041.293348371479,"maxX":1137.017957746479,"minY":1022.7808450704224,"maxY":1040.7808450704224},{"minX":1029.193738996479,"maxX":1137.017957746479,"minY":1076.9228169014084,"maxY":1094.9228169014084},{"minX":724.7175814260563,"maxX":820.2371126760563,"minY":508.43211267605636,"maxY":526.4321126760564},{"minX":608.1575737235916,"maxX":703.8821830985916,"minY":481.3611267605634,"maxY":499.3611267605634},{"minX":608.1575737235916,"maxX":703.8821830985916,"minY":535.5030985915494,"maxY":553.5030985915494},{"minX":400.5871269806339,"maxX":541.4562676056339,"minY":481.3611267605634,"maxY":499.3611267605634},{"minX":433.6320488556339,"maxX":541.4562676056339,"minY":535.5030985915494,"maxY":553.5030985915494},{"minX":263.93269586267616,"maxX":379.03035211267616,"minY":481.3611267605634,"maxY":499.3611267605634},{"minX":295.40535211267616,"maxX":379.03035211267616,"minY":535.5030985915494,"maxY":553.5030985915494},{"minX":132.9794366197184,"maxX":216.6044366197184,"minY":481.3611267605634,"maxY":499.3611267605634},{"minX":132.9794366197184,"maxX":216.6044366197184,"minY":535.5030985915494,"maxY":553.5030985915494},{"minX":1170.2459341989436,"maxX":1263.3728873239436,"minY":1158.1357746478873,"maxY":1176.1357746478873},{"minX":1359.1588646263494,"maxX":1421.5695091575994,"minY":404.5964217166418,"maxY":419.9964217166418},{"minX":1363.3075883593265,"maxX":1444.7319047655765,"minY":994.688248114469,"maxY":1010.0882481144691}]}];

describe("local relation fallbacks in observed repository-analysis poses", () => {
  for (const pose of poses) for (const target of ["capability:construction-qualification-gate", "capability:import-dependency-inference"] as const) {
    it(`${pose.width}: routes ${target} locally or defers a blocked route to named recovery`, () => {
      const from = "capability:repo-structure-analysis";
      const start = { p: pose.points[from], r: 16.5 };
      const end = { p: pose.points[target], r: 16.5 };
      const owner = "domain:code-evidence";
      const input = {
        model: { capabilityById: new Map([from, target].map(id => [id, { domainId: owner }])), flows: [] },
        scene: { clusterByDomain: new Map([[owner, { domainId: owner, branchPair: 0, branchSide: -1 }]]) },
        tokens: { flowTrimStartPx: 4, flowTrimEndPx: 5, flowSplitPx: 2, ledgerGapPx: 24 },
        freeRect: pose.free, avoidTexts: pose.boxes,
      } as unknown as FlowMarksInput;
      const link = { key: `${from}\0${target}`, u: from, v: target, uv: 2, vu: 0, total: 2, attended: true, relatesOnly: false } as DialLink;
      const router = createBranchRouter(input, () => ({ x: Math.max(start.p.x, end.p.x) + 128, y: (start.p.y + end.p.y) / 2 }));
      const curves = router(link, start, end);
      if (pose.width === 2560 && target === "capability:import-dependency-inference") {
        expect(curves).toEqual([]);
        return;
      }
      expect(curves).toHaveLength(1);
      const curve = curves[0]!;
      const dx = curve.p1.x - curve.p0.x;
      const dy = curve.p1.y - curve.p0.y;
      const length = Math.hypot(dx, dy);
      const progress = curve.line.map(point => ((point.x - curve.p0.x) * dx + (point.y - curve.p0.y) * dy) / length);
      expect(progress.slice(1).every((value, index) => value >= progress[index]!)).toBe(true);
      expect(Math.abs((curve.c.x - curve.p0.x) * -dy / length + (curve.c.y - curve.p0.y) * dx / length)).toBeLessThanOrEqual(150);
      expect(pose.boxes.some(box => crossesBox([curve.line], box))).toBe(false);
      expect(curve).toMatchObject({ from, to: target, count: 2 });
    });
  }
});
