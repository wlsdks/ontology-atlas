import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * 퇴장 모션이 **실제로 재생되는가** 를 지키는 계약 (2026-07-28 프레임 실측).
 *
 * 왜 필요한가: 이 앱의 퇴장은 대부분 "등장 키프레임을 `reverse` 로 되감기" 로
 * 적혀 있었고, 읽으면 맞아 보인다. 그런데 **같은 원소에서 클래스만 바뀌는**
 * 자리에서는 그게 재생되지 않는다 — CSS 애니메이션은 `animation-name` 이
 * 그대로면 duration/direction 만 바뀌어도 다시 시작하지 않고, 시작 시각이
 * 그대로라 이미 끝난 애니메이션은 `reverse` + `both` 를 만나는 순간 "끝난 뒤"
 * 단계로 해석돼 역재생의 **종료 상태를 즉시** 보여준다.
 *
 * 실측(노드 팝오버 닫기, 1512×853 60fps rAF 샘플): 불투명도 `1 → 0` **1프레임**,
 * 그 뒤로 transform 만 `1 → 0.9877 → 0.9829 → 0.9804` — 이미 보이지 않는 원소가
 * 천천히 줄어든다. 밝기와 이동 중 남길 축과 없앨 축이 정확히 뒤바뀐 상태였다.
 *
 * 이 결함은 **눈으로도 값 lint 로도 안 잡힌다.** duration 도 easing 도 토큰이고,
 * 선언은 문법적으로 완전하다. 그래서 구조로 못 박는다: 퇴장은 자기 이름으로
 * 앞으로 재생한다.
 */
const CSS = readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8');

/** 주석을 걷어낸 CSS — 주석 안의 설명 문장이 규칙으로 오인되지 않게. */
const CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

describe('퇴장 모션 재시작 계약', () => {
  it('등장 키프레임을 reverse 로 되감는 퇴장 선언이 없다', () => {
    // `animation: <등장이름> … reverse` 패턴 자체를 금지한다. 원소가 매번 새로
    // 마운트되는 자리에서는 동작하지만, 같은 파일 안에서 두 관용구가 공존하면
    // 다음 사람이 같은 함정에 다시 빠진다 — 퇴장은 하나의 관용구만 쓴다.
    const offenders = [...CODE.matchAll(/animation[^;]*\breverse\b[^;]*;/g)].map((m) =>
      m[0].replace(/\s+/g, ' ').trim(),
    );
    expect(offenders, `퇴장이 조용히 1프레임이 될 수 있다:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('퇴장 클래스는 퇴장 전용 키프레임을 쓴다', () => {
    // 퇴장 전용 이름 = 앞으로 재생해도 사라지는 방향인 것.
    const EXIT_KEYFRAMES = ['overlayFadeOut', 'settingsPanelOut', 'topologyChromeOut', 'overlaySpringOut'];
    const EXIT_CLASSES = [
      'map-overlay-out',
      'app-settings-panel-out',
      'app-settings-scrim-out',
      'topology-chrome-out',
    ];
    for (const cls of EXIT_CLASSES) {
      const at = CODE.indexOf(`.${cls} {`);
      expect(at, `.${cls} 규칙이 없다`).toBeGreaterThan(-1);
      const body = CODE.slice(at, CODE.indexOf('}', at));
      expect(
        EXIT_KEYFRAMES.some((name) => body.includes(name)),
        `.${cls} 가 퇴장 전용 키프레임을 쓰지 않는다 — 등장 이름 재사용은 재시작하지 않는다`,
      ).toBe(true);
    }
  });

  it('퇴장 전용 키프레임은 실제로 사라지는 방향이다', () => {
    for (const name of ['overlayFadeOut', 'settingsPanelOut']) {
      const at = CODE.indexOf(`@keyframes ${name}`);
      expect(at, `@keyframes ${name} 가 없다`).toBeGreaterThan(-1);
      const open = CODE.indexOf('{', at);
      let depth = 0;
      let i = open;
      for (; i < CODE.length; i += 1) {
        if (CODE[i] === '{') depth += 1;
        else if (CODE[i] === '}') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      const body = CODE.slice(open + 1, i);
      const from = body.slice(0, body.indexOf('to'));
      const to = body.slice(body.indexOf('to'));
      expect(/opacity:\s*1/.test(from), `${name} 의 from 이 불투명하지 않다`).toBe(true);
      expect(/opacity:\s*0/.test(to), `${name} 의 to 가 투명하지 않다`).toBe(true);
    }
  });
});
