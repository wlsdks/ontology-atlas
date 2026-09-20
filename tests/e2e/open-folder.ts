import { expect, type Page } from '@playwright/test';

/**
 * Open the vault from the first-run card and **wait until it is actually open**.
 *
 * ⚠️ Ten specs used to click this door and navigate in the next statement. Opening a folder is
 * not synchronous, and a Library route entered before it finishes bounces to the first-run
 * gateway — so the walk then waited for `library-workspace-wiki`, an element that was never going
 * to appear, until a fifteen-second timeout named it. The error blamed the Library; the page in
 * the failure screenshot was the gateway.
 *
 * It is a race, so it fails by load rather than by branch: green three times locally against the
 * dev server, red on the built export CI runs, and red on different cases each run — which is
 * what made it read as an unrelated flake for a whole day of landings across several sessions.
 *
 * Opening lands on the map, which is where a person who just chose a folder wants to be, so that
 * heading is the signal that the folder is open. `library-compile-dock.spec.ts` already walked it
 * this way; this is that wait with one owner.
 *
 * ⚠️ **Only the walks that were measured failing use this.** Six more specs have the same shape,
 * and adding the wait to four of them turned two green specs red — the extra stop on the map is
 * not free for a walk whose next move is the rail rather than a fresh navigation. A fix applied
 * where nothing was broken is a change with no evidence behind it, so those stay as they are
 * until one of them actually fails.
 */
export async function openFolderFromFirstRun(page: Page, locale: 'en' | 'ko' = 'en') {
  await page.goto(`/${locale}/docs/`);
  const door = page.getByRole('button', { name: /Open my folder|내 폴더 열기/i });
  await expect(door, 'waiting for the open-folder door').toBeVisible();
  await door.first().click();
  await expect(
    page.getByRole('heading', { name: locale === 'ko' ? '지도' : 'Map', level: 1 }),
    'the folder is open once the map arrives; entering the Library before this bounces to the gateway',
  ).toBeVisible({ timeout: 30_000 });
}
