/**
 * 구운 PNG 를 **소비처 여덟 군데**에 설치한다 — 파이프라인의 마지막 칸.
 *
 * 앞의 두 스크립트는 SVG 를 만들고(`build-brand-assets.mjs`) PNG 로 굽지만
 * (`build-brand-raster.mjs`), 정작 그것을 `src-tauri/icons/` 등에 놓는 일은
 * 1차 작업 때 **손으로** 했다. 그래서 파이프라인이 "좌표 하나에서 전부 파생"
 * 이라고 주장하면서 마지막 칸만 재현 불가였다 — 다음 사람이 아이콘을 고치면
 * 정확히 거기서 자산이 뒤처진다.
 *
 * 사용: `node scripts/build-brand-assets.mjs && node scripts/build-brand-raster.mjs`
 *       (브라우저로 여세요) 그 다음 `node scripts/install-brand-icons.mjs`
 *
 * ## icns 는 iconutil 에 맡기고, ico 는 손으로 쓴다
 *
 * macOS 는 `iconutil` 이 표준 도구라 `.iconset` 디렉터리만 올바르게 채우면
 * 된다. Windows ICO 는 사정이 다르다 — PIL 의 `append_images` 는 ICO 에서
 * **무시돼 프레임이 하나만 들어간다**(실측). 컨테이너가 단순하므로 직접 쓴다.
 *
 * ## @2x 는 다른 그림이 아니다
 *
 * `icon_16x16@2x` 는 16pt 를 레티나로 그린 것이라 **16pt 와 같은 그림**이어야
 * 한다. 여기에 축약형을 넣으면 같은 논리 크기에서 디스플레이에 따라 그림이
 * 바뀐다. 그래서 짝은 아래 표에서 art 를 공유한다.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';

const PNG = '.qa-scratch/brand/png';
const ICONSET = '.qa-scratch/brand/AtlasIcon.iconset';

const read = (name) => readFileSync(`${PNG}/${name}.png`);
const put = (path, buf) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buf);
  return path;
};

/** iconset — [파일명, 구운 PNG]. @2x 는 짝과 같은 art 를 쓴다. */
const ICONSET_PLAN = [
  ['icon_16x16', 'icon-16'],
  ['icon_16x16@2x', 'micro-32'],
  ['icon_32x32', 'icon-32'],
  ['icon_32x32@2x', 'compact-64'],
  ['icon_128x128', 'icon-128'],
  ['icon_128x128@2x', 'icon-256'],
  ['icon_256x256', 'icon-256'],
  ['icon_256x256@2x', 'icon-512'],
  ['icon_512x512', 'icon-512'],
  ['icon_512x512@2x', 'icon-1024'],
];

/** ICO 프레임 — 크기마다 다른 그림이 들어가는 것이 요점이다. */
const ICO_PLAN = [
  [16, 'icon-16'],
  [32, 'icon-32'],
  [48, 'icon-48'],
  [64, 'icon-64'],
  [128, 'icon-128'],
  [256, 'icon-256'],
];

/** 그 밖의 소비처 — [설치 경로, 구운 PNG]. */
const COPY_PLAN = [
  ['src-tauri/icons/icon.png', 'icon-1024'],
  ['src-tauri/icons/128x128@2x.png', 'icon-256'],
  ['src-tauri/icons/128x128.png', 'icon-128'],
  ['src-tauri/icons/64x64.png', 'icon-64'],
  ['src-tauri/icons/32x32.png', 'icon-32'],
  ['src-tauri/icons/Square310x310Logo.png', 'tile-310'],
  ['src-tauri/icons/Square284x284Logo.png', 'tile-284'],
  ['src-tauri/icons/Square150x150Logo.png', 'tile-150'],
  ['src-tauri/icons/Square142x142Logo.png', 'tile-142'],
  ['src-tauri/icons/Square107x107Logo.png', 'tile-107'],
  ['src-tauri/icons/Square89x89Logo.png', 'tile-89'],
  ['src-tauri/icons/Square71x71Logo.png', 'tile-71'],
  ['src-tauri/icons/Square44x44Logo.png', 'tile-44'],
  ['src-tauri/icons/Square30x30Logo.png', 'tile-30'],
  ['src-tauri/icons/StoreLogo.png', 'tile-50'],
  ['app/apple-icon.png', 'apple-180'],
  // 아래 셋은 **구 로고("A" 노드 그림)가 그대로 살아 있던 자리**다. og 카드는
  // 링크 미리보기가 그리는 유일한 그림이라, 공유될 때마다 폐기된 브랜드가 나갔다.
  ['public/og-image.png', 'og-image'],
  ['public/brand-icon-512.png', 'icon-512'],
  ['public/logo.png', 'icon-1024'],
  ['public/brand/icon-mono-light.png', 'icon-mono-light'],
  ['public/brand/icon-mono-dark.png', 'icon-mono-dark'],
  ['public/brand/lockup.png', 'lockup'],
  ['public/brand/lockup@2x.png', 'lockup@2x'],
  ['public/brand/lockup-light@2x.png', 'lockup-light@2x'],
  ['public/brand/lockup-dark@2x.png', 'lockup-dark@2x'],
];

/**
 * ICO 컨테이너 — 6바이트 헤더 + 프레임당 16바이트 디렉터리 + PNG 본문.
 * 폭/높이 256 은 0 으로 쓴다(1바이트 필드라 256 이 안 들어간다).
 */
function buildIco(frames) {
  const dir = Buffer.alloc(6 + frames.length * 16);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2); // type 1 = icon
  dir.writeUInt16LE(frames.length, 4);
  let offset = dir.length;
  frames.forEach(([size, buf], i) => {
    const e = 6 + i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, e);
    dir.writeUInt8(size >= 256 ? 0 : size, e + 1);
    dir.writeUInt8(0, e + 2); // 팔레트 없음
    dir.writeUInt8(0, e + 3);
    dir.writeUInt16LE(1, e + 4); // color planes
    dir.writeUInt16LE(32, e + 6); // bpp
    dir.writeUInt32LE(buf.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += buf.length;
  });
  return Buffer.concat([dir, ...frames.map(([, b]) => b)]);
}

const written = [];

rmSync(ICONSET, { recursive: true, force: true });
mkdirSync(ICONSET, { recursive: true });
for (const [name, src] of ICONSET_PLAN) writeFileSync(`${ICONSET}/${name}.png`, read(src));
execFileSync('iconutil', ['-c', 'icns', ICONSET, '-o', 'src-tauri/icons/icon.icns']);
written.push('src-tauri/icons/icon.icns');

written.push(put('src-tauri/icons/icon.ico', buildIco(ICO_PLAN.map(([s, n]) => [s, read(n)]))));
for (const [path, src] of COPY_PLAN) written.push(put(path, read(src)));

// 파비콘/마스터 SVG 는 `build-brand-assets.mjs` 가 이미 `app/icon.svg` 와
// `public/brand-mark.svg` 로 쓴다. 여기서 판 얹은 SVG 를 public 에 또 복사하지
// **않는다** — 소비처가 없는 자산은 규격이 아니라 오정보다.

console.log(`[brand-install] ${written.length}개 설치\n${written.map((p) => `  ${p}`).join('\n')}`);
