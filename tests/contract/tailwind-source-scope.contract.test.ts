import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **Tailwind 는 코드만 훑는다 — 문서는 안 훑는다.**
 *
 * ## 왜 이 계약이 있나 (2026-08-04, 실제 사고)
 *
 * Tailwind v4 는 `@import "tailwindcss"` 만 쓰면 **저장소를 자동으로 훑는다.**
 * 그래서 `.md` 산문 안에 적힌 **클래스처럼 생긴 글자**까지 후보로 읽는다.
 *
 * 실제로 `.claude/rules/design.md` 가 규칙을 설명하며 적어 둔 `text-[var(…)]`
 * 한 줄이 `.text-\[var\(…\)\] { color: var(…) }` 를 만들었고, Turbopack 의 CSS
 * 파서가 그걸 거절해 **`pnpm dev` 가 통째로 500** 이 됐다.
 *
 * **가장 나쁜 부분은 이것이 조용했다는 것이다.** 프로덕션 빌드(`pnpm build`)는
 * 멀쩡했고 CI 는 초록이었다 — 깨지는 것은 로컬 개발 서버뿐이라 자동 검사가
 * 하나도 안 걸렸고, 다른 작업을 하던 에이전트가 우연히 부딪혀서야 드러났다.
 * 규칙을 설명하는 문서가 그 규칙을 쓰는 코드를 깨뜨린 것이다.
 *
 * ## 무엇을 막나
 *
 * 자동 탐지를 끄고(`source(none)`) 훑을 곳을 **코드로 한정**한다. 문서에 클래스
 * 예시를 적는 것은 앞으로도 옳고, 그것이 빌드에 새어 들어오지 않는 것도 옳다.
 *
 * ⚠️ **`source(none)` 을 지우면 자동 탐지가 되살아난다** — 그러면 이 사고가
 * 그대로 재발하고, 다시 CI 는 초록인 채 개발 서버만 죽는다. 그래서 여기서
 * 못박는다.
 */

const GLOBALS = join(process.cwd(), 'app/globals.css');

describe('Tailwind 소스 스캔 범위', () => {
  const css = readFileSync(GLOBALS, 'utf8');

  it('자동 탐지를 끈다 — 안 끄면 문서·산문까지 훑는다', () => {
    expect(
      /@import\s+"tailwindcss"\s+source\(none\)\s*;/.test(css),
      '`@import "tailwindcss" source(none);` 이어야 한다. `source(none)` 을 빼면 ' +
        'Tailwind 가 저장소를 자동으로 훑어 `.md` 산문 속 `text-[var(…)]` 같은 글자를 ' +
        '클래스로 만들고, Turbopack 이 그 CSS 를 거절해 `pnpm dev` 가 500 이 된다 ' +
        '(2026-08-04 실제 사고 — 프로덕션 빌드는 멀쩡해서 CI 가 못 잡았다).',
    ).toBe(true);
  });

  it('훑을 곳을 명시한다 — 코드만, 문서는 아니다', () => {
    const sources = [...css.matchAll(/@source\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(sources.length, '`source(none)` 을 켰으면 `@source` 로 코드를 등록해야 한다').toBeGreaterThan(0);

    // 훑는 곳에 문서가 섞이면 이 계약의 존재 이유가 사라진다.
    const docLike = sources.filter((s) => /\.md|docs\/|\.claude\/|\.agents\//.test(s));
    expect(
      docLike,
      `문서를 훑는 @source 가 있다: ${docLike.join(' · ')}. 산문 속 클래스 모양 글자가 ` +
        'CSS 가 되어 개발 서버를 깨뜨린다.',
    ).toEqual([]);

    // 코드가 빠지면 클래스가 조용히 사라진다 — 화면이 무너지는데 에러는 안 난다.
    for (const need of ['app/', 'src/']) {
      expect(
        sources.some((s) => s.includes(need)),
        `@source 에 ${need} 가 없다 — 그 아래 클래스가 CSS 에서 통째로 빠진다`,
      ).toBe(true);
    }
  });

  it('★ 이 계약이 빈 집합 위에서 놀지 않는다 — 문서에 실제로 그런 글자가 있다', () => {
    /*
     * 이 검사가 지키는 위험이 **오늘 실재하는지** 확인한다. 문서에서 클래스
     * 모양 글자가 하나도 없어지면 이 계약은 아무것도 안 막는 채로 초록이 된다 —
     * 그때는 이 단언이 빨개져서 「위험이 사라졌는지 다시 보라」고 말한다.
     */
    const design = readFileSync(join(process.cwd(), '.claude/rules/design.md'), 'utf8');
    const classLike = design.match(/[\w-]+-\[[^\]]+\]/g) ?? [];
    expect(
      classLike.length,
      '문서에 클래스 모양 글자가 하나도 없다. 그렇다면 이 계약이 막는 위험이 ' +
        '오늘 존재하지 않는 것이니, 계약을 지울지 다시 판단해라.',
    ).toBeGreaterThan(0);
  });
});
