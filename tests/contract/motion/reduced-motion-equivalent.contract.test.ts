import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { readGlobalCss } from '../../../scripts/lib/design/global-css.mjs';

/**
 * Enforces the reduced-motion contract of `docs/DESIGN-SYSTEM.md`: a less-shaking equivalent, not
 * switched off. The global kill rule is the safety net, crossfade classes regain non-zero time through
 * tokens only, and no literal ms rewrites.
 */

const CSS = readGlobalCss();

/**
 * Animated classes are extracted from the CSS; any not mentioned in the reduced block must be recorded
 * here with its reason, so a new surface defaults to red.
 */
const INTENTIONALLY_STILL: Readonly<Record<string, string>> = {
  "map-wait-orbit": "The loading scene's decorative orbit travel stops under reduced motion. The stationary planes, core, live status, and return action remain; map-navigation-wait.spec.ts checks every orbit's animation and transform.",
  "atlas-waiting-mark":
    "The native character remains visible beside the parent's unchanged status and Stop action; reduced motion removes the decorative frame steps and hops.",
  "atlas-mascot-sprite":
    "The stepped character frames stop. The final static READ or SUCCESS pose plus the same accessible status preserves the information.",
  "acp-working-shimmer":
    "Infinite band sweep shown only while an agent tool call, work group or turn is in flight, or while the analysis brief's sums are still being counted. Reduced motion stops the travel and removes the painted gradient, leaving the words in a still, brighter ink; the running ring, the present-tense outcome word and the ticking clock beside them carry the same fact, and on the brief the counting line says it in words while the list names the core still reading.",
  "agent-pending-dot":"an endless pulse, and stopping exactly that is what reduced motion means; the state is told by the adjacent text.",
  "architecture-observation-scan":
    "Infinite progress travel shown only during a real ACP turn. Reduced motion stops the line while the adjacent planning/editing/verifying/review-wait text preserves the current state.",
  "motion-work-spin":
    "Infinite arc rotation shown only while a WorkStatus step of unknown length runs. Reduced motion stops the arc in place; the step's label and the consumer's live region carry the same fact.",
  "motion-work-sweep":
    "Infinite travel shown only while a WorkProgress of unknown length runs. Reduced motion parks the bar left-anchored at a third of the track, claiming no scale; the consumer's label and count carry the fact.",
  "overlay-spring-surface":
    "When reduced, the consumer swaps the class to `.overlay-fade-only` (measured in GlobalSearch), so it is already covered by another path rather than a CSS carve-out.",
  // Driven by scroll position via `animation-timeline: view()`, with no duration to shorten. They live
  // only inside `no-preference`, so reduced-motion users see everything from the start. The exemption
  // holds only inside that media query, which the test below measures.
  "gateway-scroll-stage":
    "Driven by scroll (view() timeline); with no duration there is nothing to give a reduced time to. Under reduced motion the declaration does not exist at all and the stage (video, map, ACP scenes) is fully visible from the start.",
  // Each typed character firms up over `--motion-settle`, inside `no-preference` only; under reduced
  // motion the base-layer carve-out (`.gateway-type-ch { visibility: visible }`) shows it complete, so
  // no time axis is left to shorten. The condition is measured below with the scroll-timeline classes.
  "gateway-type-land":
    "Typing settle: under reduced motion there is no declaration and the sentence looks complete from the first frame (base-layer carve-out). There is no time axis to shorten.",
};

/**
 * The reason for the two registrations above rests entirely on "they live only
 * inside `no-preference`". A reason recorded only in prose gives no signal when the
 * next person moves the declaration out, so the condition is **measured** here.
 */
const SCROLL_TIMELINE_CLASSES = ["gateway-scroll-stage", "gateway-type-land"] as const;

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

describe('reduced-motion equivalent contract', () => {
  const blocks = reducedMotionBlocks(CSS);
  const allRules = blocks.flatMap(rules);
  // The ordinary rules outside reduced-motion — used when checking the entry syntax itself.
  const allRulesOutsideReducedMotion = rules(
    blocks.reduce((css, block) => css.replace(block, ''), CSS),
  );

  it('the global kill rule (safety net) remains', () => {
    const global = allRules.find((r) => /\*,?\s*\*::before/.test(r.selector.replace(/\s+/g, ' ')));
    expect(global, 'the global prefers-reduced-motion rule is gone').toBeTruthy();
    expect(global!.body).toMatch(/animation-duration:\s*0\.01ms/);
  });

  const requiresEquivalent = animatedClasses.filter((cls) => !(cls in INTENTIONALLY_STILL));

  it('the waiting character keeps its first native pose without animation or travel under reduced motion', () => {
    const waiting = allRules.filter((rule) => rule.selector.trim() === '.atlas-waiting-mark');
    expect(waiting).toHaveLength(1);
    expect(waiting[0].body).toMatch(/animation:\s*none\s*!important\s*;/);
    expect(waiting[0].body).toMatch(/background-position:\s*0 0\s*!important\s*;/);
    expect(waiting[0].body).toMatch(/transform:\s*none\s*!important\s*;/);
  });

  it('actually extracted the candidates from CSS, so it does not pass empty-handed', () => {
    // Floor so a drop means the scanner has gone blind.
    expect(
      animatedClasses.length,
      `found only ${animatedClasses.length} animation classes, so the scanner is spinning idle`,
    ).toBeGreaterThanOrEqual(27);
    for (const cls of Object.keys(INTENTIONALLY_STILL)) {
      expect(
        animatedClasses,
        `.${cls} is on the exemption list but not in CSS; a dead exemption is wrong information`,
      ).toContain(cls);
    }
  });

  it('a surface not mentioned in the reduced block has its reason written down', () => {
    const naked = animatedClasses.filter(
      (cls) =>
        !(cls in INTENTIONALLY_STILL) &&
        !blocks.some((block) => new RegExp(`\\.${cls}(?![\\w-])`).test(block)),
    );
    expect(
      naked,
      `No reduced-motion equivalent and no reason: for a reduced-motion user this is one whole hard cut:\n${naked.join('\n')}\n` +
        `Cover it, or give the reason in INTENTIONALLY_STILL.`,
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
  it('scroll-timeline choreography lives only inside no-preference', () => {
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
      'there is no no-preference block at all, so this test is passing empty-handed',
    ).toBeGreaterThan(0);

    for (const cls of SCROLL_TIMELINE_CLASSES) {
      const selector = new RegExp(`\\.${cls}(?![\\w-])`);
      // Every occurrence of the declaration must be inside no-preference: the count
      // across the whole file must equal the count inside no-preference blocks.
      const total = [...CSS_CODE.matchAll(new RegExp(`\\.${cls}(?![\\w-])`, 'g'))].length;
      const inside = noPreferenceBlocks
        .map((block) => [...block.matchAll(new RegExp(`\\.${cls}(?![\\w-])`, 'g'))].length)
        .reduce((a, b) => a + b, 0);
      expect(total, `.${cls} is not in CSS, so it is a dead exemption`).toBeGreaterThan(0);
      expect(
        inside,
        `Only ${inside} of the ${total} declarations of .${cls} are inside no-preference; ` +
          `a declaration that leaked outside applies unchanged for reduced-motion users. ` +
          `The INTENTIONALLY_STILL reason is now false, so revert it or rewrite the reason.`,
      ).toBe(total);
      expect(selector.test(CSS_CODE), 'the selector regex is spinning idle').toBe(true);
    }
  });

  for (const cls of requiresEquivalent) {
    it(`.${cls} still takes time under reduced-motion (not a hard cut)`, () => {
      const matching = allRules.filter((r) =>
        r.selector.split(',').some((s) => new RegExp(`\\.${cls}(?![\\w-])`).test(s)),
      );
      expect(matching.length, `.${cls} has no reduced-motion equivalent`).toBeGreaterThan(0);

      const timed = matching.filter((r) =>
        /(?:animation|transition)-duration:\s*(?:var\(|calc\()/.test(r.body),
      );
      expect(
        timed.length,
        `the equivalent of .${cls} does not get the duration token back (left as a hard cut)`,
      ).toBeGreaterThan(0);

      for (const rule of timed) {
        expect(
          /(?:animation|transition)-duration:\s*\d/.test(rule.body),
          `the equivalent of .${cls} rewrote a literal ms; use the token only`,
        ).toBe(false);
      }
    });
  }

  it('the equivalent switches the shaking axis to an opacity-only keyframe', () => {
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
        `.${cls} must switch to an opacity-only keyframe`,
      ).toBe(true);
    }
  });

  /**
   * Composer growth is deliberately not in `EQUIVALENT_CLASSES`: it is real movement, so arriving
   * instantly is right and the global kill rule already gives it. Guards that the duration is a ramp
   * token and that no carve-out is added.
   */
  describe('composer growth: arrives instantly under reduced motion', () => {
    const PANEL = 'src/widgets/vault-agent-panel/ui/VaultAgentPanel.tsx';

    it('the growth time is the surface-move ramp token (zero literal ms)', () => {
      const src = TS(PANEL);
      expect(src).toContain("transitionProperty: 'height'");
      expect(src).toContain("transitionDuration: 'var(--motion-base)'");
      expect(src).toContain("transitionTimingFunction: 'var(--motion-ease)'");
      expect(
        /transitionDuration:\s*['"`]\s*\d/.test(src),
        'composer growth wrote its time as a literal ms; it should ride the ramp',
      ).toBe(false);
    });

    it('the reduced path has no carve-out, since one would revive a movement that should be cut', () => {
      const carved = allRules.filter((rule) =>
        /vault-agent-input|agent-composer/.test(rule.selector),
      );
      expect(
        carved.map((rule) => rule.selector),
        'the composer gained a reduced-motion equivalent, but this axis is meant to be cut',
      ).toEqual([]);
    });

    it('the global kill rule also covers transition, which is the premise of this decision', () => {
      const global = allRules.find((r) =>
        /\*,?\s*\*::before/.test(r.selector.replace(/\s+/g, ' ')),
      );
      expect(global!.body).toMatch(/transition-duration:\s*0\.01ms/);
    });
  });

  /**
   * Toasts: the vendor (sonner) switches everything off with `transition: none !important`, which keeps
   * the position jump and loses the opacity. The equivalent removes the movement axis at its origin
   * and gives opacity its time back.
   */
  it('the toast equivalent removes the shaking axis (--y) at the starting point', () => {
    const toastRules = allRules.filter((r) => r.selector.includes('.app-toast'));
    expect(
      toastRules.some((r) => /--y:\s*translateY\(0\)\s*!important/.test(r.body)),
      'the toast still teleports by its own height for reduced-motion users',
    ).toBe(true);
    // The vendor switches it off with `!important`, so the equivalent wins only with
    // `!important` plus higher specificity. At lower specificity the rule exists but is
    // silently neutralised.
    for (const rule of toastRules) {
      expect(
        rule.selector.includes('[data-sonner-toaster]'),
        'the toast equivalent has lower specificity than the vendor rule, so it silently loses',
      ).toBe(true);
    }
  });

  /**
   * WCAG 2.2 section 2.3.3 exempts user-initiated movement: wheel, pinch and pan keep their time, and
   * only app-initiated camera moves snap, since snapping everything teleports the viewport.
   */
  it('the canvas camera reduced-motion snap applies only to app-initiated moves', () => {
    const step = TS('src/widgets/ontology-map/ui/frame-loop/topology-physics-step.ts');
    expect(
      /if \(reducedMotion && !userDrivenCamera\)/.test(step),
      'the camera snap also cuts user-initiated moves (violates the WCAG 2.3.3 exception)',
    ).toBe(true);

    const inputDir = 'src/widgets/ontology-map/ui/input';
    const handlers = readdirSync(path.join(process.cwd(), inputDir))
      .filter((name) => /^topology-pointer-[a-z-]+\.ts$/.test(name))
      .map((name) => TS(`${inputDir}/${name}`))
      .join('\n');
    expect(
      handlers.includes('userDrivenCameraRef'),
      'the pointer gesture leaves no user-initiated mark',
    ).toBe(true);
    // The two points where wheel/pinch snapped the whole camera in place — if they
    // come back they bypass the gate above.
    expect(
      /reducedMotionRef\.current\) \{\s*cameraRef\.current = \{ x: \{ value: afterX/.test(handlers),
      'wheel zoom teleports for reduced-motion users again',
    ).toBe(false);
  });

  /**
   * Sheets drawn by framer are out of reach of the CSS global kill rule, which would keep opacity and
   * cut only geometry; they must use the shared equivalent.
   */
  it('framer overlays ride the shared equivalent on the reduced path', () => {
    for (const rel of [
      'src/widgets/shortcut-sheet/ui/ShortcutSheet.tsx',
      'src/widgets/search-palette/ui/SearchPalette.tsx',
      // `NewDocKindDialog` consumes the `Dialog` primitive, which carries the framer equivalent.
      'src/shared/ui/surfaces/dialog.tsx',
    ]) {
      const src = TS(rel);
      expect(src.includes('OVERLAY_SPRING_REDUCED'), `${rel} has no reduced-motion equivalent`).toBe(true);
    }
  });

  /**
   * In map chrome, brightness and movement ride different curves: with one shared keyframe the expo-out
   * movement curve also governed opacity and the entry read as a hard cut. If `opacity` returns to an
   * entry/exit keyframe it is caught here, because frames catch it and eyes do not.
   */
  describe('map chrome entrance: brightness and movement on separate curves', () => {
    function keyframeBody(name: string): string {
      const at = CSS.indexOf(`@keyframes ${name}`);
      expect(at, `@keyframes ${name} is missing`).toBeGreaterThan(-1);
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

    for (const name of ['topologyChromeIn', 'topologyChromeOut', 'overlaySpringIn', 'overlaySpringOut']) {
      it(`${name} carries movement only and does not bind opacity again`, () => {
        expect(/opacity\s*:/.test(keyframeBody(name))).toBe(false);
      });
    }

    for (const cls of ['topology-chrome-in', 'topology-chrome-out']) {
      it(`the brightness of .${cls} rides the app-wide ramp (--motion-fast · --motion-ease)`, () => {
        const rule = allRulesOutsideReducedMotion.find((r) =>
          r.selector.split(',').some((s) => new RegExp(`\\.${cls}(?![\\w-])`).test(s)),
        );
        expect(rule, `there is no rule for .${cls}`).toBeTruthy();
        // Entry is `panelCrossfadeIn`, exit is `overlayFadeOut` — both opacity-only and
        // on the same ramp. The reason the names differ is above.
        expect(rule!.body).toMatch(/panelCrossfadeIn|overlayFadeOut/);
        expect(rule!.body).toContain('var(--motion-fast)');
        expect(rule!.body).toContain('var(--motion-ease)');
      });
    }
  });
});
