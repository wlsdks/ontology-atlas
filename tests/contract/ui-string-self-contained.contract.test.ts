import { describe, expect, it } from 'vitest';

import en from '../../messages/en.json';
import ko from '../../messages/ko.json';

/**
 * 화면 문구가 셸 변수를 쓰면, 그 변수는 **같은 칸(namespace) 안에서** 정의돼
 * 있어야 한다.
 *
 * ## 왜 (2026-08-17 실측)
 *
 * 「내 에이전트 연결」 카드가 이렇게 말하고 있었다:
 *
 *   "연결 확인은 터미널에서 node $ATLAS/cli/src/index.mjs mcp-verify."
 *
 * `$ATLAS` 가 무엇인지는 **다른 두 패널**(`projectPages.selector` ·
 * `atlasGit`)의 문자열에만 적혀 있었다. 이 카드만 보고 있던 사람은 그 줄을
 * 붙여넣고 실패한다 — 그리고 실패의 원인이 자기가 못 본 다른 화면에 있다는
 * 것을 알 방법이 없다. **막다른 안내는 안내가 없는 것보다 나쁘다.**
 *
 * ## 왜 「같은 문자열」이 아니라 「같은 칸」인가
 *
 * 켜기 전에 세어 봤다(로케일당 2건). 둘 중 하나는 정당했다 —
 * `projectPages.selector.nextSlotCliCommand` 는 `$ATLAS` 를 쓰지만 바로 옆
 * `projectPages.selector.cliPlaceholderHint` 가 `export ATLAS="…"` 를 알려
 * 준다. 같은 패널에서 나란히 읽히므로 막다른 길이 아니다.
 *
 * 「같은 문자열 안에 정의」로 걸면 그 정당한 짝이 걸려서, 규칙이 아니라
 * 소음이 된다. 판정 단위를 **칸**으로 두면 실제 결함 1건만 남는다.
 */

type Json = { [key: string]: string | Json };

function collectStrings(node: Json, path: string[], out: Map<string, string[]>) {
  for (const [key, value] of Object.entries(node)) {
    const next = [...path, key];
    if (typeof value === 'string') {
      // 「칸」은 그 문자열이 들어 있는 **부모 객체**다 — 화면에서 나란히
      // 읽히는 묶음이 정확히 그 단위다. 깊이를 숫자로 고정하면 얕은 칸에서는
      // 「같은 문자열 안에서만」으로 퇴화한다.
      const ns = path.join('.') || '(root)';
      const bucket = out.get(ns) ?? [];
      bucket.push(value);
      out.set(ns, bucket);
    } else {
      collectStrings(value, next, out);
    }
  }
}

/** `$NAME` 을 쓰면서 그 칸 어디에도 `NAME=` 이 없는 칸 이름들. */
export function danglingShellVars(messages: Json): string[] {
  const byNamespace = new Map<string, string[]>();
  collectStrings(messages, [], byNamespace);
  const dangling: string[] = [];
  for (const [ns, strings] of byNamespace) {
    const used = new Set<string>();
    for (const s of strings) {
      for (const match of s.matchAll(/\$([A-Z][A-Z0-9_]*)/g)) used.add(match[1]);
    }
    for (const name of used) {
      const defined = strings.some((s) => new RegExp(`\\b${name}\\s*=`).test(s));
      if (!defined) dangling.push(`${ns} ($${name})`);
    }
  }
  return dangling.sort();
}

describe('화면 문구는 스스로 완결한다 — 막다른 셸 변수 금지', () => {
  it.each([
    ['ko', ko],
    ['en', en],
  ])('%s: 셸 변수를 쓰면 같은 칸이 그 변수를 정의한다', (_locale, messages) => {
    expect(danglingShellVars(messages as unknown as Json)).toEqual([]);
  });

  it('검사가 헛돌고 있지 않다 — 실제로 걸릴 것을 세고 있는가', () => {
    // 심어 둔 결함은 잡고,
    expect(
      danglingShellVars({ card: { hint: 'run node $ATLAS/cli/src/index.mjs' } }),
    ).toEqual(['card ($ATLAS)']);
    // 깊이가 얕아도 같은 판정이어야 한다 — 예전 구현은 여기서 퇴화했다.
    expect(danglingShellVars({ hint: 'run node $ATLAS/x' })).toEqual(['(root) ($ATLAS)']);
    // 같은 칸에 정의가 있으면 통과한다 — 2026-08-17 실측의 정당한 짝이 이 모양이다.
    expect(
      danglingShellVars({
        card: { setup: 'export ATLAS="…"', hint: 'run node $ATLAS/cli/src/index.mjs' },
      }),
    ).toEqual([]);
  });

  it('두 로케일이 같은 규칙을 받는다 — 한쪽만 고치는 것이 기본값이 되지 않게', () => {
    const nsCount = (m: Json) => {
      const out = new Map<string, string[]>();
      collectStrings(m, [], out);
      return out.size;
    };
    expect(nsCount(ko as unknown as Json)).toBeGreaterThan(50);
    expect(nsCount(en as unknown as Json)).toBe(nsCount(ko as unknown as Json));
  });
});
