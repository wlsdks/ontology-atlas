import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * 스타터 볼트 언어 게이트 — **모든** 생성 경로가 화면 언어로 볼트를 만든다.
 *
 * 흐름 점검 2026-07-26 D2: 한국어 화면의 "새 vault 만들기 → 빈 폴더로 새로
 * 시작" 이 영어 본문 스타터를 만들었다. 원인은 `scaffoldOntology()` 의 기본값
 * `'en'` 과, 그 기본값에 기대어 인자를 안 넘긴 두 경로였다. 같은 행동이 진입
 * 경로에 따라 다른 언어의 볼트를 만들면 사용자는 자기가 뭘 잘못했는지 알 수
 * 없다.
 *
 * 1차 방어는 타입이다 — `scaffoldOntology(starterLocale: string)` 은 기본값이
 * 없어 인자 누락이 컴파일에서 막힌다. 이 테스트는 2차 방어로 **하드코딩된
 * 로케일 문자열**을 막는다. 타입은 `scaffoldOntology('en')` 을 통과시키지만
 * 그것도 같은 결함이기 때문이다. 인자는 화면 언어를 나르는 식별자여야 한다.
 *
 * 스캔 대상은 호출부뿐 — 타입 선언(`scaffoldOntology: (starterLocale: string) =>`)
 * 과 정의(`const scaffoldOntology = useCallback(async (…)`)는 인자 자리에
 * 타입 주석이 있어 자연히 걸러진다.
 */

const SRC_DIR = path.join(process.cwd(), 'src');

/** `…scaffoldOntology(<args>)` 호출부. 선언/정의는 `.` 접두 요구로 제외. */
const SCAFFOLD_CALL = /\.scaffoldOntology\(([^)]*)\)/g;

/** 화면 언어를 나르는 식별자 (locale · activeLocale · starterLocale …). */
const LOCALE_IDENTIFIER = /^[A-Za-z_$][\w$.]*$/;

/** 주석은 호출부가 아니다 — 설명문의 `scaffoldOntology()` 언급을 걸러낸다. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      collectSourceFiles(full, acc);
    } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

describe('스타터 볼트 언어 — 생성 경로 전부가 화면 언어를 넘긴다', () => {
  it('어떤 scaffoldOntology 호출도 로케일을 빠뜨리거나 하드코딩하지 않는다', () => {
    const files = collectSourceFiles(SRC_DIR);
    expect(files.length).toBeGreaterThan(20);

    const callSites: string[] = [];
    const violations: string[] = [];
    for (const file of files) {
      const source = stripComments(readFileSync(file, 'utf8'));
      for (const match of source.matchAll(SCAFFOLD_CALL)) {
        const rel = path.relative(process.cwd(), file);
        const arg = match[1].trim();
        callSites.push(`${rel}: ${match[0]}`);
        if (!LOCALE_IDENTIFIER.test(arg)) {
          violations.push(`${rel}: ${match[0]}`);
        }
      }
    }

    // 스캐너가 실제 호출부를 봤는지 보장 — 리네임으로 조용히 0건이 되면
    // 게이트가 통과하는 게 아니라 실패해야 한다.
    expect(
      callSites.length,
      'scaffoldOntology 호출부를 하나도 못 찾았다 — 게이트가 무력화됐다.',
    ).toBeGreaterThanOrEqual(4);

    expect(
      violations,
      `스타터 로케일을 빠뜨렸거나 하드코딩한 곳:\n${violations.join('\n')}\n` +
        `→ 화면 언어(useLocale())를 넘기세요.`,
    ).toEqual([]);
  });
});
