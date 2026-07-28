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
  'app-settings-panel-out',
  'app-settings-scrim-out',
  'settings-view-push-in',
  'settings-view-pop-in',
  'map-overlay-in',
  'map-overlay-out',
  'overlay-spring-scrim',
  'topology-chrome-in',
  'topology-chrome-out',
  'rail-status-dot-in',
  // 2026-07-28 프레임 실측으로 추가 — **목록에 없어서 통과하고 있던 것들**.
  // 계약이 잡은 8종은 전부 실측을 통과했는데, 진짜 문제는 목록 밖에 있었다.
  // 목록이 곧 사정거리다.
  'app-toast',
  // 2026-07-28 UI 감사 — 가이드 투어. **첫 방문에 화면을 덮는 표면인데
  // 등록부 밖에 있었다.** 원인은 인라인 arbitrary `animate-[panelCrossfadeIn_…]`
  // 라 등록부가 가리킬 셀렉터 이름이 없었던 것 — 그래서 전역 kill 규칙만
  // 걸리고 동등물은 하나도 안 와, 감속 사용자에게 단계 전환이 통째로
  // 하드컷이었다. 이름 있는 클래스로 승격하면서 목록에 올린다.
  //
  // 컷아웃 링(`transition-[top,left,width,height]`)은 **일부러 안 넣는다** —
  // 그건 진짜 이동 축이라 감속에서 잘리는 것이 맞다. 동등물이 필요한 것은
  // 불투명도처럼 전정계를 안 건드리면서 정보를 나르는 축이다.
  'guided-tour-card-in',
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

/**
 * 동등물이 **CSS 밖**에 사는 표면. 클래스 이름 하나로는 못 잡고, 코드가
 * "감속 사용자에겐 다른 값을 쓴다" 고 말하는지를 본다.
 */
const TS = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('reduced-motion 동등물 계약', () => {
  const blocks = reducedMotionBlocks(CSS);
  const allRules = blocks.flatMap(rules);
  // reduced-motion 밖의 평소 규칙 — 등장 문법 자체를 검사할 때 쓴다.
  const allRulesOutsideReducedMotion = rules(
    blocks.reduce((css, block) => css.replace(block, ''), CSS),
  );

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
    //
    // opacity 전용 키프레임은 **방향별로 두 개**다: 등장은 `panelCrossfadeIn`,
    // 퇴장은 `overlayFadeOut`. 퇴장이 등장 이름을 재사용하면 같은 원소에서
    // 애니메이션이 재시작하지 않아 조용히 1프레임이 된다
    // (`exit-motion-restart.contract.test.ts`).
    for (const cls of [
      'topology-chrome-in',
      'topology-chrome-out',
      'app-settings-panel-in',
      'app-settings-panel-out',
      'settings-view-push-in',
      'settings-view-pop-in',
      'rail-status-dot-in',
    ]) {
      const matching = allRules.filter((r) =>
        r.selector.split(',').some((s) => new RegExp(`\\.${cls}(?![\\w-])`).test(s)),
      );
      expect(
        matching.some((r) => /animation-name:\s*(?:panelCrossfadeIn|overlayFadeOut)/.test(r.body)),
        `.${cls} 는 opacity 전용 키프레임으로 갈아타야 한다`,
      ).toBe(true);
    }
  });

  /**
   * D8 (2026-07-28) — 토스트는 벤더(sonner)가 자기 `@media
   * (prefers-reduced-motion)` 에서 `transition: none !important` 로 전부 끈다.
   * 실측 결과 **둘 중 나쁜 쪽만** 남았다: 알림의 도착이라는 정보 모션(불투명도)은
   * 1프레임에 사라지고, 53.5px 위치 점프는 그대로 남았다. 동등물은 그 반대여야
   * 한다 — 이동축을 출발점에서 없애고 불투명도에 시간을 돌려준다.
   */
  it('토스트 동등물은 흔들리는 축(--y)을 출발점에서 없앤다', () => {
    const toastRules = allRules.filter((r) => r.selector.includes('.app-toast'));
    expect(
      toastRules.some((r) => /--y:\s*translateY\(0\)\s*!important/.test(r.body)),
      '감속 사용자에게 토스트가 여전히 자기 높이만큼 순간이동한다',
    ).toBe(true);
    // 벤더가 `!important` 로 끄므로 동등물도 `!important` + 더 높은 특이도라야
    // 이긴다. 특이도가 낮으면 규칙이 있어도 조용히 무력화된다.
    for (const rule of toastRules) {
      expect(
        rule.selector.includes('[data-sonner-toaster]'),
        '토스트 동등물의 특이도가 벤더 규칙보다 낮다 — 조용히 진다',
      ).toBe(true);
    }
  });

  /**
   * D7 (2026-07-28) — **WCAG 2.2 §2.3.3 은 사용자가 개시한 이동을 명시적으로
   * 예외**로 둔다. 이 앱의 최대 공간 모션(캔버스 카메라)은 그 예외를 무시하고
   * 휠/핀치/팬까지 스냅시켜, 감속 사용자에게 **뷰포트 전체가 한 프레임에
   * 순간이동**했다 — 대체하려던 400ms 이징보다 전정계에 더 나쁘다.
   * 갈래는 둘이어야 한다: 손이 미는 것은 시간을 지키고, 앱이 데려가는 것만
   * 도착한다.
   */
  it('캔버스 카메라의 reduced-motion 스냅은 앱 개시 이동에만 걸린다', () => {
    const step = TS('src/widgets/topology-map-v2/ui/topology-physics-step.ts');
    expect(
      /if \(!freezeCamera && reducedMotion && !userDrivenCamera\)/.test(step),
      '카메라 스냅이 사용자 개시 이동까지 자른다 (WCAG 2.3.3 예외 침범)',
    ).toBe(true);

    const handlers = TS('src/widgets/topology-map-v2/ui/topology-pointer-handlers.ts');
    expect(
      handlers.includes('userDrivenCameraRef'),
      '포인터 제스처가 사용자 개시 표시를 남기지 않는다',
    ).toBe(true);
    // 휠/핀치가 자기 자리에서 카메라를 통째로 스냅하던 두 지점 — 되살아나면
    // 위 게이트를 우회한다.
    expect(
      /reducedMotionRef\.current\) \{\s*cameraRef\.current = \{ x: \{ value: afterX/.test(handlers),
      '휠 줌이 다시 감속 사용자에게 순간이동한다',
    ).toBe(false);
  });

  /**
   * D12 (2026-07-28) — framer 로 그리는 시트는 CSS 전역 kill 규칙이 닿지 않아
   * **불투명도는 살고 기하만 잘리는** 절반 스왑이 된다(남길 축과 없앨 축이
   * 정확히 뒤바뀐 상태). 오버레이 3종이 이미 쓰는 동등물로 통일한다.
   */
  it('framer 오버레이는 감속 경로에서 공용 동등물을 탄다', () => {
    for (const rel of [
      'src/widgets/shortcut-sheet/ui/ShortcutSheet.tsx',
      'src/widgets/search-palette/ui/SearchPalette.tsx',
      'src/views/docs-vault/ui/parts/NewDocKindDialog.tsx',
    ]) {
      const src = TS(rel);
      expect(src.includes('OVERLAY_SPRING_REDUCED'), `${rel} 에 감속 동등물이 없다`).toBe(true);
    }
  });

  /**
   * 지도 크롬(노드 팝오버)의 **밝기와 이동은 다른 커브를 탄다** (2026-07-27
   * 프레임 실측). 둘을 한 키프레임에 묶어 두는 동안 이동용 expo-out 커브가
   * 불투명도까지 지배해 첫 프레임에 이미 46.7%, 3프레임(50ms)에 85.6% 였다 —
   * 사용자가 부른 목적물이 사실상 하드컷으로 나타났다. 분리 후 16.3% / 70.6%.
   *
   * 회귀는 조용하다(눈이 아니라 프레임이 잡는다). 그래서 구조를 못 박는다:
   * 등장/퇴장 키프레임에 `opacity` 가 다시 들어오면 여기서 걸린다.
   */
  describe('지도 크롬 등장 — 밝기와 이동의 커브 분리', () => {
    function keyframeBody(name: string): string {
      const at = CSS.indexOf(`@keyframes ${name}`);
      expect(at, `@keyframes ${name} 가 없다`).toBeGreaterThan(-1);
      const open = CSS.indexOf('{', at);
      let depth = 0;
      let i = open;
      for (; i < CSS.length; i += 1) {
        if (CSS[i] === '{') depth += 1;
        else if (CSS[i] === '}') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      return CSS.slice(open + 1, i);
    }

    for (const name of ['topologyChromeIn', 'topologyChromeOut']) {
      it(`${name} 은 이동만 담는다 — opacity 를 다시 묶지 않는다`, () => {
        expect(/opacity\s*:/.test(keyframeBody(name))).toBe(false);
      });
    }

    for (const cls of ['topology-chrome-in', 'topology-chrome-out']) {
      it(`.${cls} 의 밝기는 앱 공통 램프(--motion-fast · --motion-ease)를 탄다`, () => {
        const rule = allRulesOutsideReducedMotion.find((r) =>
          r.selector.split(',').some((s) => new RegExp(`\\.${cls}(?![\\w-])`).test(s)),
        );
        expect(rule, `.${cls} 규칙이 없다`).toBeTruthy();
        // 등장은 `panelCrossfadeIn`, 퇴장은 `overlayFadeOut` — 둘 다 opacity
        // 전용이고 같은 램프를 탄다. 이름이 갈리는 이유는 위 참조.
        expect(rule!.body).toMatch(/panelCrossfadeIn|overlayFadeOut/);
        expect(rule!.body).toContain('var(--motion-fast)');
        expect(rule!.body).toContain('var(--motion-ease)');
      });
    }
  });
});
