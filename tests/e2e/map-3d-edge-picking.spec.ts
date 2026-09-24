import { expect, test } from '@playwright/test';
import { seedFirstRunSeen } from './first-run-seed';
import { waitForDomeEntered, waitForMapStill } from './settle';

// Record the actual canvas path, independently of __atlasMap.edges(). Previously
// paint curved in 3D while both the probe and picking reported the old flat bow.
test.use({ viewport: { width: 1440, height: 900 }, contextOptions: { reducedMotion: 'reduce' } });

for (const arrangement of ['strata', 'coupling']) {
  test(`${arrangement}: visible connection strokes are the curves a pointer selects`, async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.addInitScript((value) => {
      localStorage.setItem('atlas.appearance.view3d', 'on');
      localStorage.setItem('atlas.appearance.map-arrangement', value);
      type Curve = { ax: number; ay: number; cx: number; cy: number; bx: number; by: number };
      const host = window as unknown as { drawnCurves: Curve[] };
      host.drawnCurves = [];
      const paths = new WeakMap<CanvasRenderingContext2D, { x: number; y: number; curve?: Curve }>();
      const proto = CanvasRenderingContext2D.prototype;
      const begin = proto.beginPath, move = proto.moveTo, quad = proto.quadraticCurveTo, stroke = proto.stroke, fill = proto.fillRect;
      const strokePlain: (this: CanvasRenderingContext2D) => void = proto.stroke;
      proto.beginPath = function () { paths.delete(this); begin.call(this); };
      proto.moveTo = function (x, y) { paths.set(this, { x, y }); move.call(this, x, y); };
      proto.quadraticCurveTo = function (cx, cy, bx, by) {
        const start = paths.get(this);
        if (start) start.curve = { ax: start.x, ay: start.y, cx, cy, bx, by };
        quad.call(this, cx, cy, bx, by);
      };
      proto.fillRect = function (x, y, width, height) {
        if (this.canvas.dataset.testid === 'ontology-map-canvas' && x === 0 && y === 0 && width > 100 && height > 100) host.drawnCurves = [];
        fill.call(this, x, y, width, height);
      };
      proto.stroke = function (path?: Path2D) {
        const curve = paths.get(this)?.curve;
        if (curve && this.canvas.dataset.testid === 'ontology-map-canvas' && this.globalAlpha > 0.3) host.drawnCurves.push(curve);
        if (path) stroke.call(this, path); else strokePlain.call(this);
      };
    }, arrangement);
    await page.goto('/en/topology/?synth=31&e2e=1&guides=off');
    await waitForDomeEntered(page);
    await waitForMapStill(page);
    const result = await page.evaluate(() => {
      type Curve = { ax: number; ay: number; cx: number; cy: number; bx: number; by: number };
      type Edge = { sourceId: string; targetId: string; ax: number; ay: number; bx: number; by: number; controlX: number; controlY: number };
      const host = window as unknown as { drawnCurves: Curve[]; __atlasMap: {
        edges(): Edge[]; nodes(): { x: number; y: number; radius: number; hidden: boolean }[];
        edgeAt(x: number, y: number): { sourceId: string; targetId: string } | null;
      } };
      const edges = host.__atlasMap.edges();
      const nodes = host.__atlasMap.nodes().filter(node => !node.hidden);
      const unique = new Map<string, Curve>();
      for (const curve of host.drawnCurves) unique.set(JSON.stringify(curve), curve);
      const curves = [...unique.values()];
      const point = (curve: Curve, t: number) => ({
        x: (1 - t) ** 2 * curve.ax + 2 * (1 - t) * t * curve.cx + t * t * curve.bx,
        y: (1 - t) ** 2 * curve.ay + 2 * (1 - t) * t * curve.cy + t * t * curve.by,
      });
      const mismatchedControls: string[] = [];
      const candidates: { sourceId: string; targetId: string; x: number; y: number; hit: boolean }[] = [];
      for (const curve of curves) {
        const edge = edges.find(edge => Math.hypot(edge.ax - curve.ax, edge.ay - curve.ay, edge.bx - curve.bx, edge.by - curve.by) < 0.5);
        if (!edge) continue;
        if (Math.hypot(edge.controlX - curve.cx, edge.controlY - curve.cy) > 0.5) mismatchedControls.push(`${edge.sourceId}:${edge.targetId}`);
        const at = point(curve, 0.5);
        if (at.x < 330 || at.x > innerWidth - 100 || at.y < 100 || at.y > innerHeight - 100) continue;
        if (nodes.some(node => Math.hypot(node.x - at.x, node.y - at.y) < node.radius + 14)) continue;
        const otherNearby = curves.some(other => other !== curve &&
          Math.hypot(other.ax - curve.ax, other.ay - curve.ay, other.bx - curve.bx, other.by - curve.by) > 1 &&
          Array.from({ length: 21 }, (_, i) => point(other, i / 20)).some(p => Math.hypot(p.x - at.x, p.y - at.y) < 12));
        if (otherNearby) continue;
        const hit = host.__atlasMap.edgeAt(at.x, at.y);
        candidates.push({ sourceId: edge.sourceId, targetId: edge.targetId, ...at,
          hit: hit?.sourceId === edge.sourceId && hit?.targetId === edge.targetId });
      }
      return { recorded: curves.length, candidates, mismatchedControls };
    });
    expect(result.mismatchedControls, 'the inspection curve differs from the painted curve').toEqual([]);
    expect(result.recorded, 'the paint recorder measured no connection paths').toBeGreaterThan(5);
    console.log(`[edge-picking] ${arrangement}: ${result.recorded} painted paths, ${result.candidates.length} isolated strokes`);
    expect(result.candidates.length, 'fewer than three isolated connection strokes were tested').toBeGreaterThanOrEqual(3);
    expect(result.candidates.filter(candidate => !candidate.hit), 'visible strokes missed by picking').toEqual([]);
    const target = result.candidates[0];
    const canvas = await page.getByTestId('ontology-map-canvas').boundingBox();
    await page.mouse.click(canvas!.x + target.x, canvas!.y + target.y);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __atlasMap: { selection(): { edge: unknown } } }).__atlasMap.selection().edge)).toMatchObject({ sourceId: target.sourceId, targetId: target.targetId });
  });
}
