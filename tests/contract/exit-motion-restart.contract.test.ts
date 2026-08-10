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

  /**
   * ⚠️ **손으로 적은 목록을 지웠다** (2026-08-11).
   *
   * 종전에는 퇴장 클래스 넷과 퇴장 키프레임 넷을 이 파일에 적어 두고 그것만 봤다.
   * 그래서 목록에 없는 표면은 **조용히 검사 밖**이었다 — 실제로 드롭다운
   * (`.select-listbox[data-state="closed"]` · `select-unpop`)이 빠져 있었고, 그
   * 화면의 여닫는 움직임은 어떤 검사도 보고 있지 않았다. 이 저장소가 이미 적어 둔
   * 규율 그대로다(`/gate-probe`): *"금지어 목록을 사람이 손으로 관리하게 만들기 —
   * 항목을 안 더하면 검사가 조용히 무력해진다."*
   *
   * 이제 **CSS 에서 뽑아낸다**: 「사라지는 규칙」은 `[data-state="closed"]` 이거나
   * 클래스 이름이 `-out` 으로 끝나는 것이고, 거기 쓰인 키프레임 이름을 그대로
   * 모은다. 새 표면이 늘면 그날부터 검사가 그것도 본다.
   */
  /** 정의된 키프레임 이름 전부 — `animation:` 안의 어느 토큰이 이름인지 이것으로 가른다. */
  const definedKeyframes = new Set(
    [...CODE.matchAll(/@keyframes\s+([A-Za-z][\w-]*)/g)].map(([, name]) => name),
  );

  /**
   * ⚠️ 한 규칙이 애니메이션을 **둘 이상** 쓸 수 있다 — 실제로 `.topology-chrome-out` 은
   * 이동(`topologyChromeOut`)과 밝기(`overlayFadeOut`)를 갈라 둔다. 첫 이름만 보면
   * 그 규칙을 「사라지지 않는다」고 잘못 신고한다(이 스캐너의 첫 판이 그랬다).
   */
  const namesIn = (body: string) =>
    [...body.matchAll(/[A-Za-z][\w-]*/g)].map(([w]) => w).filter((w) => definedKeyframes.has(w));

  const exitRules = [...CODE.matchAll(/([^{}]*(?:\[data-state="closed"\]|-out)\s*)\{([^}]*)\}/g)]
    .map(([, selector, body]) => ({
      selector: selector.trim().split('\n').pop()!.trim(),
      keyframes: /animation:/.test(body) ? namesIn(body) : [],
    }))
    .filter((rule) => rule.keyframes.length > 0);

  /** 등장 규칙이 쓰는 이름 — 퇴장이 이 이름을 재사용하면 재시작하지 않는다. */
  const enterKeyframes = new Set(
    [...CODE.matchAll(/[^{}]*(?:\[data-state="open"\]|-in)\s*\{([^}]*)\}/g)]
      .flatMap(([, body]) => (/animation:/.test(body) ? namesIn(body) : [])),
  );

  const keyframeBody = (name: string) => {
    const at = CODE.indexOf(`@keyframes ${name}`);
    if (at < 0) return null;
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
    return CODE.slice(open + 1, i);
  };

  it('사라지는 규칙을 CSS 에서 실제로 찾아낸다 — 빈손으로 통과하지 않는다', () => {
    // 2026-08-11 실측 8개. 줄어들면 규칙이 사라진 것이거나 스캐너가 눈이 먼 것이다.
    expect(exitRules.length, `사라지는 규칙을 ${exitRules.length}개만 찾았다 — 스캐너가 헛돈다`).toBeGreaterThanOrEqual(6);
    expect(enterKeyframes.size, '등장 규칙을 하나도 못 찾았다').toBeGreaterThan(2);
  });

  it('사라지는 규칙은 등장 이름을 재사용하지 않는다', () => {
    const offenders = exitRules
      .flatMap((rule) =>
        rule.keyframes.filter((name) => enterKeyframes.has(name)).map((name) => `${rule.selector} → ${name}`),
      );
    expect(
      offenders,
      `등장 이름을 그대로 쓰면 같은 원소에서 애니메이션이 재시작하지 않는다:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('사라지는 키프레임은 실제로 사라지는 방향이다', () => {
    const offenders: string[] = [];
    for (const rule of exitRules) {
      // 규칙 단위로 판정한다 — 여러 애니메이션 중 **하나라도** 사라지면 그 규칙은 사라진다.
      let disappears = false;
      for (const name of rule.keyframes) {
        const body = keyframeBody(name);
        if (body === null) {
          offenders.push(`${rule.selector} → @keyframes ${name} 가 없다`);
          continue;
        }
        const split = body.indexOf('to');
        const to = split > -1 ? body.slice(split) : '';
        const fades = /opacity:\s*0(?:\D|$)/.test(to);
        const shrinks = /translate|scale/.test(to) && !/opacity:\s*1\s*;?\s*}?\s*$/.test(to);
        if (fades || shrinks) disappears = true;
      }
      if (!disappears) {
        offenders.push(`${rule.selector} → ${rule.keyframes.join(' + ')} 중 사라지는 것이 없다`);
      }
    }
    expect(offenders, `사라지는 방향이 아닌 퇴장:\n${offenders.join('\n')}`).toEqual([]);
  });
});
