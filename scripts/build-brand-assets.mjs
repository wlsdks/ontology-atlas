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
const MICRO_CORE = 'M 256 168 L 332.2 212 L 332.2 300 L 256 344 L 179.8 300 L 179.8 212 Z';
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
      `<path d="${OUTER}" fill="none" stroke="${stroke}" stroke-width="44" stroke-linejoin="round"/>` +
      `<path d="${MICRO_CORE}" fill="${stroke}"/>`
    );
  }

  const isFull = detail === 'full';
  let out = defs;
  out += `<g fill="none" stroke="${stroke}" stroke-linejoin="round" stroke-linecap="round">`;
  out += `<path d="${OUTER}" stroke-width="${isFull ? 18 : 36}"/>`;
  if (isFull && withDash) {
    out += `<path d="${DASHED}" stroke-width="6" stroke-dasharray="0.1 16" stroke-opacity="0.62"/>`;
  }
  out += `<path d="${MID}" stroke-width="${isFull ? 13 : 28}"/>`;
  if (isFull) {
    out += `<path d="${CORE}" stroke-width="19"/>`;
    for (const [x1, y1, x2, y2] of SPOKES) {
      out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="13"/>`;
    }
  }
  out += '</g>';
  out += `<g fill="${stroke}">`;
  for (const [cx, cy] of NODES) {
    out += `<circle cx="${cx}" cy="${cy}" r="${isFull ? 23 : 42}"/>`;
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
 * 앱 아이콘 — 1024 캔버스 위 824 스쿼클(모서리 186) + 마크 81%.
 *
 * 마크가 판을 81% 채우는 것이 사양이다. 1차 구현은 64%였고 Dock 에서 "좀 작다"
 * 는 실보고를 받았다 — 아이콘의 여백은 취향이 아니라 OS 격자에 대한 비율이다.
 */
export function appIconSvg({ detail = 'full', withDash = true } = {}) {
  const SIZE = 1024;
  const PLATE = 824;
  const PLATE_XY = (SIZE - PLATE) / 2;
  const MARK = 664;
  const MARK_XY = (SIZE - MARK) / 2;
  const scale = MARK / V;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="Ontology Atlas">` +
    `<defs><linearGradient id="plate" gradientUnits="userSpaceOnUse" x1="0" y1="${PLATE_XY}" x2="0" y2="${PLATE_XY + PLATE}">` +
    `<stop offset="0" stop-color="#15182C"/><stop offset="1" stop-color="#06081A"/></linearGradient></defs>` +
    `<rect x="${PLATE_XY}" y="${PLATE_XY}" width="${PLATE}" height="${PLATE}" rx="186" ry="186" fill="url(#plate)"/>` +
    `<g transform="translate(${MARK_XY} ${MARK_XY}) scale(${scale})">${markBody(detail, { withDash })}</g>` +
    '</svg>\n'
  );
}

const write = (path, body) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
  return path;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const made = [
    write('public/brand-mark.svg', markSvg('full')),
    write('app/icon.svg', markSvg('micro', { paint: '#7F8BEA' })),
    write('.qa-scratch/brand/app-icon.svg', appIconSvg()),
    write('.qa-scratch/brand/app-icon-nodash.svg', appIconSvg({ withDash: false })),
    write('.qa-scratch/brand/compact.svg', appIconSvg({ detail: 'compact' })),
    write('.qa-scratch/brand/micro.svg', appIconSvg({ detail: 'micro' })),
  ];
  for (const p of made) console.log('wrote', p);
}
