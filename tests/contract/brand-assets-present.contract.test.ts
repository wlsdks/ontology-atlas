import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  lockupSvg,
  markSvg,
  monoIconSvg,
} from '../../scripts/build-brand-assets.mjs';

/**
 * Locks that brand assets are **all present and all produced by the pipeline**.
 *
 * **Why this gate exists.** Until 2026-07-30, `public/logo.png` and
 * `public/og-image.png` still carried the **retired "A" logo** (an alphabet A drawn
 * from nodes), because those two alone went untouched across two mark overhauls.
 *
 * The og card is the **only image** a link preview draws, so every time someone
 * shared this product the retired brand went out with it. And nothing — type check,
 * lint, or tests — could see it, because a PNG is not code.
 *
 * **What is measured instead.** Asking "is this the right image" via image
 * comparison needs a dependency and breaks on every regeneration. Instead a
 * **structural invariant** is measured: assets are produced by the install plan
 * (`install-brand-icons.mjs`), so a brand raster on disk that the plan does not
 * produce is the next file to rot. The two files above were in exactly that state.
 */

const ROOT = join(import.meta.dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** Width and height from the PNG header (IHDR) — read without an image dependency. */
function pngSize(relPath: string): { width: number; height: number } {
  const buf = readFileSync(join(ROOT, relPath));
  expect(buf.subarray(1, 4).toString('ascii'), `${relPath} 가 PNG 가 아니다`).toBe('PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('브랜드 자산 — 전부 있고, 전부 파이프라인이 만든 것이다', () => {
  /**
   * SVGs the generator can emit directly are compared **byte for byte**. The lockup
   * is excluded here and checked separately below, because the browser embeds the
   * font and measures the ink to tighten its viewBox.
   */
  it.each([
    ['public/brand/mark.svg', () => markSvg('full')],
    ['public/brand/mark-mono.svg', () => markSvg('full', { paint: 'currentColor' })],
    ['public/brand/icon-mono-light.svg', () => monoIconSvg('light')],
    ['public/brand/icon-mono-dark.svg', () => monoIconSvg('dark')],
  ])('%s 가 생성기 출력과 일치한다', (path, make) => {
    expect(existsSync(join(ROOT, path)), `${path} 가 없다 — 파이프라인을 돌려라`).toBe(true);
    expect(read(path)).toBe(make());
  });

  /**
   * The lockup's viewBox must be **fitted to the ink**. Leaving the generator's
   * estimated width makes 25% of the asset empty space on the right (measured), and
   * padding inside a logo file misaligns every place that uses it.
   */
  it.each([
    ['public/brand/lockup.svg', () => lockupSvg()],
    ['public/brand/lockup-light.svg', () => lockupSvg({ tone: 'light' })],
    ['public/brand/lockup-dark.svg', () => lockupSvg({ tone: 'dark' })],
    ['public/brand/lockup-compact.svg', () => lockupSvg({ tagline: false })],
  ])('%s 의 뷰박스가 잉크에 맞춰져 있다 (브라우저 실측 반영)', (path, make) => {
    const onDisk = read(path);
    const estimated = make() as string;
    const box = (s: string) => s.match(/viewBox="([^"]*)"/)![1].split(' ').map(Number);
    const [, , dw] = box(onDisk);
    const [, , ew] = box(estimated);
    // It must have tightened — equal to the estimate means the raster step was
    // skipped.
    expect(dw, `${path}: 뷰박스가 생성기 추정치 그대로다 — 래스터 단계를 안 돌렸다`).toBeLessThan(
      ew,
    );
    // Nothing but the mark changed: the body (text/paths) must be identical.
    const strip = (s: string) => s.replace(/viewBox="[^"]*"/, '');
    expect(strip(onDisk).trim()).toBe(strip(estimated).trim());
  });

  /**
   * The og card's size must **equal what `app/layout.tsx` declares**. It previously
   * declared 1200×630 while the file was 1536×1024 — aspect ratios of 1.905 vs 1.5,
   * so crawlers letterbox or crop it.
   */
  it('og 카드가 layout.tsx 의 선언과 같은 크기다', () => {
    const layout = read('app/layout.tsx');
    const width = Number(layout.match(/url: '\/og-image\.png',\s*\n\s*width: (\d+)/)![1]);
    const height = Number(layout.match(/url: '\/og-image\.png',[\s\S]{0,80}?height: (\d+)/)![1]);
    expect(pngSize('public/og-image.png')).toEqual({ width, height });
  });

  /** The PWA icon sizes the manifest declares must match the real files too. */
  it('PWA 매니페스트 아이콘이 선언한 크기와 같다', () => {
    const manifest = JSON.parse(read('public/manifest.webmanifest')) as {
      icons: { src: string; sizes: string }[];
    };
    for (const icon of manifest.icons) {
      const [w, h] = icon.sizes.split('x').map(Number);
      expect(pngSize(`public${icon.src}`), `${icon.src} 크기 불일치`).toEqual({
        width: w,
        height: h,
      });
    }
  });

  /**
   * **A brand raster absent from the plan is the next file to rot.**
   *
   * `logo.png` and `og-image.png` were in exactly that state — on disk and used on
   * screen, but in no generation plan, so nobody touched them across two mark
   * overhauls.
   */
  it('src-tauri/icons 의 모든 PNG 가 설치 계획서에 있다', () => {
    const plan = read('scripts/install-brand-icons.mjs');
    const orphans = readdirSync(join(ROOT, 'src-tauri/icons'), { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.png'))
      .map((e) => `src-tauri/icons/${e.name}`)
      .filter((p) => !plan.includes(`'${p}'`));
    expect(orphans, '설치 계획서에 없는 아이콘 — 다음 브랜드 변경 때 여기가 썩는다').toEqual([]);
  });

  it('앱이 화면에 쓰는 브랜드 래스터가 전부 계획서에 있다', () => {
    const plan = read('scripts/install-brand-icons.mjs');
    for (const path of [
      'public/og-image.png',
      'public/logo.png',
      'public/brand-icon-512.png',
      'app/apple-icon.png',
    ]) {
      expect(existsSync(join(ROOT, path)), `${path} 가 없다`).toBe(true);
      expect(plan, `${path} 가 설치 계획서에 없다`).toContain(`'${path}'`);
    }
  });
});
