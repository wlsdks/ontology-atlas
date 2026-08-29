import { expect, test, type Page } from '@playwright/test';
import { seedFirstRunSeen } from './first-run-seed';
import { stubDirectoryPicker } from './vault-picker-stub';

const heartbeat = (state: 'planning' | 'complete') =>
  JSON.stringify({
    agent: 'codex-mcp-client',
    state,
    focus: {
      summary: 'Read the payment capability',
      ontologySlug: 'capabilities/pay',
      files: [],
    },
    plan: ['Read current ontology evidence'],
    evidence: { mcp: ['list_concepts'], source: [], codegraph: [], verification: [] },
    updatedAt: state === 'planning' ? '{{NOW-1000}}' : new Date().toISOString(),
  });

async function writeActivityHeartbeat(page: Page, json: string): Promise<boolean> {
  return page.evaluate(async (contents) => {
    const root = await navigator.storage.getDirectory();
    const names: string[] = [];
    for await (const key of (root as unknown as { keys: () => AsyncIterable<string> }).keys()) {
      if (key.startsWith('stub-vault-')) names.push(key);
    }
    names.sort();
    const directoryName = names.at(-1);
    if (!directoryName) return false;
    const directory = await root.getDirectoryHandle(directoryName);
    const sidecar = await directory.getDirectoryHandle('.ontology-atlas', { create: true });
    const handle = await sidecar.getFileHandle('agent-activity.json', { create: true });
    const writable = await handle.createWritable();
    await writable.write(contents);
    await writable.close();
    return true;
  }, json);
}

test('verified read work walks into READ and terminal state resolves to SUCCESS', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  const evidenceDir = process.env.MASCOT_EVIDENCE_DIR;
  if (evidenceDir) {
    await page.addInitScript(() => {
      const nativeSetTimeout = window.setTimeout.bind(window);
      window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
        nativeSetTimeout(handler, timeout === 600 ? 6_000 : timeout, ...args)) as typeof window.setTimeout;
    });
  }
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, {
    'shop.md': `---\nuid: 11111111-1111-4111-8111-111111111111\nslug: shop\nkind: project\ntitle: Mascot Shop\ncontains:\n  - capabilities/pay\n---\n`,
    'capabilities/pay.md': `---\nuid: 22222222-2222-4222-8222-222222222222\nslug: capabilities/pay\nkind: capability\ntitle: Pay\n---\n`,
    '.ontology-atlas/agent-activity.json': `${heartbeat('planning')}\n`,
  });

  await page.goto('/en/topology/?e2e=1&guides=off', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('first-run-starter-open').click();
  await page.getByTestId('vault-guide-pick-existing').click();

  const mascot = page.getByTestId('agent-mascot-presence');
  await expect(mascot).toBeVisible({ timeout: 30_000 });
  if (evidenceDir) {
    for (let frame = 0; frame < 6; frame += 1) {
      await mascot.evaluate((element, currentTime) => {
        for (const animation of element.getAnimations({ subtree: true })) {
          animation.pause();
          animation.currentTime = currentTime;
        }
      }, frame * 120);
      await mascot.screenshot({
        path: `${evidenceDir}/walk-frame-${String(frame + 1).padStart(2, '0')}.png`,
      });
    }
  }
  await expect(mascot).toHaveAttribute('data-state', 'read', { timeout: 30_000 });
  await expect(mascot).toContainText('The agent is reading the ontology.');
  const readSprite = mascot.locator('[data-mascot-state="read"]');
  await expect(readSprite).toHaveCSS('background-image', /mascot-read-row\.png/);

  const geometry = await mascot.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      pointerEvents: getComputedStyle(element).pointerEvents,
      interceptedByMascot: hit === element || element.contains(hit),
    };
  });
  expect(geometry.pointerEvents).toBe('none');
  expect(geometry.interceptedByMascot).toBe(false);
  expect(geometry.rect.right - geometry.rect.left).toBe(64);
  expect(geometry.rect.bottom - geometry.rect.top).toBe(64);
  expect(geometry.rect.left).toBeGreaterThanOrEqual(1024);
  expect(geometry.rect.right).toBe(1512 - 24);
  expect(geometry.rect.top).toBe(900 / 2 + 24 * 2);
  expect(geometry.rect.bottom).toBe(900 / 2 + 24 * 2 + 64);

  const wroteCompletion = await writeActivityHeartbeat(page, `${heartbeat('complete')}\n`);
  expect(wroteCompletion).toBe(true);

  await expect(mascot).toHaveAttribute('data-state', 'success', { timeout: 30_000 });
  await expect(mascot).toContainText('The verified agent work completed.');
  if (evidenceDir) {
    await page.waitForTimeout(360);
    await mascot.screenshot({ path: `${evidenceDir}/success-pose.png` });
  }
  await expect(mascot).toBeHidden({ timeout: 5_000 });
});

test('reduced motion keeps the verified READ fact as a static pose', async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, {
    'shop.md': `---\nuid: 11111111-1111-4111-8111-111111111111\nslug: shop\nkind: project\ntitle: Mascot Shop\n---\n`,
    '.ontology-atlas/agent-activity.json': `${heartbeat('planning')}\n`,
  });

  await page.goto('/en/topology/?guides=off', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('first-run-starter-open').click();
  await page.getByTestId('vault-guide-pick-existing').click();

  const mascot = page.getByTestId('agent-mascot-presence');
  await expect(mascot).toHaveAttribute('data-state', 'read', { timeout: 30_000 });
  await expect(mascot).toContainText('The agent is reading the ontology.');
  const reducedDuration = await mascot
    .locator('[data-mascot-state="read"]')
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).animationDuration));
  expect(reducedDuration).toBeLessThanOrEqual(0.00001);

  const evidenceDir = process.env.MASCOT_EVIDENCE_DIR;
  if (evidenceDir) {
    await page.keyboard.press('Escape');
    await page.screenshot({ path: `${evidenceDir}/mascot-read-1512x900.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(mascot).toBeHidden();
    await page.screenshot({ path: `${evidenceDir}/mascot-compact-390x844.png` });
  }
});

test('mascot presence respects every responsive chrome band', async ({ page }) => {
  test.setTimeout(120_000);
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, {
    'shop.md': `---\nuid: 11111111-1111-4111-8111-111111111111\nslug: shop\nkind: project\ntitle: Mascot Shop\n---\n`,
    '.ontology-atlas/agent-activity.json': `${heartbeat('planning')}\n`,
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/en/topology/?guides=off', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('first-run-starter-open').click();
  await page.getByTestId('vault-guide-pick-existing').click();
  const mascot = page.getByTestId('agent-mascot-presence');
  await expect(mascot).toHaveAttribute('data-state', 'read', { timeout: 30_000 });

  const matrix = [
    [600, 900],
    [768, 1024],
    [834, 1112],
    [1024, 768],
    [1440, 900],
    [1920, 1080],
    [2560, 1440],
  ] as const;

  for (const [width, height] of matrix) {
    await page.setViewportSize({ width, height });
    if (width < 1024) {
      await expect(mascot, `${width}px should keep the bottom-tab surface clear`).toBeHidden();
      continue;
    }
    await expect(mascot).toBeVisible();
    const box = await mascot.boundingBox();
    expect(box, `${width}px mascot has no rect`).not.toBeNull();
    expect(box!.width).toBe(64);
    expect(box!.height).toBe(64);
    expect(box!.x + box!.width).toBe(width - 24);
    expect(box!.y).toBe(height / 2 + 24 * 2);
    expect(box!.y + box!.height).toBe(height / 2 + 24 * 2 + 64);
  }
});

test('every opaque mascot frame stays clear of dense-map node ink', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await page.goto('/en/topology/?e2e=1&synth=3000&guides=off', {
    waitUntil: 'domcontentloaded',
  });

  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as unknown as { __atlasMap?: { nodes: () => unknown[] } }).__atlasMap
              ?.nodes().length ?? 0,
        ),
      { timeout: 30_000, message: 'dense synthetic map instrumentation did not expose nodes' },
    )
    .toBeGreaterThan(0);

  const samples: Array<{ nearby: string[]; overlaps: string[]; nearestGap: number } | null> = [];
  for (let sample = 0; sample < 3; sample += 1) {
    samples.push(await page.evaluate(async () => {
      type NodeInk = { id: string; x: number; y: number; radius: number; hidden: boolean };
      const map = (window as unknown as { __atlasMap?: { nodes: () => NodeInk[] } }).__atlasMap;
      const canvas = document.querySelector<HTMLElement>('[data-testid="topology-map-v2-canvas"]');
      if (!map || !canvas) return null;
      const canvasRect = canvas.getBoundingClientRect();
      const inset = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--chrome-inset'),
      );
      const spriteRect = {
        left: innerWidth - inset - 64,
        right: innerWidth - inset,
        top: innerHeight / 2 + inset * 2,
        bottom: innerHeight / 2 + inset * 2 + 64,
      };
      const nodes = map.nodes().filter((node) => !node.hidden && node.radius > 0);
      const nearby = nodes.filter((node) => {
        const x = canvasRect.left + node.x;
        const y = canvasRect.top + node.y;
        return (
          x + node.radius >= spriteRect.left &&
          x - node.radius <= spriteRect.right &&
          y + node.radius >= spriteRect.top &&
          y - node.radius <= spriteRect.bottom
        );
      });
      const nearestGap = Math.min(
        ...nodes.map((node) => {
          const x = canvasRect.left + node.x;
          const y = canvasRect.top + node.y;
          const dx = Math.max(spriteRect.left - x, 0, x - spriteRect.right);
          const dy = Math.max(spriteRect.top - y, 0, y - spriteRect.bottom);
          return Math.max(0, Math.hypot(dx, dy) - node.radius);
        }),
      );

      const overlaps: string[] = [];
      for (const state of ['walk', 'read', 'success'] as const) {
        const response = await fetch(`/brand/mascot-${state}-row.png`);
        const bitmap = await createImageBitmap(await response.blob());
        const buffer = document.createElement('canvas');
        buffer.width = bitmap.width;
        buffer.height = bitmap.height;
        const context = buffer.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('2D context unavailable');
        context.drawImage(bitmap, 0, 0);
        const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
        for (let frame = 0; frame < 6; frame += 1) {
          for (let y = 0; y < 64; y += 1) {
            for (let x = 0; x < 64; x += 1) {
              if (pixels[(y * bitmap.width + frame * 64 + x) * 4 + 3] === 0) continue;
              const pageX = spriteRect.left + x + 0.5;
              const pageY = spriteRect.top + y + 0.5;
              for (const node of nearby) {
                const nodeX = canvasRect.left + node.x;
                const nodeY = canvasRect.top + node.y;
                if (Math.hypot(pageX - nodeX, pageY - nodeY) <= node.radius) {
                  overlaps.push(`${state}:${frame + 1}:${node.id}`);
                }
              }
            }
          }
        }
      }
      return {
        nearby: nearby.map(
          (node) =>
            `${node.id}@${(canvasRect.left + node.x).toFixed(1)},${(canvasRect.top + node.y).toFixed(1)},r${node.radius.toFixed(1)}`,
        ),
        overlaps: [...new Set(overlaps)],
        nearestGap,
      };
    }));
    await page.waitForTimeout(500);
  }

  expect(samples.every(Boolean), 'map/sprite instrumentation was unavailable').toBe(true);
  const nearby = [...new Set(samples.flatMap((sample) => sample?.nearby ?? []))];
  const overlaps = [...new Set(samples.flatMap((sample) => sample?.overlaps ?? []))];
  const nearestGap = Math.min(...samples.map((sample) => sample?.nearestGap ?? Number.POSITIVE_INFINITY));
  console.log(
    `[mascot-right-lane] nearby=${nearby.join('|') || 'none'} nearestGap=${nearestGap.toFixed(2)} overlaps=${overlaps.join('|') || 'none'}`,
  );
  expect(nearestGap, 'probe drifted into an empty region and no longer challenges the mascot lane').toBeLessThan(16);
  expect(overlaps, 'opaque mascot pixels covered a visible topology node').toEqual([]);
});
