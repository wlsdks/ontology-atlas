import { expect, test } from '@playwright/test';
import { seedFirstRunSeen } from '../../first-run-seed';
import { waitForDomeEntered, waitForMapStill } from '../../settle';

type ProbeNode = { id: string; kind: string; x: number; y: number; radius: number; hidden: boolean };
type Probe = { __atlasMap: { nodes(): ProbeNode[]; selection(): { nodeId: string | null } } };

test.use({ viewport: { width: 1440, height: 900 }, contextOptions: { reducedMotion: 'reduce' } });

test('Neural: zoomed in, a press just inside the largest cell rim selects that cell', async ({ page }) => {
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    localStorage.setItem('atlas.appearance.view3d', 'on');
    localStorage.setItem('atlas.appearance.map-arrangement', 'coupling');
  });
  await page.goto('/en/topology/?synth=31&synthDeps=1&e2e=1&guides=off');
  await waitForDomeEntered(page);
  await waitForMapStill(page);
  const canvas = (await page.getByTestId('ontology-map-canvas').boundingBox())!;
  const nodes = () => page.evaluate(() => (window as unknown as Probe).__atlasMap.nodes());
  const before = (await nodes())
    .filter((node) => !node.hidden && node.kind === 'capability' && node.x > 360 && node.x < 1320 && node.y > 140 && node.y < 760)
    .sort((a, b) => b.radius - a.radius)[0];
  await page.mouse.move(canvas.x + before.x, canvas.y + before.y);
  for (let notch = 0; notch < 3; notch += 1) await page.mouse.wheel(0, -120);
  await waitForMapStill(page);
  const cell = (await nodes()).find((node) => node.id === before.id)!;
  expect(cell.radius, 'zooming in grows the painted cell').toBeGreaterThan(before.radius * 1.4);
  await page.mouse.click(canvas.x + cell.x + cell.radius - 1.5, canvas.y + cell.y);
  await expect.poll(() => page.evaluate(() => (window as unknown as Probe).__atlasMap.selection().nodeId)).toBe(cell.id);
});
