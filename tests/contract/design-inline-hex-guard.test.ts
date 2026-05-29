import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * 디자인 시스템 가드 — 컴포넌트 inline style 의 CSS 색 속성은 hardcoded hex 가
 * 아니라 토큰(var(--color-*))을 거쳐야 한다 (.claude/rules/design.md,
 * docs/DESIGN-SYSTEM.md "hardcoded hex 금지"). raw hex 를 inline style 에 박으면
 * 라이트/다크 토큰 전환을 우회해 모드 회귀가 난다 (cf. locale-redirect 회귀 fix).
 *
 * 탐지 범위: `style={{ ... }}` 안에서 색 관련 CSS 속성에 직접 #hex 를 대입하는
 * 패턴만. Sigma WebGL 팔레트(객체 key `amber: '#...'`)나 토큰 정의 파일은 CSS
 * 속성명 앵커에 걸리지 않아 자연히 제외된다. 주석 안의 hex(`// token #27a644`)도
 * 색 속성명이 앞에 없어 매칭되지 않는다.
 */

const SRC_DIR = path.join(process.cwd(), 'src');

const COLOR_PROPS = [
  'background',
  'backgroundColor',
  'color',
  'borderColor',
  'border',
  'borderTopColor',
  'borderBottomColor',
  'borderLeftColor',
  'borderRightColor',
  'fill',
  'stroke',
  'boxShadow',
  'outline',
  'outlineColor',
  'textDecorationColor',
  'caretColor',
  'textShadow',
];

// 예: `background: '#08090a'` / `boxShadow: '... #fff'`. 값 구분자(, ; } 줄바꿈)
// 전까지의 구간에 #hex 가 있으면 위반.
const HEX_IN_COLOR_PROP = new RegExp(
  `\\b(?:${COLOR_PROPS.join('|')})\\s*:\\s*[^,;}\\n]*#[0-9a-fA-F]{3,8}`,
  'g',
);

function collectTsxFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      collectTsxFiles(full, acc);
    } else if (/\.tsx$/.test(entry.name) && !/\.(test|spec)\.tsx$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

describe('디자인 토큰 가드 — inline style 에 raw hex 색 금지', () => {
  it('어떤 .tsx 도 색 CSS 속성에 hardcoded hex 를 inline 대입하지 않는다', () => {
    const files = collectTsxFiles(SRC_DIR);
    // 스캐너가 실제로 트리를 돌았는지 보장 (빈 글롭으로 거짓 통과 방지).
    expect(files.length).toBeGreaterThan(20);

    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const matches = source.match(HEX_IN_COLOR_PROP);
      if (matches) {
        const rel = path.relative(process.cwd(), file);
        for (const m of matches) violations.push(`${rel}: ${m.trim()}`);
      }
    }

    expect(
      violations,
      `inline style 에 토큰 대신 raw hex 를 쓴 곳:\n${violations.join('\n')}\n` +
        `→ var(--color-*) 토큰으로 교체하세요.`,
    ).toEqual([]);
  });
});
