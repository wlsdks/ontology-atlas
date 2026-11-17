import { expect, test } from '@playwright/test';

/**
 * A `<video>` does not re-select its source when its children change, so `currentSrc` is read
 * after load. Each locale first asserts a video loaded, so deleting the demo cannot stay green.
 */

const CASES = [
  { path: '/ko/download/?guides=off', tag: 'ko' },
  { path: '/en/download/?guides=off', tag: 'en' },
] as const;

for (const { path, tag } of CASES) {
  test(`${tag}: the playing video and its poster share a locale`, async ({ page }) => {
    await page.goto(path);

    const video = page.locator('video').first();
    await expect(video).toBeVisible();
    // The prerendered HTML already names the page's own poster, so it holds from the first paint.
    await expect(video).toHaveAttribute('poster', new RegExp(`atlas-tour\\.${tag}-poster`));
    await video.scrollIntoViewIfNeeded();

    const info = await video.evaluate(async (el: HTMLVideoElement) => {
      el.muted = true;
      await el.play().catch(() => undefined);
      // Wait until a source is actually selected — with preload="none", currentSrc is
      // empty before playback.
      for (let i = 0; i < 60 && !el.currentSrc; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return { currentSrc: el.currentSrc, poster: el.poster, readyState: el.readyState };
    });

    // Evidence it is not idling: a source really was selected.
    expect(info.currentSrc, 'no video source was loaded').not.toBe('');
    expect(info.poster, 'the poster is empty').not.toBe('');

    expect(info.currentSrc, `the ${tag} page plays a video of another locale`).toContain(
      `atlas-tour.${tag}.`,
    );
    expect(info.poster, `the ${tag} page uses a poster of another locale`).toContain(
      `atlas-tour.${tag}-poster`,
    );
  });
}
