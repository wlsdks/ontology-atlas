import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { controlClass, fieldClass, type ControlShape, type FieldSize } from '@/shared/ui/control-class';

/**
 * 손가락 바닥(`.atlas-touch-floor`) 계약 — **레이어 밖에 있는가**.
 *
 * ## 이 게이트가 잡는 결함은 「규칙이 있는데 아무 일도 안 하는 것」이다
 *
 * 2026-08-05 에 실제로 밟았다. `controlClass` 는 컨트롤 높이를 Tailwind
 * 리터럴(`min-h-6`=24 · `min-h-8`=32 · `min-h-9`=36)로 내고 `--control-h-*` 를
 * 읽지 않는다. 그래서 `@media (pointer: coarse)` 안의 토큰 승격이 칩·행·pill 에
 * **하나도 안 닿았고**, 실측 44px 미만이 38곳이었다.
 *
 * 표식 클래스로 바닥을 깔았다. 규칙은 빌드된 CSS 에 **분명히 들어갔는데**
 * (`grep touch-floor` 로 확인) 계산된 `min-height` 는 그대로 32px 였다. 원인은
 * 명시도가 아니라 **캐스케이드 레이어**다:
 *
 * - Tailwind 유틸리티(`min-h-8`)는 `@layer utilities` 에 있다
 * - 처음 쓴 자리는 `@layer base` 안이었다
 * - **레이어 순서는 명시도를 이긴다** — 같은 한 클래스끼리 겨뤄도 나중 레이어가
 *   무조건 이긴다. `.atlas-touch-floor.atlas-touch-floor` 로 명시도를 올려도
 *   못 이긴다
 *
 * 레이어에 속하지 않은 규칙은 **모든 레이어를 이긴다**(CSS 캐스케이드). 그래서
 * 이 규칙은 파일 끝, 레이어 밖에 산다. `!important` 를 안 쓰는 이유이기도 하다.
 *
 * ## 왜 lint 로는 못 잡나
 *
 * `no-restricted-syntax` 는 한 파일의 **구문 트리**에서 패턴을 찾는 것이고,
 * CSS 는 그 사정거리 밖이다. 그리고 여기서 판정해야 하는 것은 값이 아니라
 * **그 규칙이 어느 블록 안에 중첩돼 있는가** 라는 구조다.
 *
 * ## 왜 e2e 만으로는 부족한가
 *
 * `tests/e2e/touch-target-contract.spec.ts` 가 실제 렌더를 재므로 이 결함도
 * 결국은 잡는다. 다만 그 검사는 라우트 3개에 한정돼 있고 브라우저가 필요하다.
 * 이 계약은 **원인을 직접** 못박아서, 다시 레이어 안으로 들어가는 순간 초록이
 * 아니라 빨강이 되게 한다.
 */

const ROOT = join(__dirname, '..', '..');
const CSS = readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8');
const CONTROL_CLASS_SRC = readFileSync(
  join(ROOT, 'src', 'shared', 'ui', 'control-class.ts'),
  'utf8',
);

const FLOOR_CLASS = 'atlas-touch-floor';

/**
 * `.atlas-touch-floor` 선언이 놓인 자리를 **여는 블록을 쌓아 가며** 찾는다.
 *
 * 정규식으로 «`@layer` 뒤에 나오나» 를 물으면 답이 안 나온다 — 이 파일에는
 * `@layer base { … }` 가 **닫힌 뒤에** 오는 규칙도 있고, 중첩도 세 겹까지 있다.
 * 여는 중괄호를 만날 때마다 그 앳룰 이름을 쌓고 닫을 때 빼면, 선언 시점의
 * 조상 목록이 그대로 나온다.
 */
function ancestorsOfFloorRule(css: string): string[] | null {
  const stack: string[] = [];
  let head = '';
  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    if (ch === '{') {
      const selector = head.trim().split('\n').pop()?.trim() ?? '';
      if (selector.includes(`.${FLOOR_CLASS}`)) return [...stack];
      stack.push(selector);
      head = '';
    } else if (ch === '}') {
      stack.pop();
      head = '';
    } else {
      head += ch;
    }
  }
  return null;
}

describe('손가락 바닥은 캐스케이드 레이어 밖에 산다', () => {
  const ancestors = ancestorsOfFloorRule(CSS);

  it(`\`.${FLOOR_CLASS}\` 규칙이 globals.css 에 실재한다`, () => {
    expect(ancestors, `.${FLOOR_CLASS} 선언을 못 찾았다`).not.toBeNull();
  });

  it('어떤 @layer 안에도 중첩돼 있지 않다 — 들어가는 순간 Tailwind 유틸리티에 진다', () => {
    const layered = (ancestors ?? []).filter((a) => a.startsWith('@layer'));
    expect(
      layered,
      `레이어 안으로 들어갔다: ${layered.join(' > ')}. ` +
        '레이어 순서는 명시도를 이기므로 min-h-8 이 그대로 이긴다.',
    ).toEqual([]);
  });

  it('`@media (pointer: coarse)` 안에만 있다 — 마우스에서는 규칙 자체가 안 만들어진다', () => {
    const coarse = (ancestors ?? []).filter((a) => a.includes('pointer: coarse'));
    expect(coarse.length, `조상: ${(ancestors ?? []).join(' > ')}`).toBe(1);
  });

  it('바닥값은 리터럴이 아니라 `--touch-target-min` 을 참조한다', () => {
    const rule = CSS.slice(CSS.indexOf(`.${FLOOR_CLASS} {`));
    const body = rule.slice(0, rule.indexOf('}'));
    expect(body).toMatch(/min-height:\s*var\(--touch-target-min\)/);
  });
});

/**
 * 표식이 **실제로 붙어 나오는가**. 클래스만 정의하고 아무도 안 달면 그 CSS 는
 * 규격이 아니라 죽은 줄이다 (`/gate-probe` §"빈 집합 위에서 도는 검출기").
 */
describe('값 층이 바닥을 실제로 내보낸다', () => {
  /** 자기 높이를 `min-h-*` 로 내는 모양 — 커져도 이웃을 밀어낼 뿐 겹치지 않는다. */
  // segment 는 2026-08-15 에 합류했다 — 세그먼트만 coarse 승격이 없어 같은
  // 시트에서 Choice 칩은 44, 세그먼트는 24 로 남는 「한 시트 두 규격」이
  // 재현되고 있었다(상호작용석 처방 P4 · 체계석 공동 서명).
  const FLOORED: ControlShape[] = ['chip', 'row', 'pill', 'segment'];

  /**
   * 바닥을 **주면 안 되는** 모양 둘. 이 단언이 이 파일에서 가장 중요하다 —
   * 「전부 44 로 올리면 되잖아」가 틀린 이유를 못박는다.
   *
   * - `link` — 문장 흐름 속의 링크다. 44px 바닥을 깔면 글줄 간격이 벌어져 글이
   *   찢어진다. WCAG 2.5.8 이 인라인 링크를 명시적으로 면제하는 이유다
   * - `icon` — 정사각 표면 계약이라 `min-h` 로는 모양이 안 선다. 보이는 상자는
   *   그대로 두고 히트만 넓히는 `touch-hit-expand` 가 그 자리를 맡는다
   */
  const NOT_FLOORED: ControlShape[] = ['link', 'icon'];

  it.each(FLOORED)('`%s` 는 바닥 표식을 낸다', (shape) => {
    expect(controlClass({ shape, size: 'md' })).toContain(FLOOR_CLASS);
  });

  it.each(NOT_FLOORED)('`%s` 는 바닥 표식을 내지 않는다', (shape) => {
    expect(controlClass({ shape, size: 'md' })).not.toContain(FLOOR_CLASS);
  });

  it('`icon` 은 대신 히트 확장을 낸다 — 면제가 아니라 다른 처방이다', () => {
    expect(controlClass({ shape: 'icon', size: 'md' })).toContain('touch-hit-expand');
  });

  /**
   * 공회전 방지. 위 단언들은 `controlClass` 를 실제로 돌리므로 이미 실물이지만,
   * 값 층이 표식을 **상수 한 곳**에서 내는지도 함께 잠근다 — 모양마다 문자열을
   * 손으로 적으면 다음에 추가되는 모양에서 하나가 빠진다(`DISABLED`·`FOCUS` 와
   * 같은 이유).
   */
  it('표식은 상수 하나에서 나온다 — 모양마다 손으로 적지 않는다', () => {
    const literal = CONTROL_CLASS_SRC.match(new RegExp(`'${FLOOR_CLASS}'`, 'g')) ?? [];
    expect(literal.length, '문자열이 여러 번 적혔다 — 상수로 모아라').toBe(1);
    expect(CONTROL_CLASS_SRC).toMatch(/const TOUCH_FLOOR =/);
  });
});

/**
 * 폼 필드도 같은 바닥을 쓴다 — 다만 **`boxed` 만**이다 (2026-08-06).
 *
 * `bare` 는 부모가 이미 상자를 낸 자리에 얹혀 산다. 거기에 44px 바닥을 깔면
 * 컨트롤이 **부모 상자를 안쪽에서 밀어낸다** — 검색 팔레트의 입력이 자기 상자를
 * 찢고 나오는 모양이 된다. 「위계」석 판정으로 조회 10곳은 전부 **결과가 주목
 * 승자**인 자리라, 입력이 커지면 위계까지 뒤집힌다.
 */
describe('폼 필드의 손가락 바닥', () => {
  const SIZES: FieldSize[] = ['xs', 'sm', 'md', 'lg'];

  it.each(SIZES)('boxed/%s 는 바닥 표식을 낸다', (size) => {
    expect(fieldClass({ frame: 'boxed', size })).toContain(FLOOR_CLASS);
  });

  it.each(SIZES)('bare/%s 는 바닥 표식을 내지 않는다 — 부모 상자를 밀어낸다', (size) => {
    expect(fieldClass({ frame: 'bare', size })).not.toContain(FLOOR_CLASS);
  });
});
