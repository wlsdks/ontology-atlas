import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * reduced-motion 계약 가드 — `docs/DESIGN-SYSTEM.md` 의 *"끈 게 아니라 덜
 * 흔들리는 동등물"* 을 코드로 강제한다.
 *
 * 왜 필요한가: 이 계약은 문서에만 있었고, 실제로 지킨 셀렉터는 하나뿐이었다.
 * 나머지 표면은 전역 규칙(`animation-duration: 0.01ms`)이 그대로 잘라 하드컷이
 * 됐고, 아무도 몰랐다(2026-07-26 프레임 실측에서 발견). 규격을 문서에만 쓰면
 * 지켜지지 않는다 — `.claude/rules/design.md` "규격은 lint 로 강제된다".
 *
 * 검사하는 것:
 *  1. 전역 kill 규칙이 살아 있다 — 감사되지 않은 모션(무한 heartbeat, 장식
 *     흐름)의 안전망이라 지워지면 안 된다.
 *  2. 크로스페이드 계열의 각 클래스가 reduced-motion 블록 안에서 **0 이 아닌**
 *     duration 을 되찾는다.
 *  3. 동등물은 토큰으로만 시간을 되찾는다 — 리터럴 ms 재기입 금지.
 */

const CSS = readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8');

/**
 * 동등물이 있어야 하는 표면. 이 목록에 클래스를 넣으면 globals.css 에
 * carve-out 도 같이 넣어야 한다 — 그게 이 가드의 전부다.
 */
const EQUIVALENT_CLASSES = [
  'ai-row-disclosure-body',
  'insights-tab-crossfade',
  'insights-disclosure-in',
  'ai-row-swap',
  'agent-panel-stage-swap',
  'agent-next-step-in',
  'overlay-fade-only',
  'app-settings-scrim-in',
  'app-settings-panel-in',
  'settings-view-push-in',
  'settings-view-pop-in',
  'map-overlay-in',
  'overlay-spring-scrim',
  'topology-chrome-in',
  'topology-chrome-out',
  'rail-status-dot-in',
] as const;

/** `@media (prefers-reduced-motion: reduce) { … }` 블록 본문들 (중괄호 매칭). */
function reducedMotionBlocks(css: string): string[] {
  const blocks: string[] = [];
  const marker = '@media (prefers-reduced-motion: reduce)';
  let from = 0;
  for (;;) {
    const at = css.indexOf(marker, from);
    if (at === -1) break;
    const open = css.indexOf('{', at);
    if (open === -1) break;
    let depth = 0;
    let i = open;
    for (; i < css.length; i += 1) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    blocks.push(css.slice(open + 1, i));
    from = i + 1;
  }
  return blocks;
}

/** 블록 본문을 `{ selector, body }` 규칙 배열로 쪼갠다 (1단 깊이면 충분). */
function rules(block: string): Array<{ selector: string; body: string }> {
  const out: Array<{ selector: string; body: string }> = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    out.push({ selector: m[1].trim(), body: m[2] });
  }
  return out;
}

describe('reduced-motion 동등물 계약', () => {
  const blocks = reducedMotionBlocks(CSS);
  const allRules = blocks.flatMap(rules);

  it('전역 kill 규칙(안전망)이 남아 있다', () => {
    const global = allRules.find((r) => /\*,?\s*\*::before/.test(r.selector.replace(/\s+/g, ' ')));
    expect(global, 'prefers-reduced-motion 전역 규칙이 사라졌다').toBeTruthy();
    expect(global!.body).toMatch(/animation-duration:\s*0\.01ms/);
  });

  for (const cls of EQUIVALENT_CLASSES) {
    it(`.${cls} 는 reduced-motion 에서도 시간을 갖는다 (하드컷 아님)`, () => {
      const matching = allRules.filter((r) =>
        r.selector.split(',').some((s) => new RegExp(`\\.${cls}(?![\\w-])`).test(s)),
      );
      expect(matching.length, `.${cls} 의 reduced-motion 동등물이 없다`).toBeGreaterThan(0);

      const timed = matching.filter((r) =>
        /(?:animation|transition)-duration:\s*(?:var\(|calc\()/.test(r.body),
      );
      expect(
        timed.length,
        `.${cls} 의 동등물이 duration 토큰을 되찾지 않는다 (하드컷으로 남음)`,
      ).toBeGreaterThan(0);

      for (const rule of timed) {
        expect(
          /(?:animation|transition)-duration:\s*\d/.test(rule.body),
          `.${cls} 동등물이 리터럴 ms 를 재기입했다 — 토큰만 쓴다`,
        ).toBe(false);
      }
    });
  }

  it('동등물은 흔들리는 축을 opacity 전용 키프레임으로 갈아탄다', () => {
    // transform 이 실린 등장(chrome-in/out · settings panel · rail dot)은
    // 키프레임 이름을 바꿔야 동등물이 된다 — 시간만 되돌리면 여전히 움직인다.
    for (const cls of [
      'topology-chrome-in',
      'topology-chrome-out',
      'app-settings-panel-in',
      'settings-view-push-in',
      'settings-view-pop-in',
      'rail-status-dot-in',
    ]) {
      const matching = allRules.filter((r) =>
        r.selector.split(',').some((s) => new RegExp(`\\.${cls}(?![\\w-])`).test(s)),
      );
      expect(
        matching.some((r) => /animation-name:\s*panelCrossfadeIn/.test(r.body)),
        `.${cls} 는 opacity 전용 키프레임으로 갈아타야 한다`,
      ).toBe(true);
    }
  });
});
