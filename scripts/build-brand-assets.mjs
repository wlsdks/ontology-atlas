/**
 * 브랜드 자산 생성기 — `src/shared/ui/brand-mark.tsx` 의 좌표에서 **전부** 파생한다.
 *
 * 자산이 여덟 군데(icns · ico · png 4종 · Windows 타일 · 파비콘 · 애플터치 ·
 * 마스터 SVG)에 흩어져 있는데, 각각을 손으로 만들면 다음 변경 때 반드시 몇 개가
 * 뒤처진다. 그래서 좌표 진실원은 컴포넌트 하나이고 이 스크립트가 나머지를 찍어낸다.
 *
 * 래스터는 브라우저(Chrome) 캔버스를 쓴다 — 저장소에 이미지 의존성을 새로 들이지
 * 않기 위해서다. 그래서 이 스크립트는 **SVG 만** 만들고, PNG/icns/ico 조립은
 * `scripts/build-brand-raster.mjs` 가 이어받는다.
 *
 * 사양 출처: `docs/DECISIONS.md` 「브랜드 마크 겹 육각형 집행 사양」.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const V = 512;
const OUTER = 'M 256 56 L 429.2 156 L 429.2 356 L 256 456 L 82.8 356 L 82.8 156 Z';
const DASHED = 'M 256 100 L 391.1 178 L 391.1 334 L 256 412 L 120.9 334 L 120.9 178 Z';
const MID = 'M 256 144 L 353 200 L 353 312 L 256 368 L 159 312 L 159 200 Z';
const CORE = 'M 256 208 L 297.6 232 L 297.6 280 L 256 304 L 214.4 280 L 214.4 232 Z';
const MICRO_CORE = 'M 256 152 L 346.1 204 L 346.1 308 L 256 360 L 165.9 308 L 165.9 204 Z';
const SPOKES = [
  [256, 56, 256, 144],
  [429.2, 356, 353, 312],
  [82.8, 356, 159, 312],
];
const NODES = [
  [256, 144],
  [353, 312],
  [159, 312],
];

/**
 * 획 두께 — `src/shared/ui/brand-mark.tsx` 의 `BRAND_STROKES` 와 **같아야 한다**.
 *
 * .mjs 는 .tsx 를 import 할 수 없어 값을 복제한다. 복제본은 반드시 어긋나므로
 * `tests/contract/brand-asset-parity.contract.test.ts` 가 두 쪽이 그린 SVG 를
 * 실제로 비교해 잠근다 — 값 비교가 아니라 **출력 비교**라, 값을 맞춰 놓고 다른
 * 데를 고치는 경우도 걸린다.
 */
export const STROKES = {
  outer: 18,
  dashed: 6,
  mid: 13,
  core: 19,
  spoke: 13,
  node: 23,
  compactOuter: 34,
  compactMid: 24,
  compactNode: 34,
  microOuter: 64,
};

/** 단색 브랜드 컬러 — 브랜드 시트 명기값. 컴포넌트의 `BRAND_MARK_SOLID` 와 같다. */
export const BRAND_SOLID = '#5E6AD2';

export const GRADIENT_FROM = '#787EF6';
export const GRADIENT_TO = '#3E4BDF';

/** 그라디언트는 userSpaceOnUse — 마크 바운딩박스 대각선을 따라 흐른다. */
const gradientDef = (id) =>
  `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="82.8" y1="56" x2="429.2" y2="456">` +
  `<stop offset="0" stop-color="${GRADIENT_FROM}"/><stop offset="1" stop-color="${GRADIENT_TO}"/>` +
  `</linearGradient></defs>`;

/**
 * @param {'full'|'compact'|'micro'} detail
 * @param {{ paint?: string, withDash?: boolean }} opts  paint 생략 시 그라디언트
 */
export function markBody(detail, { paint, withDash = true } = {}) {
  const id = 'atlasMark';
  const stroke = paint ?? `url(#${id})`;
  const defs = paint ? '' : gradientDef(id);

  if (detail === 'micro') {
    return (
      defs +
      `<path d="${OUTER}" fill="none" stroke="${stroke}" stroke-width="${STROKES.microOuter}" stroke-linejoin="round"/>` +
      `<path d="${MICRO_CORE}" fill="${stroke}"/>`
    );
  }

  const isFull = detail === 'full';
  let out = defs;
  out += `<g fill="none" stroke="${stroke}" stroke-linejoin="round" stroke-linecap="round">`;
  out += `<path d="${OUTER}" stroke-width="${isFull ? STROKES.outer : STROKES.compactOuter}"/>`;
  if (isFull && withDash) {
    out += `<path d="${DASHED}" stroke-width="${STROKES.dashed}" stroke-dasharray="0.1 16" stroke-opacity="0.62"/>`;
  }
  out += `<path d="${MID}" stroke-width="${isFull ? STROKES.mid : STROKES.compactMid}"/>`;
  if (isFull) {
    out += `<path d="${CORE}" stroke-width="${STROKES.core}"/>`;
    for (const [x1, y1, x2, y2] of SPOKES) {
      out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${STROKES.spoke}"/>`;
    }
  }
  out += '</g>';
  out += `<g fill="${stroke}">`;
  for (const [cx, cy] of NODES) {
    out += `<circle cx="${cx}" cy="${cy}" r="${isFull ? STROKES.node : STROKES.compactNode}"/>`;
  }
  out += '</g>';
  return out;
}

export function markSvg(detail, opts = {}) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${V} ${V}" role="img" aria-label="Ontology Atlas">` +
    markBody(detail, opts) +
    '</svg>\n'
  );
}

/**
 * 마크가 실제로 칠하는 잉크의 세로 길이(512 좌표계) — 바깥 육각형 + 획 절반.
 *
 * **뷰박스가 아니라 이것이 마크의 크기다.** 512 뷰박스 안에서 잉크는 세로 418
 * 밖에 안 되고(육각형이 세로로 400, 획이 ±9), 나머지 94 는 빈 여백이다. 그래서
 * 뷰박스를 판의 81% 로 맞추면 눈에 보이는 마크는 **65.8%** 가 된다 — 정확히
 * 그것이 1차 구현이 "좀 작다" 는 실보고를 받은 이유다.
 *
 * 잉크 높이는 detail 마다 다르다(축약형·미형은 획이 굵다). 높이를 기준으로
 * 재면 사다리 전체에서 **보이는 크기가 같게** 유지된다.
 */
const INK_HEIGHT = {
  full: 400 + STROKES.outer,
  compact: 400 + STROKES.compactOuter,
  micro: 400 + STROKES.microOuter,
};

/** 잉크 세로가 판에서 차지하는 비율 — 카운슬 집행 사양. */
const MARK_RATIO = 0.81;

/**
 * 앱 아이콘 — 1024 캔버스 위 824 스쿼클(모서리 186) + **잉크 기준** 마크 81%.
 *
 * 아이콘의 여백은 취향이 아니라 OS 격자에 대한 비율이다. 세로가 긴 육각형이라
 * 기준은 세로다 — 가로로 재면 세로가 판을 넘는다.
 */
export function appIconSvg({ detail = 'full', withDash = true } = {}) {
  const SIZE = 1024;
  const PLATE = 824;
  const PLATE_XY = (SIZE - PLATE) / 2;
  const scale = (PLATE * MARK_RATIO) / INK_HEIGHT[detail];
  // 잉크 중심은 뷰박스 중심(256,256)과 같다 — 캔버스 중심으로 보낸다.
  const t = SIZE / 2 - (V / 2) * scale;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="Ontology Atlas">` +
    `<defs><linearGradient id="plate" gradientUnits="userSpaceOnUse" x1="0" y1="${PLATE_XY}" x2="0" y2="${PLATE_XY + PLATE}">` +
    `<stop offset="0" stop-color="#15182C"/><stop offset="1" stop-color="#06081A"/></linearGradient></defs>` +
    `<rect x="${PLATE_XY}" y="${PLATE_XY}" width="${PLATE}" height="${PLATE}" rx="186" ry="186" fill="url(#plate)"/>` +
    `<g transform="translate(${t.toFixed(3)} ${t.toFixed(3)}) scale(${scale.toFixed(6)})">${markBody(detail, { withDash })}</g>` +
    '</svg>\n'
  );
}

/**
 * 단색(모노크롬) 아이콘 — 라이트/다크.
 *
 * 인쇄·워터마크·한 색만 쓸 수 있는 자리를 위한 것이다. 그라디언트를 빼면
 * **획이 유일한 정보 채널**이 되므로 사다리는 전체형을 쓰고, 판과 마크는 서로
 * 뒤집는다. 브랜드 인디고는 여기서 쓰지 않는다 — 단색의 요점이 색을 안 쓰는
 * 것이라, 인디고를 남기면 그건 단색이 아니라 그냥 다른 색 버전이다.
 */
export function monoIconSvg(tone = 'light') {
  const plate = tone === 'light' ? '#FFFFFF' : '#0A0B14';
  const ink = tone === 'light' ? '#0A0B14' : '#FFFFFF';
  const SIZE = 1024;
  const PLATE = 824;
  const XY = (SIZE - PLATE) / 2;
  const scale = (PLATE * MARK_RATIO) / INK_HEIGHT.full;
  const t = SIZE / 2 - (V / 2) * scale;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="Ontology Atlas">` +
    `<rect x="${XY}" y="${XY}" width="${PLATE}" height="${PLATE}" rx="186" ry="186" fill="${plate}"/>` +
    `<g transform="translate(${t.toFixed(3)} ${t.toFixed(3)}) scale(${scale.toFixed(6)})">` +
    markBody('full', { paint: ink }) +
    '</g></svg>\n'
  );
}

/**
 * 가로형 로고(lockup) — 마크 + 워드마크 + 태그라인.
 *
 * ## 비율은 마크의 **잉크**에서 나온다
 *
 * 마크의 잉크 높이를 1 로 두고 워드마크·태그라인·간격을 거기 맞춘다. 뷰박스에
 * 맞추면 마크만 작아 보인다 — 아이콘에서 겪은 것과 같은 함정이다.
 *
 * ## 텍스트를 패스로 굽지 않는 이유
 *
 * 글자를 아웃라인으로 바꾸려면 폰트 파서 의존성이 필요한데(`forbidden.md` —
 * 새 dependency 는 이유를 대야 한다), 이 자산 하나를 위해 들일 값이 아니다.
 * 대신 **둘 다 낸다**: 이 SVG 는 살아 있는 텍스트라 어디서나 열리고 편집되며,
 * 픽셀이 정확해야 하는 자리에는 브라우저가 진짜 폰트로 구운 PNG 를 쓴다.
 * 어느 쪽을 쓰는지는 `docs/BRAND.md` 가 정한다.
 */
export function lockupSvg({ tone = 'brand', tagline = true } = {}) {
  const ink =
    tone === 'light' ? '#0A0B14' : tone === 'dark' ? '#FFFFFF' : 'url(#atlasMark)';
  const wordFill = tone === 'brand' ? '#F2F3F8' : ink;
  const taglineFill = tone === 'brand' ? BRAND_SOLID : ink;

  // 잉크 높이 1 단위 = 96px. 비율은 **시트 픽셀 실측**이다 — 마크:워드마크 폰트
  // ≈ 2.9:1, 마크↔글자 간격 0.25. 초안이 2.4:1 로 읽고 워드마크를 29%, 간격을
  // 50% 키워 놨었다(fable 대조 검증 2026-07-30).
  const INK = 96;
  const scale = INK / INK_HEIGHT.full;
  const markW = (346.4 + STROKES.outer) * scale;
  const gap = INK * 0.25;
  const wordSize = INK * 0.33;
  const tagSize = INK * 0.185;
  const textX = markW + gap;
  const W = Math.round(textX + wordSize * 12);
  const H = Math.round(INK * (tagline ? 1.12 : 1));
  // 마크 잉크의 세로 중심을 로크업 중심에 맞춘다.
  const mt = H / 2 - (V / 2) * scale;
  const ml = -(82.8 - STROKES.outer / 2) * scale;
  const baseline = tagline ? H * 0.52 : H * 0.66;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ontology Atlas — Map your codebase knowledge.">` +
    `<g transform="translate(${ml.toFixed(2)} ${mt.toFixed(2)}) scale(${scale.toFixed(6)})">` +
    markBody('full', tone === 'brand' ? {} : { paint: ink }) +
    '</g>' +
    `<text x="${textX.toFixed(1)}" y="${baseline.toFixed(1)}" fill="${wordFill}" ` +
    `font-family="${FONT_STACK}" font-size="${wordSize.toFixed(1)}" font-weight="600" ` +
    `letter-spacing="-0.02em">Ontology Atlas</text>` +
    (tagline
      ? `<text x="${textX.toFixed(1)}" y="${(baseline + tagSize * 1.72).toFixed(1)}" fill="${taglineFill}" ` +
        `font-family="${FONT_STACK}" font-size="${tagSize.toFixed(1)}" font-weight="450">` +
        `Map your codebase knowledge.</text>`
      : '') +
    '</svg>\n'
  );
}

/**
 * OG 카드 — 링크 미리보기가 그리는 유일한 그림.
 *
 * 크기는 **`app/layout.tsx` 가 선언한 1200×630 그대로**다. 전에는 선언이
 * 1200×630 인데 파일이 1536×1024 여서 비율이 어긋나 있었다(1.905 vs 1.5) —
 * 크롤러가 레터박스를 넣거나 잘라낸다.
 *
 * 마크와 글자는 로크업과 같은 비율 체계를 쓰되, 이 카드는 **읽히는 거리가
 * 멀어서**(타임라인 썸네일) 태그라인을 한 단 키우고 마크를 크게 잡는다.
 */
export function ogImageSvg() {
  const W = 1200;
  const H = 630;
  const INK = 176;
  const scale = INK / INK_HEIGHT.full;
  const markW = (346.4 + STROKES.outer) * scale;
  const cx = W / 2;
  const wordSize = 82;
  const tagSize = 34;
  const markTop = H * 0.24;
  const mt = markTop - (56 - STROKES.outer / 2) * scale;
  const ml = cx - markW / 2 - (82.8 - STROKES.outer / 2) * scale;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ontology Atlas — Map your codebase knowledge.">` +
    `<rect width="${W}" height="${H}" fill="#08090A"/>` +
    `<g transform="translate(${ml.toFixed(2)} ${mt.toFixed(2)}) scale(${scale.toFixed(6)})">${markBody('full')}</g>` +
    `<text x="${cx}" y="${(markTop + INK + 108).toFixed(0)}" text-anchor="middle" fill="#F2F3F8" ` +
    `font-family="${FONT_STACK}" font-size="${wordSize}" font-weight="600" letter-spacing="-0.02em">Ontology Atlas</text>` +
    `<text x="${cx}" y="${(markTop + INK + 108 + tagSize * 1.85).toFixed(0)}" text-anchor="middle" fill="${BRAND_SOLID}" ` +
    `font-family="${FONT_STACK}" font-size="${tagSize}" font-weight="450">Map your codebase knowledge.</text>` +
    '</svg>\n'
  );
}

/** 앱이 쓰는 폰트와 같은 스택 — Pretendard 가 없는 환경은 시스템 산세리프로 내린다. */
const FONT_STACK =
  "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const write = (path, body) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
  return path;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const made = [
    write('public/brand-mark.svg', markSvg('full')),
    write('app/icon.svg', markSvg('micro', { paint: BRAND_SOLID })),
    write('.qa-scratch/brand/app-icon.svg', appIconSvg()),
    write('.qa-scratch/brand/app-icon-nodash.svg', appIconSvg({ withDash: false })),
    write('.qa-scratch/brand/compact.svg', appIconSvg({ detail: 'compact' })),
    write('.qa-scratch/brand/micro.svg', appIconSvg({ detail: 'micro' })),
    write('public/brand/mark.svg', markSvg('full')),
    write('public/brand/mark-mono.svg', markSvg('full', { paint: 'currentColor' })),
    write('public/brand/icon-mono-light.svg', monoIconSvg('light')),
    write('public/brand/icon-mono-dark.svg', monoIconSvg('dark')),
    write('public/brand/lockup.svg', lockupSvg()),
    write('public/brand/lockup-light.svg', lockupSvg({ tone: 'light' })),
    write('public/brand/lockup-dark.svg', lockupSvg({ tone: 'dark' })),
    write('public/brand/lockup-compact.svg', lockupSvg({ tagline: false })),
  ];
  for (const p of made) console.log('wrote', p);
}
