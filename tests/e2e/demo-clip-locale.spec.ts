import { expect, test } from '@playwright/test';

/**
 * **Does the Korean page play the Korean video?**
 *
 * Found on 2026-08-20 while measuring playback on `/ko/download/`: the `poster` was
 * `atlas-tour.ko-poster.png` while the `currentSrc` actually playing was
 * `atlas-tour.en.webm`. The cause is that `DemoStage`'s locale comes from
 * `document.documentElement.lang` and **its server snapshot is `'en'`** — the first
 * paint ships English assets, and although React swaps `poster` and `<source>` to
 * Korean during hydration, **a `<video>` does not re-select its source because its
 * children changed.**
 *
 * **Why e2e rather than a contract test.** This defect **leaves no value in the
 * code**. `demoSources(clip, 'ko')` always returns the correct Korean paths and the
 * JSX uses them verbatim. What is wrong is the interaction with the HTML rule for
 * *when a browser re-selects a source*, and there is no way to see it other than
 * reading `currentSrc` after it has actually loaded.
 *
 * **Evidence it is not idling.** For both locales it first asserts that a video
 * element was found and a source really loaded. Without that, deleting the whole demo
 * section would still be green.
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
