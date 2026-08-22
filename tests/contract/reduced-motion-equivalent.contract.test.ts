import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * reduced-motion contract gate — enforces `docs/DESIGN-SYSTEM.md`'s *"끈 게
 * 아니라 덜 흔들리는 동등물"* (not switched off, but a less-shaking equivalent) in
 * code.
 *
 * Why it is needed: the contract lived only in a document and exactly one selector
 * actually honoured it. Every other surface was cut by the global rule
 * (`animation-duration: 0.01ms`) into a hard cut, and nobody knew (found by frame
 * measurement, 2026-07-26). A spec written only in a document is not kept —
 * `.claude/rules/design.md`, "the spec is enforced by lint".
 *
 * What is checked:
 *  1. The global kill rule is alive — it is the safety net for unaudited motion
 *     (infinite heartbeats, decorative flows) and must not be deleted.
 *  2. Each crossfade-family class regains a **non-zero** duration inside the
 *     reduced-motion block.
 *  3. Equivalents regain time through tokens only — no literal ms rewrites.
 */

const CSS = readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8');

/**
 * **Deliberately stopped under reduced motion** — the reason is recorded here.
 *
 * ⚠️ This used to be inverted: a hand-written list of "surfaces that must have an
 * equivalent", checked in isolation. Under that shape **a surface missing from the
 * list is not a violation but nonexistent**, and five leaked out that way as
 * complete hard cuts for reduced-motion users (studio stage entry · support
 * picking · summary convergence · practice steps · route loading). The same thing
 * happened on 2026-07-28 and the comment then said *"목록이 곧 사정거리다"* (the
 * list is the reach) — but only the list's upkeep was fixed, while **the structure
 * that depends on a list** stayed.
 *
 * So it is inverted: candidates are **extracted from the CSS** (every class that
 * has an animation), and anything not mentioned in the reduced block must be
 * recorded here with its reason to pass. Creating a new surface defaults to
 * **red**.
 */
const INTENTIONALLY_STILL: Readonly<Record<string, string>> = {
  "agent-pending-dot": "끝없이 도는 맥박 — 감속의 뜻이 바로 이걸 멈추는 것이다. 상태는 옆의 글자가 말한다.",
  "overlay-spring-surface":
    "소비처가 감속일 때 `.overlay-fade-only` 로 **클래스를 갈아 끼운다**(GlobalSearch 실측). CSS carve-out 이 아니라 다른 경로로 이미 덮여 있다.",
  // Gateway landing (2026-08-18 remake). An endless caret blink is the same family
  // as an endless pulse on the first line — stopping exactly this is what reduced
  // motion means, and the terminal output itself shows every line immediately under
  // reduced motion (base-layer `.gateway-term-line` carve-out). The rest of the
  // gateway choreography (rise, headline, caption, hero stage) is transition-based
  // and therefore not a candidate for this scanner (which reads `animation:`); the
  // base-layer carve-out gives it the "always visible" equivalent —
  // gateway-fx-exception.contract.test.ts locks that carve-out's existence.
  "gateway-term-caret":
    "끝없는 캐럿 blink — 감속의 뜻이 이걸 멈추는 것이다. 줄 내용은 감속에서 전부 즉시 보인다.",
  // ── Two scroll timelines (2026-08-22) ───────────────────────────────────
  //
  // This scanner's model is "an animation driven by time must still have time under
  // reduced motion (no hard cuts)". These two sit outside that model — **time does
  // not drive them.** Their only input for progress is
  // `animation-timeline: view()`, i.e. scroll position, and no duration exists at
  // all (`auto`). There is nothing here to give a "short reduced-motion duration"
  // to.
  //
  // What happens under reduced motion is the evidence for this registration: **the
  // declaration does not exist.** Both live only inside
  // `@media (prefers-reduced-motion: no-preference)`, so for a reduced-motion user
  // the rule is never parsed and what remains is `.gateway-rise`'s rest state —
  // **everything visible from the start**. That is exactly the substitute the
  // gateway's other choreography gives under reduced motion (the base-layer
  // carve-out); what is lost is the entry order, and no information at all.
  //
  // ⚠️ This exemption stands on **one condition: being inside `no-preference`**. If
  // someone moves the declaration outside that media query the reason becomes false
  // at that moment — the test just below actually measures that condition, so moving
  // it turns red.
  "gateway-scroll-rise":
    "스크롤이 굴린다(view() 타임라인) — duration 이 없어 감속용 시간을 줄 대상이 없다. 감속에서는 선언 자체가 존재하지 않고 절은 처음부터 전부 보인다.",
  "gateway-scroll-stage":
    "같은 이유 — 무대(영상·지도·ACP 장면)의 스크롤 연동. 감속에서는 선언이 없고 무대는 처음부터 전부 보인다.",
};

/**
 * The reason for the two registrations above rests entirely on "they live only
 * inside `no-preference`". A reason recorded only in prose gives no signal when the
 * next person moves the declaration out, so the condition is **measured** here.
 */
const SCROLL_TIMELINE_CLASSES = ["gateway-scroll-rise", "gateway-scroll-stage"] as const;

/**
 * The surfaces that must actually carry an equivalent — **extracted from the
 * CSS** by `animatedClasses` below. There is no hand-written list any more.
 */

/** The bodies of `@media (prefers-reduced-motion: reduce) { … }` blocks (brace-matched). */
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

/** Splits a block body into `{ selector, body }` rules (one level of depth suffices). */
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
 * Surfaces whose equivalent lives **outside the CSS**. A class name alone cannot
 * catch these, so this checks whether the code says "use a different value for
 * reduced-motion users".
 */
const TS = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8');

/** CSS with comments stripped, so a class name inside a comment is not mistaken for a declaration. */
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

/** Every class that has an animation — this contract's **candidate list**, never hand-written. */
const animatedClasses = [
  ...new Set(
    [...CSS_CODE.matchAll(/\.([a-z0-9-]+)(?:\[[^\]]*\])?\s*\{[^}]*animation:/g)].map(([, cls]) => cls),
  ),
].sort();

describe('reduced-motion 동등물 계약', () => {
  const blocks = reducedMotionBlocks(CSS);
  const allRules = blocks.flatMap(rules);
  // The ordinary rules outside reduced-motion — used when checking the entry syntax itself.
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
    // Measured at 27 after the Studio-only motion was retired. A drop means the scanner has gone blind.
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

  /**
   * The two scroll timelines' exemption **stands on one condition**: the
   * declarations live only inside
   * `@media (prefers-reduced-motion: no-preference)`. Only then is the rule never
   * parsed for a reduced-motion user, leaving "everything visible from the start".
   * A condition recorded only in prose gives no signal when the next person moves it
   * out, so it is measured here.
   */
  it('스크롤 타임라인 안무는 no-preference 안에만 산다', () => {
    const marker = '@media (prefers-reduced-motion: no-preference)';
    const noPreferenceBlocks: string[] = [];
    for (let from = 0; ; ) {
      const at = CSS.indexOf(marker, from);
      if (at === -1) break;
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
      noPreferenceBlocks.push(CSS.slice(open + 1, i));
      from = i + 1;
    }
    expect(
      noPreferenceBlocks.length,
      'no-preference 블록이 하나도 없다 — 이 시험이 빈손으로 통과하고 있다',
    ).toBeGreaterThan(0);

    for (const cls of SCROLL_TIMELINE_CLASSES) {
      const selector = new RegExp(`\\.${cls}(?![\\w-])`);
      // Every occurrence of the declaration must be inside no-preference: the count
      // across the whole file must equal the count inside no-preference blocks.
      const total = [...CSS_CODE.matchAll(new RegExp(`\\.${cls}(?![\\w-])`, 'g'))].length;
      const inside = noPreferenceBlocks
        .map((block) => [...block.matchAll(new RegExp(`\\.${cls}(?![\\w-])`, 'g'))].length)
        .reduce((a, b) => a + b, 0);
      expect(total, `.${cls} 가 CSS 에 없다 — 죽은 면제다`).toBeGreaterThan(0);
      expect(
        inside,
        `.${cls} 의 선언 ${total}건 중 ${inside}건만 no-preference 안이다 — ` +
          `밖으로 샌 선언은 감속 사용자에게 그대로 적용된다. ` +
          `INTENTIONALLY_STILL 의 사유가 거짓이 됐으므로 되돌리거나 사유를 다시 써라.`,
      ).toBe(total);
      expect(selector.test(CSS_CODE), 'selector 정규식이 헛돌고 있다').toBe(true);
    }
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
    // Entries carrying a transform (chrome-in/out · settings panel · rail dot) become
    // equivalents only by swapping the keyframe name — restoring the duration alone
    // still moves them.
    //
    // The opacity-only keyframes come **in two, one per direction**: entry is
    // `panelCrossfadeIn`, exit is `overlayFadeOut`. If the exit reuses the entry's
    // name, the animation does not restart on the same element and silently collapses
    // to one frame
    // (`exit-motion-restart.contract.test.ts`).
    for (const cls of [
      'topology-chrome-in',
      'topology-chrome-out',
      'app-settings-panel-in',
      'app-settings-panel-out',
      'settings-view-push-in',
      'settings-view-pop-in',
      'rail-status-dot-in',
      // These entries/exits carry scaleY, so restoring the duration alone still moves them.
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
   * Composer growth, 2026-08-02 — **deliberately not in `EQUIVALENT_CLASSES`.**
   *
   * An equivalent is needed for axes that **carry information** without touching the
   * vestibular system, like opacity. An input growing from two lines to three is not
   * such an axis but **real movement**, like the cutout ring, so for a reduced-motion
   * user the right answer is **arriving instantly**, not a `swap` — and the global
   * kill rule (`transition-duration: 0.01ms`) already gives that answer, so a
   * carve-out would undo it.
   *
   * What is guarded here is therefore two things: ① the duration is a ramp token so
   * the global rule reaches it, and ② nobody slips a carve-out onto this surface.
   * This is the shape that keeps a decision recorded and checked even when it is
   * outside the registry (the cutout ring survived only as a comment, so the next
   * person could revert it).
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
   * D8 (2026-07-28) — for toasts, the vendor (sonner) switches everything off with
   * `transition: none !important` inside its own `@media (prefers-reduced-motion)`.
   * Measured, **only the worse of the two** survived: the informational motion of the
   * notification arriving (opacity) vanished in one frame while the 53.5px position
   * jump remained. The equivalent must be the reverse — remove the movement axis at
   * its origin and give the opacity its time back.
   */
  it('토스트 동등물은 흔들리는 축(--y)을 출발점에서 없앤다', () => {
    const toastRules = allRules.filter((r) => r.selector.includes('.app-toast'));
    expect(
      toastRules.some((r) => /--y:\s*translateY\(0\)\s*!important/.test(r.body)),
      '감속 사용자에게 토스트가 여전히 자기 높이만큼 순간이동한다',
    ).toBe(true);
    // The vendor switches it off with `!important`, so the equivalent wins only with
    // `!important` plus higher specificity. At lower specificity the rule exists but is
    // silently neutralised.
    for (const rule of toastRules) {
      expect(
        rule.selector.includes('[data-sonner-toaster]'),
        '토스트 동등물의 특이도가 벤더 규칙보다 낮다 — 조용히 진다',
      ).toBe(true);
    }
  });

  /**
   * D7 (2026-07-28) — **WCAG 2.2 §2.3.3 explicitly exempts user-initiated
   * movement.** This app's largest spatial motion (the canvas camera) ignored that
   * exemption and snapped wheel, pinch, and pan too, so for a reduced-motion user
   * **the whole viewport teleported in one frame** — worse for the vestibular system
   * than the 400ms easing it replaced. It must branch in two: what a hand pushes
   * keeps its time, and only what the app takes you to arrives instantly.
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
    // The two points where wheel/pinch snapped the whole camera in place — if they
    // come back they bypass the gate above.
    expect(
      /reducedMotionRef\.current\) \{\s*cameraRef\.current = \{ x: \{ value: afterX/.test(handlers),
      '휠 줌이 다시 감속 사용자에게 순간이동한다',
    ).toBe(false);
  });

  /**
   * D12 (2026-07-28) — sheets drawn by framer are out of reach of the CSS global
   * kill rule, producing a half swap where **opacity survives and only geometry is
   * cut** — exactly the wrong axis kept and the wrong axis removed. Unified onto the
   * equivalent the three overlays already use.
   */
  it('framer 오버레이는 감속 경로에서 공용 동등물을 탄다', () => {
    for (const rel of [
      'src/widgets/shortcut-sheet/ui/ShortcutSheet.tsx',
      'src/widgets/search-palette/ui/SearchPalette.tsx',
      // NewDocKindDialog became a consumer of the Dialog primitive on 2026-08-15 — the
      // framer reduced-motion equivalent is now carried by that one primitive.
      'src/shared/ui/dialog.tsx',
    ]) {
      const src = TS(rel);
      expect(src.includes('OVERLAY_SPRING_REDUCED'), `${rel} 에 감속 동등물이 없다`).toBe(true);
    }
  });

  /**
   * In map chrome (the node popover), **brightness and movement ride different
   * curves** (frame measurement, 2026-07-27). While both were bound into one
   * keyframe, the movement's expo-out curve also governed opacity: 46.7% on the first
   * frame and 85.6% by frame 3 (50ms) — the thing the user asked for appeared as
   * effectively a hard cut. After separating them: 16.3% / 70.6%.
   *
   * The regression is silent (frames catch it, eyes do not), so the structure is
   * pinned: if `opacity` returns to an entry/exit keyframe it is caught here.
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
        // Entry is `panelCrossfadeIn`, exit is `overlayFadeOut` — both opacity-only and
        // on the same ramp. The reason the names differ is above.
        expect(rule!.body).toMatch(/panelCrossfadeIn|overlayFadeOut/);
        expect(rule!.body).toContain('var(--motion-fast)');
        expect(rule!.body).toContain('var(--motion-ease)');
      });
    }
  });
});
