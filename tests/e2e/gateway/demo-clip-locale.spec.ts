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
  test(`${tag}: 재생되는 영상과 포스터가 같은 로케일이다`, async ({ page }) => {
    await page.goto(path);

    const video = page.locator('video').first();
    await expect(video).toBeVisible();
    // Once hydration settles the locale the element remounts (`key={locale}` above).
    // Grabbing it earlier detaches the handle, so wait until it has settled.
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
    expect(info.currentSrc, '영상 소스가 하나도 로드되지 않았다').not.toBe('');
    expect(info.poster, '포스터가 비어 있다').not.toBe('');

    expect(info.currentSrc, `${tag} 페이지가 다른 로케일 영상을 튼다`).toContain(
      `atlas-tour.${tag}.`,
    );
    expect(info.poster, `${tag} 페이지가 다른 로케일 포스터를 쓴다`).toContain(
      `atlas-tour.${tag}-poster`,
    );
  });
}
