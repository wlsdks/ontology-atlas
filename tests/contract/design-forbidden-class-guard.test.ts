import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * 디자인 시스템 가드 — .claude/rules/forbidden.md / docs/DESIGN-SYSTEM.md
 * "Absolute rules (Don'ts)" 의 금지 Tailwind 패턴을 자동 차단한다. 지금까지
 * 사람 PR 리뷰에만 의존했는데(룰 본문 "위반은 PR 단계에서 반려된다"), 이 가드가
 * 회귀를 코드에서 즉시 잡는다.
 *
 * 차단 패턴 (모호하지 않은 것만):
 *   - backdrop-blur*  → glassmorphism 금지
 *   - hover:scale-*   → scale 기반 hover 금지
 *   - (from|via|to)-(pink|fuchsia|purple|violet|rose)-N → 보라/핑크 그라디언트 금지
 *
 * 주석(JSDoc `/* *​/`, 라인 `//`)은 스캔 전에 제거 — 룰을 설명하는 주석
 * (예: "glassmorphism(backdrop-blur) 금지") 이 거짓 양성이 되지 않게.
 * linear-gradient 에 var(--color-*) 토큰 스톱만 쓰는 subtle fade 는 금지 색
 * 스톱(pink/purple 등)이 없어 통과한다.
 *
 * NOTE: 이 주석에 arbitrary-value Tailwind 클래스(대괄호 형태)를 적지 말 것.
 * Tailwind v4 content 스캐너가 테스트 파일 주석에서도 클래스 후보를 추출해,
 * 잘못된 placeholder 가 globals.css 생성 CSS 를 깨뜨려 dev 500 을 낸다.
 */

const SCAN_DIRS = ['src', 'app'].map((d) => path.join(process.cwd(), d));

const FORBIDDEN_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: 'backdrop-blur (glassmorphism 금지)', re: /\bbackdrop-blur(-[a-z0-9]+)?\b/g },
  { name: 'hover:scale- (scale hover 금지)', re: /\bhover:scale-/g },
  {
    name: '보라/핑크 그라디언트 금지',
    re: /\b(?:from|via|to)-(?:pink|fuchsia|purple|violet|rose)-\d/g,
  },
];

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // 블록/JSDoc/JSX 주석
    .replace(/\/\/[^\n]*/g, ' '); // 라인 주석
}

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

describe('디자인 가드 — 금지 Tailwind 패턴', () => {
  it('backdrop-blur / hover:scale / 보라·핑크 그라디언트 클래스를 쓰지 않는다', () => {
    const files = SCAN_DIRS.flatMap((dir) => collectTsxFiles(dir));
    // 스캐너가 실제 트리를 돌았는지 보장.
    expect(files.length).toBeGreaterThan(20);

    const violations: string[] = [];
    for (const file of files) {
      const code = stripComments(readFileSync(file, 'utf8'));
      for (const { name, re } of FORBIDDEN_PATTERNS) {
        const matches = code.match(re);
        if (matches) {
          const rel = path.relative(process.cwd(), file);
          violations.push(`${rel}: ${name} → ${[...new Set(matches)].join(', ')}`);
        }
      }
    }

    expect(
      violations,
      `금지 디자인 패턴 사용:\n${violations.join('\n')}\n` +
        `→ docs/DESIGN-SYSTEM.md "Absolute rules (Don'ts)" 참고.`,
    ).toEqual([]);
  });
});
