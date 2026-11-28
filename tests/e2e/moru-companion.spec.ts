import { expect, test } from '@playwright/test';
import { createRequire } from 'node:module';
import { installDesktopRailRuntime, mountDesktopVault } from './desktop-rail-arrival-harness';

test.beforeEach(async ({ page }) => {
  await installDesktopRailRuntime(page);
});

test('paints the still companion at a deep-linked welcome before any interaction', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mountDesktopVault(page, 'en');
  await expect(page.getByTestId('first-run-starter')).toHaveCount(0);
  await page.goto('/en/download/?guides=off', { waitUntil: 'networkidle' });
  const stage = page.locator('[data-moru-playground]');
  await stage.locator('img').first().evaluate(image => (image as HTMLImageElement).decode());
  const clip = await stage.boundingBox();
  expect(clip).not.toBeNull();
  const require = createRequire(`${process.cwd()}/package.json`);
  const sharp = require('sharp');
  const pixels: Buffer = await sharp(await page.screenshot({ clip: clip! })).removeAlpha().raw().toBuffer();
  let bodyPixels = 0;
  for (let i = 0; i < pixels.length; i += 3) {
    if (pixels[i] > 150 && pixels[i + 1] > 140 && pixels[i + 2] < pixels[i + 1] + 10) bodyPixels++;
  }
  expect(bodyPixels, 'the loaded still character must paint real gray/ivory pixels').toBeGreaterThan(1000);
});

test('hover lets an airborne hop land before holding the character', async ({ page }) => {
  await page.goto('/en/download/?guides=off');
  const pet = page.getByRole('button', { name: 'Pet Moru' });
  await pet.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  // Seek to the middle of a real horizontal flight segment, independently of
  // the sprite's frame numbers. Ground-contact tests verify that those segments
  // coincide with feet clear of the floor in the shipped pixels.
  const initialX = await pet.evaluate(element => {
    const animations = element.closest('[data-moru-playground]')!.getAnimations({ subtree: true });
    const travel = animations.find(a => (a.effect as KeyframeEffect).target === element)!;
    const keys = (travel.effect as KeyframeEffect).getKeyframes();
    const end = keys.findIndex((key, i) => i > 0 && key.transform !== keys[i - 1].transform);
    const time = (Number(keys[end - 1].offset) + Number(keys[end].offset)) / 2 * Number(travel.effect!.getTiming().duration);
    for (const animation of animations) { animation.pause(); animation.currentTime = time; }
    return element.getBoundingClientRect().x;
  });
  await pet.hover();
  await expect.poll(() => pet.evaluate(element => element.getBoundingClientRect().x)).not.toBe(initialX);
  await expect.poll(() => pet.evaluate(element => element.closest('[data-moru-playground]')!.getAnimations({ subtree: true }).filter(a => !(a instanceof CSSTransition)).every(a => a.playState === 'paused'))).toBe(true);
  await expect(pet).not.toHaveAttribute('data-moru-reaction');
  await page.mouse.move(0, 0);
  await expect.poll(() => pet.evaluate(element => element.closest('[data-moru-playground]')!.getAnimations({ subtree: true }).filter(a => !(a instanceof CSSTransition)).every(a => a.playState === 'running'))).toBe(true);
});

test('a pending folder choice replaces play with the existing waiting state', async ({ page }) => {
  // The folder dialog stays open: its answer never comes.
  await page.addInitScript(() => {
    const runtime = window as unknown as { __TAURI_INTERNALS__: { invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown> } };
    const answer = runtime.__TAURI_INTERNALS__.invoke;
    runtime.__TAURI_INTERNALS__.invoke = (command, args) => command === 'pick_vault_directory' ? new Promise(() => {}) : answer(command, args);
  });
  await page.goto('/en/?guides=off');
  const stage = page.locator('[data-moru-playground]');
  await expect(stage).toHaveAttribute('data-moru-context', 'folder');
  const previousStage = await stage.elementHandle();
  await page.getByRole('button', { name: /Open (?:a|my) folder/ }).click();
  await expect(stage).toHaveCount(0);
  await expect(page.getByRole('status')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pet Moru' })).toHaveCount(0);
  expect(await previousStage!.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
});

test('petting has no pressed backdrop and returns to ambient play after a finite response', async ({ page }) => {
  // One full pass now covers eighteen finite responses, including longer encounters.
  test.setTimeout(120_000);
  await page.goto('/en/download/?guides=off');
  const pet = page.locator('[data-moru-companion]');
  await expect(page.locator('[data-moru-playground]')).toHaveAttribute('data-moru-context', 'welcome');
  await pet.hover();
  await page.mouse.down();
  try {
    const background = await pet.evaluate(async element => {
      // Settle actual CSS transitions, so a transparent first frame cannot hide
      // the old IconButton's coloured :active surface.
      void getComputedStyle(element).backgroundColor;
      await Promise.all(element.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished));
      return getComputedStyle(element).backgroundColor;
    });
    expect(background).toBe('rgba(0, 0, 0, 0)');
  } finally { await page.mouse.up(); }
  await expect(pet.locator('..').locator('..').getByRole('button')).toHaveCount(1);
  await expect(pet).toHaveAttribute('data-moru-reaction', 'shy');
  await expect(pet.locator('[data-moru-emote]')).toHaveAttribute('data-emotion', 'heart');
  await expect.poll(() => pet.locator('[data-moru-emote]').evaluate(element => Number(getComputedStyle(element).opacity))).toBe(1);
  await page.mouse.move(0, 0);
  await expect(pet).not.toHaveAttribute('data-moru-reaction');
  await expect.poll(() => pet.evaluate(element => element.closest('[data-moru-playground]')!.getAnimations({ subtree: true }).every(a => a.playState === 'running'))).toBe(true);
  // Every new expression must finish and hand back to the same companion,
  // without adding a control or leaving the reaction strip visible forever.
  const seen = new Set(['shy']);
  for (let i = 0; i < 17; i++) {
    await pet.click();
    await expect(pet).toHaveAttribute('data-moru-reaction');
    const gesture = (await pet.getAttribute('data-moru-reaction'))!;
    if (i === 0) expect(['nose-balance', 'pup-peek', 'heart-gift', 'star-sneeze']).toContain(gesture);
    expect(seen.has(gesture), `repeated ${gesture} before completing the repertoire`).toBe(false);
    seen.add(gesture);
    await expect(pet).not.toHaveAttribute('data-moru-reaction');
  }
  expect([...seen].sort()).toEqual(['shy', 'clap', 'dance', 'thinking', 'pondering', 'hearts', 'laugh', 'flipper-groove', 'soft-bow', 'flipper-five', 'hat-tip', 'magic-fish', 'nose-balance', 'pup-peek', 'heart-gift', 'star-sneeze', 'bubble-chase', 'sing'].sort());
  await expect(pet.locator('..').locator('..').getByRole('button')).toHaveCount(1);
});

test('keyboard petting and its context menu preserve focus and an explicit pause', async ({ page }) => {
  await page.goto('/en/?guides=off');
  const pet = page.getByRole('button', { name: 'Pet Moru' });
  await pet.focus();
  await page.keyboard.press('Enter');
  await expect(pet).toHaveAttribute('data-moru-reaction', 'shy');
  await expect(pet).toBeFocused();
  await expect(pet).not.toHaveAttribute('data-moru-reaction');
  await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('menuitem', { name: 'Pause Moru animation' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(pet).toBeFocused();
  await pet.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Pause Moru animation' }).click();
  await pet.click();
  await expect(pet).toHaveAttribute('data-moru-paused', 'true');
  await expect(pet).toHaveAttribute('data-moru-reaction');
  await expect(pet).not.toHaveAttribute('data-moru-reaction', 'shy');
  await expect.poll(() => pet.evaluate(element => element.closest('[data-moru-playground]')!.getAnimations({ subtree: true }).filter(a => !(a instanceof CSSTransition)).every(a => a.playState === 'paused'))).toBe(true);
});

test('reduced motion offers still feedback without starting any animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/en/?guides=off');
  const pet = page.getByRole('button', { name: 'Pet Moru' });
  await pet.click();
  await expect(pet).toHaveAttribute('data-moru-reaction', 'shy');
  await expect(pet.locator('[data-moru-emote]')).toHaveCSS('opacity', '1');
  await expect(pet.locator('..').locator('..').getByRole('button')).toHaveCount(1);
  await pet.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Moru · reduced motion' })).toBeDisabled();
  expect(await pet.evaluate(element => element.closest('[data-moru-playground]')!.getAnimations({ subtree: true }).filter(a => !(a instanceof CSSTransition)).length)).toBe(0);
});

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`the download hero's source link takes its own press beside Moru at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/en/download/?guides=off');
    const link = page.getByTestId('gateway-hero-source');
    await expect(link).toHaveAttribute('href', 'https://github.com/wlsdks/ontology-atlas');
    await expect(page.getByRole('button', { name: 'Pet Moru' })).toBeVisible();
    // Moru's cell stands beside the link on a narrow window and its empty rows reach toward it, so every point is asked.
    const misses = await link.evaluate(element => {
      const box = element.getBoundingClientRect();
      const missed: string[] = [];
      for (const x of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        for (const y of [0.2, 0.5, 0.8]) {
          const hit = document.elementFromPoint(box.left + box.width * x, box.top + box.height * y);
          if (!hit || !element.contains(hit)) missed.push(`${x},${y}`);
        }
      }
      return missed;
    });
    expect(misses, 'points of the link that another element covers').toEqual([]);
    const menu = page.getByRole('button', { name: 'Pet Moru' });
    await menu.click({ button: 'right' });
    const item = await page.getByRole('menuitem').boundingBox();
    expect(item!.height, 'the menu is drawn at its own size, not at Moru\'s 2x').toBeLessThan(48);
  });
}
