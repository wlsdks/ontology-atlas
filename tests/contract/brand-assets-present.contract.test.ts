import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  lockupSvg,
  markSvg,
  monoIconSvg,
} from '../../scripts/build-brand-assets.mjs';

/**
 * 브랜드 자산이 **전부 있고, 전부 파이프라인이 만든 것**인지 잠근다.
 *
 * ## 이 게이트가 생긴 이유
 *
 * 2026-07-30 까지 `public/logo.png` 와 `public/og-image.png` 가 **폐기된 "A"
 * 로고**(노드로 그린 알파벳 A)를 달고 있었다. 마크를 두 번 갈아엎는 동안 그
 * 둘만 아무도 안 건드렸기 때문이다.
 *
 * og 카드는 링크 미리보기가 그리는 **유일한 그림**이라, 누가 이 제품을 공유할
 * 때마다 폐기된 브랜드가 나갔다. 그런데 타입 검사·lint·테스트 어느 것도 그것을
 * 볼 수 없었다 — PNG 는 코드가 아니라서다.
 *
 * ## 그래서 무엇을 재는가
 *
 * "그림이 맞나" 를 이미지 비교로 물으면 의존성이 필요하고 재생성마다 깨진다.
 * 대신 **구조적 불변식**을 잰다: 자산은 설치 계획서(`install-brand-icons.mjs`)가
 * 만든다 → 계획서에 없는 브랜드 래스터가 디스크에 있으면 그것이 다음에 썩을
 * 파일이다. 실제로 위 두 파일이 정확히 그 상태였다.
 */

const ROOT = join(import.meta.dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** PNG 헤더(IHDR)에서 폭·높이 — 이미지 의존성 없이 읽는다. */
function pngSize(relPath: string): { width: number; height: number } {
  const buf = readFileSync(join(ROOT, relPath));
  expect(buf.subarray(1, 4).toString('ascii'), `${relPath} 가 PNG 가 아니다`).toBe('PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('브랜드 자산 — 전부 있고, 전부 파이프라인이 만든 것이다', () => {
  /**
   * 생성기가 바로 만들 수 있는 SVG 는 **바이트로** 비교한다. 로크업은 브라우저가
   * 폰트를 심고 잉크를 재서 뷰박스를 좁히므로 여기서 제외하고 아래에서 따로 본다.
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
   * 로크업의 뷰박스는 **잉크에 맞춰져 있어야** 한다. 생성기의 추정 폭을 그대로
   * 두면 자산의 25%가 오른쪽 빈 공간이 되고(실측), 로고 파일의 여백은 그것을
   * 쓰는 모든 곳의 정렬을 틀리게 만든다.
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
    // 좁혀졌어야 한다 — 추정치와 같으면 래스터 단계를 건너뛴 것이다.
    expect(dw, `${path}: 뷰박스가 생성기 추정치 그대로다 — 래스터 단계를 안 돌렸다`).toBeLessThan(
      ew,
    );
    // 마크 말고 다른 것이 바뀌지 않았는지: 본문(텍스트/패스)은 같아야 한다.
    const strip = (s: string) => s.replace(/viewBox="[^"]*"/, '');
    expect(strip(onDisk).trim()).toBe(strip(estimated).trim());
  });

  /**
   * og 카드 크기는 `app/layout.tsx` 가 **선언한 값과 같아야 한다**. 전에는 선언이
   * 1200×630 인데 파일이 1536×1024 였다 — 비율이 1.905 vs 1.5 로 어긋나 크롤러가
   * 레터박스를 넣거나 잘라낸다.
   */
  it('og 카드가 layout.tsx 의 선언과 같은 크기다', () => {
    const layout = read('app/layout.tsx');
    const width = Number(layout.match(/url: '\/og-image\.png',\s*\n\s*width: (\d+)/)![1]);
    const height = Number(layout.match(/url: '\/og-image\.png',[\s\S]{0,80}?height: (\d+)/)![1]);
    expect(pngSize('public/og-image.png')).toEqual({ width, height });
  });

  /** 매니페스트가 선언한 PWA 아이콘 크기도 실제 파일과 같아야 한다. */
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
   * **계획서에 없는 브랜드 래스터는 다음에 썩을 파일이다.**
   *
   * `logo.png` / `og-image.png` 가 정확히 이 상태였다 — 디스크에 있고 화면에
   * 쓰이는데 어느 생성 계획에도 없어서, 마크를 두 번 갈아엎는 동안 아무도 손대지
   * 않았다.
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
