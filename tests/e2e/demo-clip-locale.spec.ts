import { expect, test } from '@playwright/test';

/**
 * **한국어 페이지가 한국어 영상을 트는가.**
 *
 * 2026-08-20, `/ko/download/` 에서 재생을 계측하다 발견: `poster` 는
 * `atlas-tour.ko-poster.png` 인데 실제로 재생되는 `currentSrc` 는
 * `atlas-tour.en.webm` 이었다. 원인은 `DemoStage` 의 로케일이
 * `document.documentElement.lang` 에서 오고 그 **서버 스냅숏이 `'en'`** 이라는
 * 것 — 첫 그림은 영어 자산으로 나가고, 수화 때 React 가 `poster` 와
 * `<source>` 를 한국어로 갈아 주지만 **`<video>` 는 자식이 바뀌었다고 소스를
 * 다시 고르지 않는다.**
 *
 * ## 왜 계약 테스트가 아니라 e2e 인가
 *
 * 이 결함은 **코드에 값으로 남지 않는다.** `demoSources(clip, 'ko')` 는
 * 언제나 올바른 한국어 경로를 돌려주고, JSX 도 그 값을 그대로 쓴다. 틀린 것은
 * 브라우저가 «언제 소스를 다시 고르는가» 라는 HTML 규칙과의 상호작용이라,
 * 실제로 로드된 뒤 `currentSrc` 를 읽는 것 말고는 볼 방법이 없다.
 *
 * ## 놀고 있지 않다는 증거
 *
 * 두 로케일 모두에서 «영상 요소를 찾았고 · 실제로 소스가 로드됐다» 를 먼저
 * 단언한다. 그러지 않으면 시연 절이 통째로 사라져도 초록이 된다.
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
    // 수화가 로케일을 확정하면 요소가 새로 마운트된다(위 `key={locale}`).
    // 그 전에 붙잡으면 핸들이 떨어져 나가므로, 확정된 뒤를 기다린다.
    await expect(video).toHaveAttribute('poster', new RegExp(`atlas-tour\\.${tag}-poster`));
    await video.scrollIntoViewIfNeeded();

    const info = await video.evaluate(async (el: HTMLVideoElement) => {
      el.muted = true;
      await el.play().catch(() => undefined);
      // 소스가 실제로 선택될 때까지 기다린다 — preload="none" 이라 재생 전에는
      // currentSrc 가 비어 있다.
      for (let i = 0; i < 60 && !el.currentSrc; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return { currentSrc: el.currentSrc, poster: el.poster, readyState: el.readyState };
    });

    // 놀고 있지 않다는 증거: 소스가 실제로 골라졌다.
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
