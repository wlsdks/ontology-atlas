import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Contract that exit motion **actually plays** (frame measurement 2026-07-28).
 *
 * Why: most exits in this app were written as "rewind the entrance keyframes with
 * `reverse`", which reads as correct. But where **only the class changes on the
 * same element** it does not play — a CSS animation whose `animation-name` is
 * unchanged does not restart when only duration or direction change, and because
 * the start time is unchanged an already-finished animation meeting `reverse` +
 * `both` is interpreted as being past its end, so it **immediately shows the
 * reverse playback's end state**.
 *
 * Measured (closing the node popover, 1512×853, 60fps rAF sampling): opacity
 * `1 → 0` in **one frame**, after which only transform moves
 * `1 → 0.9877 → 0.9829 → 0.9804` — an already-invisible element shrinking slowly.
 * The axis to keep and the axis to drop had been exactly swapped.
 *
 * This defect is caught **neither by eye nor by a value lint.** Duration and
 * easing are both tokens, and the declaration is syntactically complete. So it is
 * pinned structurally: an exit plays forward under its own name.
 */
const CSS = readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8');

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
   * ⚠️ **The hand-written list was deleted** (2026-08-11).
   *
   * This file used to name four exit classes and four exit keyframes and check only
   * those, so any surface not on the list was **silently outside the check** — the
   * dropdown (`.select-listbox[data-state="closed"]`, `select-unpop`) really was
   * missing, and nothing was watching that screen's open/close motion. Exactly the
   * discipline this repository already wrote down (`/gate-probe`): *"금지어 목록을
   * 사람이 손으로 관리하게 만들기 — 항목을 안 더하면 검사가 조용히 무력해진다"*
   * (making a person hand-maintain a banned list means the check quietly dies
   * whenever an entry is not added).
   *
   * Now it is **derived from the CSS**: a "disappearing rule" is one with
   * `[data-state="closed"]` or a class name ending in `-out`, and the keyframe names
   * it uses are collected as they are. A new surface is covered from the day it
   * lands.
   */
  /** Every defined keyframe name — used to decide which token inside `animation:` is the name. */
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
    // Measured 8 on 2026-08-11. A drop means either a rule disappeared or the scanner went blind.
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
