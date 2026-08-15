/**
 * 정적(눌리지 않는) 표면 census — **장부와 게이트가 같은 함수로 센다.**
 *
 * 2026-08-15 에 하루 네 번 「손으로 적은 장부가 틀렸다」를 겪고 만든 모듈이다
 * (`/design-system-audit` 의 「장부는 스캐너가 뽑는다」 절). 래칫 계약과
 * census 리포트가 **이 파일 하나**를 부르므로, 장부는 실측에서 벗어날 수 없고
 * 「장부가 실측보다 후하다」는 양방향 검사가 뜻을 갖는다.
 *
 * 세는 대상은 두 갈래다:
 *
 * - **섹션 카드** — `<div>`/`<section>`/`<article>` 중 반경(card|panel)과 인셋을
 *   함께 가진 것. 「내용을 담는 상자」다.
 * - **정적 배지** — `<span>` 중 반경과 (인셋 또는 타입단)을 가진 것.
 *   상태 점(글자 없는 작은 원)은 배지가 아니라 신호 톤 규격의 것이라 뺀다.
 *
 * 공통 제외: 테스트 · `src/shared/ui/`(프리미티브 층은 네이티브 원소의 정당한
 * 집) · 값 층을 이미 거친 것(`badgeClass`/`controlClass`/`fieldClass`).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/** 주석 제거 — 줄 수는 보존한다(줄 번호 보고용). */
export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * 여는 태그를 **중괄호 깊이로** 끊는다. `>` 를 그냥 찾으면 `onClick={() => …}`
 * 의 화살표에서 잘린다 — 이 저장소가 두 번 밟은 함정이다.
 */
export function openingTag(source, from) {
  let depth = 0;
  let quote = null;
  for (let i = from; i < source.length; i += 1) {
    const c = source[i];
    if (quote) {
      if (c === quote && source[i - 1] !== '\\') quote = null;
    } else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0) return source.slice(from, i);
  }
  return source.slice(from, from + 2000);
}

const VALUE_LAYER = /badgeClass|controlClass|fieldClass/;

/** 정적 배지인가 — 값 층을 안 거치고 기하를 손으로 적은 `<span>`. */
export function isHandBadge(tag) {
  if (!/className=/.test(tag)) return false;
  if (VALUE_LAYER.test(tag)) return false;
  if (!/rounded-(micro|chip|full)\b/.test(tag)) return false;
  const hasInset = /\bp[xy]?-[0-9.]+/.test(tag);
  const hasType = /\btext-(caption|label|body)\b/.test(tag);
  return hasInset || hasType;
}

/** 섹션 카드인가 — 반경(card|panel)과 인셋을 함께 가진 컨테이너. */
export function isHandCard(tag) {
  if (!/className=/.test(tag)) return false;
  if (VALUE_LAYER.test(tag)) return false;
  if (!/rounded-(card|panel)\b/.test(tag)) return false;
  return /\bp[xy]?-[0-9.]+/.test(tag);
}

/**
 * 카드의 **다섯 축**을 뽑는다 — 체계석이 「축을 정하려면 이 결합 전수가 먼저」
 * 라고 요구한 그 다섯이다(표면 토큰 · 보더 · 반경 · 패딩 · 헤더 유무).
 * 헤더는 여는 태그만으로 못 보므로 **뒤따르는 본문**에서 구분선 있는 첫 자식을
 * 찾아 판정한다.
 */
export function cardAxes(tag, after) {
  const radius = (tag.match(/rounded-(card|panel)/) || [])[1];
  const surface = (tag.match(/bg-\[color:var\(--(?:color-)?([a-z0-9-]+)\)\]/) || [])[1] || 'none';
  const border = /\bborder\b/.test(tag)
    ? (tag.match(/border-\[color:var\(--color-([a-z0-9-]+)\)\]/) || [])[1] || 'default'
    : 'none';
  const px = (tag.match(/\bpx-([0-9.]+)/) || [])[1];
  const py = (tag.match(/\bpy-([0-9.]+)/) || [])[1];
  const p = (tag.match(/\bp-([0-9.]+)/) || [])[1];
  const pad = p ? `p-${p}` : `px-${px ?? '0'} py-${py ?? '0'}`;
  // 헤더 = 카드 안 첫 300자에 아래쪽 구분선을 가진 원소가 있는가.
  const header = /border-b\b/.test((after || '').slice(0, 300)) ? 'header' : 'plain';
  return { radius, surface, border, pad, header };
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue;
      walk(p, out);
      continue;
    }
    if (name.endsWith('.tsx') && !name.endsWith('.test.tsx')) out.push(p);
  }
  return out;
}

/**
 * @param {string} root 저장소 루트
 * @returns {{ badges: Map<string,number>, cards: Map<string,number>,
 *             cardCombos: Map<string,{count:number, sites:string[]}>, scanned: number }}
 */
export function censusStaticSurfaces(root = process.cwd()) {
  const badges = new Map();
  const cards = new Map();
  const cardCombos = new Map();
  let scanned = 0;

  for (const dir of ['src', 'app']) {
    for (const file of walk(path.join(root, dir))) {
      const rel = path.relative(root, file);
      scanned += 1;
      if (rel.startsWith(`src${path.sep}shared${path.sep}ui${path.sep}`)) continue;
      const source = stripComments(readFileSync(file, 'utf8'));

      for (const m of source.matchAll(/<span\b/g)) {
        if (isHandBadge(openingTag(source, m.index))) {
          badges.set(rel, (badges.get(rel) ?? 0) + 1);
        }
      }

      for (const m of source.matchAll(/<(div|section|article)\b/g)) {
        const tag = openingTag(source, m.index);
        if (!isHandCard(tag)) continue;
        cards.set(rel, (cards.get(rel) ?? 0) + 1);
        const axes = cardAxes(tag, source.slice(m.index + tag.length, m.index + tag.length + 300));
        const key = `${axes.radius} | ${axes.pad} | ${axes.surface} | ${axes.border} | ${axes.header}`;
        const line = source.slice(0, m.index).split('\n').length;
        const entry = cardCombos.get(key) ?? { count: 0, sites: [] };
        entry.count += 1;
        entry.sites.push(`${rel}:${line}`);
        cardCombos.set(key, entry);
      }
    }
  }
  return { badges, cards, cardCombos, scanned };
}

/** 장부로 붙여 넣을 형태 — 손으로 다듬지 않는다. */
export function ledgerLines(counts) {
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, count]) => `  ["${file.split(path.sep).join('/')}", ${count}],`)
    .join('\n');
}
