import { expect, test } from '@playwright/test';

test('a pending folder choice replaces play with the existing waiting state', async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, { isTauri: true, __TAURI_INTERNALS__: {
      transformCallback: () => 0,
      invoke: (command: string) => command === 'pick_vault_directory'
        ? new Promise(() => {}) : Promise.reject(new Error('Native operation unavailable in the chooser fixture')),
    } });
  });
  await page.goto('/en/?shell=desktop&guides=off');
  const stage = page.locator('[data-moru-playground]');
  await expect(stage).toHaveAttribute('data-moru-context', 'folder');
  const previousStage = await stage.elementHandle();
  await page.getByRole('button', { name: /Open my folder/ }).click();
  await expect(stage).toHaveCount(0);
  await expect(page.getByRole('status')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pet Moru' })).toHaveCount(0);
  expect(await previousStage!.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
});

test('petting has no pressed backdrop and returns to ambient play after a finite response', async ({ page }) => {
  await page.goto('/en/?shell=desktop&guides=off');
  const pet = page.locator('[data-moru-companion]');
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
  await page.mouse.move(0, 0);
  await expect(pet).not.toHaveAttribute('data-moru-reaction');
  await expect.poll(() => pet.evaluate(element => element.closest('[data-moru-playground]')!.getAnimations({ subtree: true }).every(a => a.playState === 'running'))).toBe(true);
});

test('keyboard petting and its context menu preserve focus and an explicit pause', async ({ page }) => {
  await page.goto('/en/?shell=desktop&guides=off');
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
  await expect(pet).toHaveAttribute('data-moru-reaction', 'clap');
  await expect.poll(() => pet.evaluate(element => element.closest('[data-moru-playground]')!.getAnimations({ subtree: true }).filter(a => !(a instanceof CSSTransition)).every(a => a.playState === 'paused'))).toBe(true);
});

test('reduced motion offers still feedback without starting any animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/en/?shell=desktop&guides=off');
  const pet = page.getByRole('button', { name: 'Pet Moru' });
  await pet.click();
  await expect(pet).toHaveAttribute('data-moru-reaction', 'shy');
  await expect(pet.locator('..').locator('..').getByRole('button')).toHaveCount(1);
  await pet.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Moru · reduced motion' })).toBeDisabled();
  expect(await pet.evaluate(element => element.closest('[data-moru-playground]')!.getAnimations({ subtree: true }).filter(a => !(a instanceof CSSTransition)).length)).toBe(0);
});
