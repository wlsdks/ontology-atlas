import { expect, test } from '@playwright/test';
import { seedFirstRunSeen } from './first-run-seed';
import { waitForDomeEntered, waitForMapStill } from './settle';

test('Neural detail has a visible return path and fitting never paints overlapping labels', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    localStorage.setItem('atlas.appearance.view3d', 'on');
    localStorage.setItem('atlas.appearance.map-arrangement', 'coupling');
  });
  await page.goto('/en/topology/?e2e=1&guides=off');
  await waitForDomeEntered(page);
  const canvas = page.getByTestId('ontology-map-canvas');
  const rect = (await canvas.boundingBox())!;
  await page.mouse.move(rect.x + rect.width * 0.7, rect.y + rect.height * 0.8);
  await waitForMapStill(page);
  const target = await page.evaluate(() => {
    type Node = { id: string; kind: string; x: number; y: number; radius: number; hidden: boolean };
    const nodes = (window as unknown as { __atlasMap: { nodes(): Node[] } }).__atlasMap.nodes().filter(node => !node.hidden);
    return nodes.find(node => node.kind === 'domain' && node.x > 360 && node.x < innerWidth - 150 && node.y > 150 && node.y < innerHeight - 100 &&
      !nodes.some(other => other.id !== node.id && Math.hypot(other.x - node.x, other.y - node.y) < other.radius + node.radius + 4));
  });
  expect(target, 'an isolated domain is required to exercise real selection').toBeTruthy();
  await page.mouse.click(rect.x + target!.x, rect.y + target!.y);
  const panel = page.getByTestId('map-detail-panel');
  await expect(panel).toBeVisible();
  await waitForMapStill(page);
  // Covered controls must not remain in the accessibility tree behind the panel.
  await expect(page.getByTestId('topology-fit-control')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(panel).toBeHidden();
  const fit = page.getByTestId('topology-fit-control').getByRole('button');
  await expect(fit).toBeVisible();
  // Only the return transition needs motion; initial orientation is deterministic.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    type Box = { nodeId: string; text: string; minX: number; minY: number; maxX: number; maxY: number };
    const host = window as unknown as { __atlasMap: { labels(): Box[]; camera(): { scale: number } }; labelTravel: {
      running: boolean; frames: number; movingFrames: number; labelFrames: number; overlaps: string[];
    } };
    host.labelTravel = { running: true, frames: 0, movingFrames: 0, labelFrames: 0, overlaps: [] };
    let scale = host.__atlasMap.camera().scale;
    const sample = () => {
      if (!host.labelTravel.running) return;
      const state = host.labelTravel;
      state.frames += 1;
      const nextScale = host.__atlasMap.camera().scale;
      if (Math.abs(nextScale - scale) > 1e-5) state.movingFrames += 1;
      scale = nextScale;
      const labels = host.__atlasMap.labels();
      if (labels.length > 1) state.labelFrames += 1;
      for (let i = 0; i < labels.length; i += 1) for (let j = i + 1; j < labels.length; j += 1) {
        const a = labels[i], b = labels[j];
        if (Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) > 0.5 && Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY) > 0.5) state.overlaps.push(`${a.text} / ${b.text}`);
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await fit.click();
  // Fit deliberately rearms ambient rotation. Pointing back into the map pauses
  // that separate motion, so the sampler isolates the camera return.
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await waitForMapStill(page);
  const result = await page.evaluate(() => {
    const host = window as unknown as { __atlasMap: { selection(): { nodeId: string | null } }; labelTravel: {
      running: boolean; frames: number; movingFrames: number; labelFrames: number; overlaps: string[];
    } };
    host.labelTravel.running = false;
    return { ...host.labelTravel, selected: host.__atlasMap.selection().nodeId };
  });
  console.log(`[3D-reading] ${result.frames} frames, ${result.movingFrames} camera-motion frames, ${result.overlaps.length} label overlaps`);
  expect(result.selected).toBeNull();
  expect(result.movingFrames, 'the camera never moved; no transition was measured').toBeGreaterThan(0);
  expect(result.labelFrames, 'no visible labels were sampled').toBeGreaterThan(3);
  expect(result.overlaps).toEqual([]);
});

test('reduced motion fades Neural cell light without moving its settled curves', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    localStorage.setItem('atlas.appearance.view3d', 'on');
    localStorage.setItem('atlas.appearance.map-arrangement', 'ownership');
    const host = window as unknown as { neuralLightFrames: { alpha: number; curves: string }[]; recordNeuralLight: boolean; __atlasMap: { edges(): unknown[] } };
    host.neuralLightFrames = [];
    host.recordNeuralLight = false;
    const proto = CanvasRenderingContext2D.prototype;
    const draw = proto.drawImage;
    const fill = proto.fillRect;
    let sampled = false;
    proto.fillRect = function (x, y, width, height) {
      if (this.canvas.dataset.testid === 'ontology-map-canvas' && x === 0 && y === 0 && width > 100 && height > 100) sampled = false;
      fill.call(this, x, y, width, height);
    };
    proto.drawImage = function (image: CanvasImageSource, ...args: number[]) {
      if (host.recordNeuralLight && !sampled && this.canvas.dataset.testid === 'ontology-map-canvas' && image instanceof HTMLCanvasElement && image.width < 128 && args.length === 4) {
        sampled = true;
        host.neuralLightFrames.push({ alpha: this.globalAlpha, curves: JSON.stringify(host.__atlasMap.edges()) });
      }
      Reflect.apply(draw, this, [image, ...args]);
    };
  });
  await page.goto('/en/topology/?synth=31&e2e=1&guides=off');
  await waitForDomeEntered(page);
  await waitForMapStill(page);
  await page.getByTestId('topology-view-3d').click();
  await page.evaluate(() => { (window as unknown as { recordNeuralLight: boolean }).recordNeuralLight = true; });
  await page.getByTestId('topology-view-3d-choice-coupling').click();
  await expect.poll(() => page.evaluate(() => {
    const frames = (window as unknown as { neuralLightFrames: { alpha: number }[] }).neuralLightFrames;
    const tail = frames.slice(-3);
    return tail.length === 3 && tail[0].alpha > 0.05 && tail.every(frame => Math.abs(frame.alpha - tail[0].alpha) < 0.001);
  })).toBe(true);
  const frames = await page.evaluate(() => (window as unknown as { neuralLightFrames: { alpha: number; curves: string }[] }).neuralLightFrames);
  const settledAlpha = frames.at(-1)!.alpha;
  const fading = frames.filter(frame => frame.alpha > settledAlpha * 0.05 && frame.alpha < settledAlpha * 0.95);
  expect(new Set(fading.map(frame => frame.alpha.toFixed(3))).size, 'cell light cut instead of fading').toBeGreaterThan(2);
  expect(new Set(fading.map(frame => frame.curves)).size, 'reduced-motion curves travelled during the light fade').toBe(1);
  console.log(`[Neural reduced motion] ${fading.length} fading frames, stationary projected curves`);
});
