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
    return nodes.find(node => node.kind === 'domain' && node.x > 360 && node.x < innerWidth - 480 && node.y > 150 && node.y < innerHeight - 100 &&
      !nodes.some(other => other.id !== node.id && Math.hypot(other.x - node.x, other.y - node.y) < other.radius + node.radius + 4));
  });
  expect(target, 'an isolated domain is required to exercise real selection').toBeTruthy();
  // A double-click: since 2026-09-25 a single click in 3D only selects, and the return
  // transition below needs a view that was actually moved — the fly-to moves it. The target
  // stays left of where the inspector docks: the first click opens it, and a second click
  // landing on the panel is a click on the panel.
  await page.mouse.dblclick(rect.x + target!.x, rect.y + target!.y);
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

/**
 * **Reduced motion keeps the lit Neural map still** (retargeted 2026-09-25).
 *
 * Until the lit 3D direction this watched Neural's indigo cell bloom fade in on the switch
 * from the Cone. The Cone is gone and both 3D views wear the same evidence light, so a
 * switch no longer changes the light at all; what reduced motion still owes is stillness.
 * Switched into Neural under reduced motion, the settled curves must not travel from frame
 * to frame (no spin, no particle, no morph), and a session with no Git walk must not claim
 * a single current light.
 */
test('reduced motion keeps the lit Neural map still, and claims no light it did not measure', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    localStorage.setItem('atlas.appearance.view3d', 'on');
    localStorage.setItem('atlas.appearance.map-arrangement', 'strata');
  });
  await page.goto('/en/topology/?synth=31&e2e=1&guides=off');
  await waitForDomeEntered(page);
  await waitForMapStill(page);
  await page.getByTestId('topology-view-3d').click();
  await page.getByTestId('topology-view-3d-choice-coupling').click();
  await waitForDomeEntered(page);
  await waitForMapStill(page);
  const samples = await page.evaluate(async () => {
    type Probe = {
      edges(): unknown[];
      dome(): { light: { current: number; stale: number; unknown: number } } | null;
    };
    const probe = (window as unknown as { __atlasMap: Probe }).__atlasMap;
    const out: { curves: string; light: { current: number; stale: number; unknown: number } }[] = [];
    for (let i = 0; i < 20; i += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      out.push({ curves: JSON.stringify(probe.edges()), light: probe.dome()!.light });
    }
    return out;
  });
  expect(new Set(samples.map((s) => s.curves)).size, 'reduced-motion curves travelled').toBe(1);
  const light = samples.at(-1)!.light;
  expect(light.unknown, 'no node was drawn with a light').toBeGreaterThan(0);
  expect(light.current, 'a web session with no Git walk lit a node as current').toBe(0);
  expect(light.stale).toBe(0);
});
