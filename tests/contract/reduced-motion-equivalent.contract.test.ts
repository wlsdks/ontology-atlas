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
 * **일부러 감속에서 멈추는 것** — 이유를 여기 적는다.
 *
 * ⚠️ 종전에는 반대였다: 「동등물이 있어야 하는 표면」을 손으로 적어 두고 그것만 봤다.
 * 그러면 **목록에 없는 표면은 위반이 아니라 없는 것**이 되고, 실제로 다섯이 그렇게
 * 새어 나가 감속 사용자에게 통째로 하드컷이었다(공방 무대 등장 · 지지대 고르기 ·
 * 요약 수렴 · 연습 단계 · 라우트 로딩). 2026-07-28 에도 같은 일이 있었고 그때 주석에
 * *"목록이 곧 사정거리다"* 라고 적어 뒀는데, 목록을 유지하는 쪽을 고쳤을 뿐 **목록에
 * 의존하는 구조**는 그대로였다.
 *
 * 그래서 뒤집는다: 후보는 **CSS 에서 뽑아내고**(애니메이션을 가진 클래스 전부),
 * 감속 블록에서 언급되지 않은 것은 여기 이유와 함께 적혀야 통과한다. 새 표면을
 * 만들면 기본값이 **빨강**이다.
 */
const INTENTIONALLY_STILL: Readonly<Record<string, string>> = {
  "agent-pending-dot": "끝없이 도는 맥박 — 감속의 뜻이 바로 이걸 멈추는 것이다. 상태는 옆의 글자가 말한다.",
  "overlay-spring-surface":
    "소비처가 감속일 때 `.overlay-fade-only` 로 **클래스를 갈아 끼운다**(GlobalSearch 실측). CSS carve-out 이 아니라 다른 경로로 이미 덮여 있다.",
  // 관문 랜딩(2026-08-18 리메이크). 끝없는 캐럿 blink 는 첫 줄의 끝없는 맥박과
  // 같은 부류다 — 감속의 뜻이 바로 이걸 멈추는 것이고, 터미널 출력 자체는
  // 감속에서 전 줄이 즉시 보인다(base 레이어 `.gateway-term-line` carve-out).
  // 나머지 관문 안무(rise·헤드라인·캡션·히어로 무대)는 transition 기반이라 이
  // 스캐너(animation:)의 후보가 아니고, base 레이어 carve-out 이 「항상 보임」
  // 동등물을 준다 — gateway-fx-exception.contract.test.ts 가 그 존재를 잠근다.
  "gateway-term-caret":
    "끝없는 캐럿 blink — 감속의 뜻이 이걸 멈추는 것이다. 줄 내용은 감속에서 전부 즉시 보인다.",
};

/**
 * 동등물이 실제로 붙어 있어야 하는 표면 — **CSS 에서 뽑아낸다.**
 * (아래 `animatedClasses` 로 계산한다. 손으로 적는 목록은 더 이상 없다.)
 */

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

/** 주석을 걷어낸 CSS — 주석 안의 클래스 이름이 선언으로 오인되지 않게. */
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

/** 애니메이션을 가진 클래스 전부 — 이 계약의 **후보 목록**이고 손으로 적지 않는다. */
const animatedClasses = [
  ...new Set(
    [...CSS_CODE.matchAll(/\.([a-z0-9-]+)(?:\[[^\]]*\])?\s*\{[^}]*animation:/g)].map(([, cls]) => cls),
  ),
].sort();

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

  const requiresEquivalent = animatedClasses.filter((cls) => !(cls in INTENTIONALLY_STILL));

  it('후보를 CSS 에서 실제로 뽑아냈다 — 빈손으로 통과하지 않는다', () => {
    // Studio 전용 모션 은퇴 뒤 실측 27개. 줄어들면 스캐너가 눈이 먼 것이다.
    expect(
      animatedClasses.length,
      `애니메이션 클래스를 ${animatedClasses.length}개만 찾았다 — 스캐너가 헛돈다`,
    ).toBeGreaterThanOrEqual(27);
    for (const cls of Object.keys(INTENTIONALLY_STILL)) {
      expect(
        animatedClasses,
        `.${cls} 는 면제 목록에 있는데 CSS 에 없다 — 죽은 면제는 틀린 정보다`,
      ).toContain(cls);
    }
  });

  it('감속 블록에서 언급되지 않은 표면은 이유가 적혀 있다', () => {
    const naked = animatedClasses.filter(
      (cls) =>
        !(cls in INTENTIONALLY_STILL) &&
        !blocks.some((block) => new RegExp(`\\.${cls}(?![\\w-])`).test(block)),
    );
    expect(
      naked,
      `감속 동등물도 없고 이유도 없다 — 감속 사용자에게 통째로 하드컷이다:\n${naked.join('\n')}\n` +
        `덮거나, INTENTIONALLY_STILL 에 이유를 적어라.`,
    ).toEqual([]);
  });

  for (const cls of requiresEquivalent) {
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
      // 목록은 scaleY 가 실린 등장/퇴장이라 시간만 되돌리면 여전히 움직인다.
      'select-listbox',
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
   * 2026-08-02 컴포저 자람 — **일부러 `EQUIVALENT_CLASSES` 에 넣지 않는다.**
   *
   * 동등물이 필요한 것은 불투명도처럼 전정계를 안 건드리면서 **정보를 나르는**
   * 축이다. 입력칸이 두 줄에서 세 줄로 자라는 것은 그런 축이 아니라 컷아웃
   * 링과 같은 **진짜 이동**이라, 감속 사용자에게는 `swap` 이 아니라 **즉시
   * 도착**이 정답이다 — 전역 kill 규칙(`transition-duration: 0.01ms`)이 그
   * 답을 이미 주고 있으므로 carve-out 을 만들면 오히려 되돌리는 셈이 된다.
   *
   * 그래서 이 자리에서 지키는 것은 둘이다: ① 시간이 램프 토큰이라 전역 규칙이
   * 닿는다 ② 아무도 이 표면에 carve-out 을 슬쩍 넣지 않는다. 등록부 밖에
   * 있어도 결정이 기록되고 검사되게 하는 형식이다(컷아웃 링은 주석으로만
   * 남아 있어 다음 사람이 되돌릴 수 있었다).
   */
  describe('컴포저 자람 — 감속에서는 즉시 도착', () => {
    const PANEL = 'src/widgets/vault-agent-panel/ui/VaultAgentPanel.tsx';

    it('자람의 시간은 표면 이동 램프 토큰이다 (리터럴 ms 0)', () => {
      const src = TS(PANEL);
      expect(src).toContain("transitionProperty: 'height'");
      expect(src).toContain("transitionDuration: 'var(--motion-base)'");
      expect(src).toContain("transitionTimingFunction: 'var(--motion-ease)'");
      expect(
        /transitionDuration:\s*['"`]\s*\d/.test(src),
        '컴포저 자람이 리터럴 ms 로 시간을 적었다 — 램프를 탄다',
      ).toBe(false);
    });

    it('감속 경로에 carve-out 이 없다 — 있으면 잘려야 할 이동이 되살아난다', () => {
      const carved = allRules.filter((rule) =>
        /vault-agent-input|agent-composer/.test(rule.selector),
      );
      expect(
        carved.map((rule) => rule.selector),
        '컴포저에 reduced-motion 동등물이 생겼다 — 이 축은 잘리는 것이 맞다',
      ).toEqual([]);
    });

    it('전역 kill 규칙이 transition 까지 덮는다 (그게 이 결정의 전제다)', () => {
      const global = allRules.find((r) =>
        /\*,?\s*\*::before/.test(r.selector.replace(/\s+/g, ' ')),
      );
      expect(global!.body).toMatch(/transition-duration:\s*0\.01ms/);
    });
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
      // NewDocKindDialog 는 2026-08-15 에 Dialog 프리미티브의 소비자가 됐다 —
      // framer 감속 동등물은 이제 프리미티브 한 곳이 진다.
      'src/shared/ui/dialog.tsx',
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
