import { describe, expect, it } from 'vitest';
import { readGlobalCss } from '../../../scripts/lib/design/global-css.mjs';

/**
 * Exit motion must actually play. Where only the class changes on one element, an unchanged
 * `animation-name` does not restart, and a finished animation with `reverse` and `both` shows its end
 * state at once. Pinned structurally: an exit plays forward under its own name.
 */
const CSS = readGlobalCss();

/** CSS with comments stripped, so explanatory sentences are not mistaken for rules. */
const CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

describe('퇴장 모션 재시작 계약', () => {
  it('등장 키프레임을 reverse 로 되감는 퇴장 선언이 없다', () => {
    // The `animation: <entrance name> … reverse` pattern is banned outright. It does
    // work where the element remounts each time, but two idioms coexisting in one
    // file drop the next person into the same trap — exits use one idiom only.
    const offenders = [...CODE.matchAll(/animation[^;]*\breverse\b[^;]*;/g)].map((m) =>
      m[0].replace(/\s+/g, ' ').trim(),
    );
    expect(offenders, `퇴장이 조용히 1프레임이 될 수 있다:\n${offenders.join('\n')}`).toEqual([]);
  });

  /**
   * Derived from the CSS, not a hand list: a disappearing rule has `[data-state="closed"]` or a class
   * ending in `-out`, and its keyframe names are collected as found, so a new surface is covered from
   * the day it lands.
   */
  const definedKeyframes = new Set(
    [...CODE.matchAll(/@keyframes\s+([A-Za-z][\w-]*)/g)].map(([, name]) => name),
  );

  /**
   * ⚠️ One rule can use **more than one** animation — `.topology-chrome-out` really
   * does split movement (`topologyChromeOut`) from opacity (`overlayFadeOut`).
   * Reading only the first name misreports that rule as "does not disappear" (the
   * first version of this scanner did).
   */
  const namesIn = (body: string) =>
    [...body.matchAll(/[A-Za-z][\w-]*/g)].map(([w]) => w).filter((w) => definedKeyframes.has(w));

  const exitRules = [...CODE.matchAll(/([^{}]*(?:\[data-state="closed"\]|-out)\s*)\{([^}]*)\}/g)]
    .map(([, selector, body]) => ({
      selector: selector.trim().split('\n').pop()!.trim(),
      keyframes: /animation:/.test(body) ? namesIn(body) : [],
    }))
    .filter((rule) => rule.keyframes.length > 0);

  /** Names used by entrance rules — an exit reusing one of these will not restart. */
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
    // A drop means a rule disappeared or the scanner went blind.
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
      // Judged per rule — if **any one** of several animations disappears, that rule disappears.
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
