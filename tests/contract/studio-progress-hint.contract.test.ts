import { describe, expect, it } from 'vitest';

import en from '../../messages/en.json';
import ko from '../../messages/ko.json';

/**
 * **진행 힌트는 숫자가 이미 말한 것을 되풀이하지 않는다.**
 *
 * 공방 무대의 좌상단은 두 조각으로 한 줄을 만든다 —
 * `flowCount`(「4방향 중 1 채움」)과 `flowHint`(단계별 한마디). 힌트의 존재
 * 이유는 숫자가 **말하지 않는 것**을 말하는 것이다: 어디쯤 왔는지에 대한 판단
 * (「반쯤 왔어요」 · 「거의 다 됐어요」)이나 다음 행동(「여기서 시작해요」).
 *
 * ## 무엇이 났나 (2026-08-08 실측)
 *
 * 다섯 단계 중 `first` 하나가 **숫자를 그대로 되풀이**했다:
 *
 * ```
 * 4방향 중 1 채움 · 하나 채웠어요          (ko)
 * 1 of 4 directions filled · one filled in  (en)
 * ```
 *
 * 한 줄에서 같은 사실을 두 번 말한 것이다. 나머지 넷은 각자 새로운 것을
 * 말하므로 자리를 얻는다 — 문제는 «힌트가 있다» 가 아니라 «이 단계의 힌트가
 * 숫자의 사본» 이었다는 것이다. 같은 무대의 하단 바에도 같은 숫자가
 * (`bottomProgress`) 또 있어서, 그 화면에서 같은 사실이 세 가지 표현으로
 * 나왔다.
 *
 * ## 이 게이트가 잠그는 성질
 *
 * *어느 단계의 힌트도 셈을 다시 말하지 않는다.* 문장은 자유롭게 바꿔도 되고
 * 번역해도 된다 — 막는 것은 **숫자·수량어**가 힌트로 새어 드는 것뿐이다.
 * (`documentation.md`: 사람이 쓴 문장 하나를 못박지 않는다.)
 *
 * ⚠️ 「다 채웠어요 / all filled」는 예외로 둔다. 그것은 셈이 아니라 **완료
 * 상태**이고, 완료를 알리는 말에서 「다/all」을 뺄 수는 없다.
 */

type FlowNamespace = {
  flowCount: string;
  flowHint: Record<string, string>;
};

/** `flowHint` 를 가진 네임스페이스를 이름으로 찾지 않고 **구조로** 찾는다. */
function findFlowNamespace(node: unknown): FlowNamespace | null {
  if (!node || typeof node !== 'object') return null;
  const record = node as Record<string, unknown>;
  if (
    typeof record.flowCount === 'string' &&
    record.flowHint &&
    typeof record.flowHint === 'object'
  ) {
    return record as FlowNamespace;
  }
  for (const value of Object.values(record)) {
    const hit = findFlowNamespace(value);
    if (hit) return hit;
  }
  return null;
}

/**
 * 셈을 나르는 말 — 숫자, 한글 수량어, 영어 수량어.
 *
 * ⚠️ 영어 수량어에는 **단어 경계가 반드시 필요하다**. 처음엔 `one` 을 그냥
 * 넣었다가 정상 문구 「· almost d**one**」이 걸렸다 — 잘못 잰 숫자는 멀쩡한
 * 것을 결함이라 부른다. 한글은 조사가 붙어 경계를 쓸 수 없으므로, 대신 다른
 * 낱말에 흔히 박히는 「개」 같은 조각은 목록에서 빼고 셈에만 쓰이는 말
 * (채움 · 방향 · 하나 · 둘 · 셋 · 넷)만 본다.
 */
const COUNT_WORDS =
  /[0-9]|하나|둘|셋|넷|방향|채움|\b(?:one|two|three|four)\b|filled in/i;

/** 완료 상태는 셈이 아니다 — 이 단계만 면제한다. */
const COMPLETION_TIER = 'done';

describe('공방 진행 힌트는 셈을 되풀이하지 않는다', () => {
  for (const [locale, messages] of [
    ['ko', ko],
    ['en', en],
  ] as const) {
    const ns = findFlowNamespace(messages);

    it(`${locale} — flowCount 와 flowHint 를 실제로 찾았다 (없으면 이 시험이 공회전한다)`, () => {
      expect(ns, `${locale}: flowCount + flowHint 네임스페이스를 못 찾았다 — 게이트가 낡았다`).not.toBeNull();
      expect(Object.keys(ns?.flowHint ?? {}).length, '검사할 단계가 0개다').toBeGreaterThan(3);
    });

    it(`${locale} — 어느 단계도 셈을 다시 말하지 않는다`, () => {
      if (!ns) return;
      const offenders = Object.entries(ns.flowHint)
        .filter(([tier]) => tier !== COMPLETION_TIER)
        .filter(([, text]) => COUNT_WORDS.test(text))
        .map(([tier, text]) => `${tier}: "${text}"`);
      expect(
        offenders,
        `이 단계의 힌트가 「${ns.flowCount}」 이 이미 말한 셈을 되풀이한다 — ` +
          '힌트는 숫자가 말하지 않는 것(어디쯤 왔나 · 다음에 무엇을)만 말해야 한다.',
      ).toEqual([]);
    });

    /**
     * 계기가 살아 있는지 — 셈을 넣은 값은 정말 잡히고, 정상 문구는 통과하는가.
     * 이 프로브가 없으면 위 초록이 「깨끗해서」인지 「정규식이 아무것도 안 봐서」
     * 인지 갈리지 않는다.
     */
    it(`${locale} — 계기가 살아 있다`, () => {
      expect(COUNT_WORDS.test('· 하나 채웠어요')).toBe(true);
      expect(COUNT_WORDS.test('· one filled in')).toBe(true);
      expect(COUNT_WORDS.test('· 반쯤 왔어요')).toBe(false);
      expect(COUNT_WORDS.test('· halfway there')).toBe(false);
      expect(COUNT_WORDS.test('· 시작했어요')).toBe(false);
      expect(COUNT_WORDS.test('· started')).toBe(false);
    });
  }
});
