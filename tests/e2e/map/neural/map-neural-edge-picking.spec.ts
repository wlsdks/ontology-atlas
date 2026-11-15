import { expect, test } from '@playwright/test';
import { seedFirstRunSeen } from '../../first-run-seed';
import { waitForDomeEntered, waitForMapStill } from '../../settle';

// Record the actual canvas paths, independently of __atlasMap.edges(). Neural strokes each axon in
// tapered pieces, each a piece of one quadratic, so every painted piece must lie on the curve the
// probe reports and a pointer picks.
test.use({ viewport: { width: 1440, height: 900 }, contextOptions: { reducedMotion: 'reduce' } });

test('Neural: visible dependency strokes lie on the curves a pointer selects', async ({ page }) => {
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    localStorage.setItem('atlas.appearance.view3d', 'on');
    localStorage.setItem('atlas.appearance.map-arrangement', 'coupling');
    type Curve = { ax: number; ay: number; cx: number; cy: number; bx: number; by: number };
    const host = window as unknown as { drawnCurves: Curve[] };
    host.drawnCurves = [];
    const paths = new WeakMap<CanvasRenderingContext2D, { x: number; y: number; curves: Curve[] }>();
    const proto = CanvasRenderingContext2D.prototype;
    const begin = proto.beginPath, move = proto.moveTo, quad = proto.quadraticCurveTo, stroke = proto.stroke, fill = proto.fillRect;
    const strokePlain: (this: CanvasRenderingContext2D) => void = proto.stroke;
    proto.beginPath = function () { paths.set(this, { x: 0, y: 0, curves: [] }); begin.call(this); };
    proto.moveTo = function (x, y) {
      const path = paths.get(this);
      if (path) { path.x = x; path.y = y; }
      move.call(this, x, y);
    };
    proto.quadraticCurveTo = function (cx, cy, bx, by) {
      const path = paths.get(this);
      if (path) path.curves.push({ ax: path.x, ay: path.y, cx, cy, bx, by });
      quad.call(this, cx, cy, bx, by);
    };
    proto.fillRect = function (x, y, width, height) {
      if (this.canvas.dataset.testid === 'ontology-map-canvas' && x === 0 && y === 0 && width > 100 && height > 100) host.drawnCurves = [];
      fill.call(this, x, y, width, height);
    };
    proto.stroke = function (path?: Path2D) {
      const recorded = paths.get(this);
      if (recorded && this.canvas.dataset.testid === 'ontology-map-canvas' && this.globalAlpha > 0.05) host.drawnCurves.push(...recorded.curves);
      if (path) stroke.call(this, path); else strokePlain.call(this);
    };
  });
  await page.goto('/en/topology/?synth=31&synthDeps=1&e2e=1&guides=off');
  await waitForDomeEntered(page);
  await waitForMapStill(page);
  const result = await page.evaluate(() => {
    type Curve = { ax: number; ay: number; cx: number; cy: number; bx: number; by: number };
    type Edge = { sourceId: string; targetId: string; kind: string; visible: boolean; ax: number; ay: number; bx: number; by: number; controlX: number; controlY: number };
    const host = window as unknown as { drawnCurves: Curve[]; __atlasMap: {
      edges(): Edge[]; nodes(): { x: number; y: number; radius: number; hidden: boolean }[];
      edgeAt(x: number, y: number): { sourceId: string; targetId: string } | null;
    } };
    const point = (curve: Curve, t: number) => ({
      x: (1 - t) ** 2 * curve.ax + 2 * (1 - t) * t * curve.cx + t * t * curve.bx,
      y: (1 - t) ** 2 * curve.ay + 2 * (1 - t) * t * curve.cy + t * t * curve.by,
    });
    const curveOf = (edge: Edge): Curve => ({ ax: edge.ax, ay: edge.ay, cx: edge.controlX, cy: edge.controlY, bx: edge.bx, by: edge.by });
    const edges = host.__atlasMap.edges().filter(edge => edge.visible);
    const samples = edges.map(edge => Array.from({ length: 401 }, (_, i) => point(curveOf(edge), i / 400)));
    const onCurve = (k: number, p: { x: number; y: number }) => samples[k].some(s => Math.hypot(s.x - p.x, s.y - p.y) < 0.75);
    const nodes = host.__atlasMap.nodes().filter(node => !node.hidden);
    const painted = new Set<number>();
    let strays = 0;
    for (const piece of host.drawnCurves) {
      const k = edges.findIndex((_, i) => [0, 0.5, 1].every(t => onCurve(i, point(piece, t))));
      if (k < 0) strays += 1; else painted.add(k);
    }
    const candidates: { sourceId: string; targetId: string; x: number; y: number; hit: boolean }[] = [];
    for (const k of painted) {
      const edge = edges[k];
      // Tracts bundle dependencies, so look along the curve for a point no other curve passes near.
      const at = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8].map(t => point(curveOf(edge), t)).find(p =>
        p.x >= 330 && p.x <= innerWidth - 100 && p.y >= 100 && p.y <= innerHeight - 100 &&
        !nodes.some(node => Math.hypot(node.x - p.x, node.y - p.y) < node.radius + 14) &&
        !samples.some((other, i) => i !== k && other.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 12)));
      if (!at) continue;
      const hit = host.__atlasMap.edgeAt(at.x, at.y);
      candidates.push({ sourceId: edge.sourceId, targetId: edge.targetId, ...at,
        hit: hit?.sourceId === edge.sourceId && hit?.targetId === edge.targetId });
    }
    return { pieces: host.drawnCurves.length, painted: painted.size, strays, candidates };
  });
  console.log(`[edge-picking] Neural: ${result.pieces} painted pieces on ${result.painted} dependencies, ${result.candidates.length} isolated`);
  expect(result.strays, 'painted pieces that lie on no curve the probe reports').toBe(0);
  expect(result.painted, 'the paint recorder measured no dependency curves').toBeGreaterThan(5);
  expect(result.candidates.length, 'fewer than three isolated dependency strokes were tested').toBeGreaterThanOrEqual(3);
  expect(result.candidates.filter(candidate => !candidate.hit), 'visible strokes missed by picking').toEqual([]);
  const target = result.candidates[0];
  const canvas = await page.getByTestId('ontology-map-canvas').boundingBox();
  await page.mouse.click(canvas!.x + target.x, canvas!.y + target.y);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __atlasMap: { selection(): { edge: unknown } } }).__atlasMap.selection().edge)).toMatchObject({ sourceId: target.sourceId, targetId: target.targetId });
});
