import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { fieldClass, type FieldFrame, type FieldSize } from '@/shared/ui/control-class';

/**
 * The `fieldClass` contract — the value layer for form fields.
 *
 * ## Why a separate cva rather than a ninth `shape`
 *
 * The 2026-08-06 design council's verdict (system + hierarchy — the design-systems and
 * lead seats). All three reasons come from the value layer's own discipline:
 *
 * 1. The eight shapes were justified by an exhaustive count of **419 `<button>`s**;
 *    fields are a **different population** (63 form elements).
 * 2. Essentially none of the 10 `tone` steps mean anything for a field, so most
 *    combinations would be **dead**.
 * 3. Arithmetic — a ninth shape adds **+320** cases to the
 *    `control-class.contract` sweep, while a separate cva ends at **16**
 *    (frame 2 × size 4 × multiline 2).
 *
 * ## Why three axes — two seats drew the same line independently
 *
 * The hierarchy (lead) seat opened the real product and split forms into three:
 * **recording** (the value lands on disk; the eye is on the input) · **lookup**
 * (you arrive at something that already exists; the eye is on the **result**) ·
 * **stage** (writing, in place, the text a card will show). The first two are the
 * `frame` axis, and the reason they cannot be merged came from that same reading:
 * make recording transparent and the form disappears; make lookup heavy and **the
 * input beats the result**.
 *
 * ## ⚠️ The most important assertion in this file — do not write it as "is it in
 * the vocabulary"
 *
 * One of system's four negative probes **leaked through green**: "single-line `md`
 * at `h-9` (36)". 36 is inside the height vocabulary, so a vocabulary check passed
 * it.
 *
 * So this contract is written as a **step ↔ token 1:1 mapping** — it **reads** the
 * px values of `--control-h-{sm,md,lg}` from `globals.css` and checks each step
 * emits that value. Copying the values here would create a blind spot the moment
 * the copy drifted from the ramp.
 */

const ROOT = join(__dirname, '..', '..');
const GLOBALS = readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8');

const FRAMES: FieldFrame[] = ['boxed', 'bare'];
const SIZES: FieldSize[] = ['xs', 'sm', 'md', 'lg'];
const MULTILINE = [false, true] as const;

/** Tailwind's `h-N`/`min-h-N` are in 0.25rem units. */
const STEP_PX = 4;

function tokenPx(token: string): number | null {
  // Reads the **base declaration**, not the coarse block's `max(...)` redeclaration.
  for (const m of GLOBALS.matchAll(new RegExp(`${token}\\s*:\\s*([^;]+);`, 'g'))) {
    const raw = m[1].trim();
    const plain = raw.match(/^(\d+(?:\.\d+)?)px$/);
    if (plain) return Number(plain[1]);
  }
  return null;
}

function heightPx(cls: string): number | null {
  const m = cls.match(/(?:^|\s)(?:min-)?h-(\d+(?:\.\d+)?)(?:\s|$)/);
  return m ? Number(m[1]) * STEP_PX : null;
}

const all = FRAMES.flatMap((frame) =>
  SIZES.flatMap((size) =>
    MULTILINE.map((multiline) => ({
      frame,
      size,
      multiline,
      cls: fieldClass({ frame, size, multiline }),
    })),
  ),
);

describe('fieldClass — 전수 16조합', () => {
  it('16조합을 실제로 만들고 있다 — 축이 줄면 여기가 먼저 빨개진다', () => {
    expect(all.length).toBe(16);
  });

  it.each(all.map((c) => [`${c.frame}/${c.size}/multiline=${c.multiline}`, c] as const))(
    '%s — 램프 밖 임의값(대괄호 px)을 내지 않는다',
    (_name, c) => {
      expect(c.cls).not.toMatch(/-\[\s*\d+(\.\d+)?px\s*\]/);
    },
  );

  it.each(all.map((c) => [`${c.frame}/${c.size}`, c] as const))(
    '%s — 색을 직접 적지 않는다(토큰만)',
    (_name, c) => {
      expect(c.cls).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(c.cls).not.toMatch(/rgba?\(/);
    },
  );
});

/**
 * **Step ↔ token 1:1.** This file's central assertion — it prevents the `h-9`
 * accident described in the preamble.
 */
describe('높이 단이 `--control-h-*` 와 1:1 이다', () => {
  const MAP: Array<[FieldSize, string]> = [
    ['sm', '--control-h-sm'],
    ['md', '--control-h-md'],
    ['lg', '--control-h-lg'],
  ];

  it('램프 토큰을 CSS 에서 실제로 읽었다 — 못 읽으면 아래 단언이 헛돈다', () => {
    for (const [, token] of MAP) {
      expect(tokenPx(token), `${token} 을 globals.css 에서 못 읽었다`).toBeGreaterThan(0);
    }
  });

  it.each(MAP)('boxed/%s 의 높이가 `%s` 와 같다', (size, token) => {
    const expected = tokenPx(token);
    for (const multiline of MULTILINE) {
      const cls = fieldClass({ frame: 'boxed', size, multiline });
      expect(heightPx(cls), `${size}/multiline=${multiline} → ${cls}`).toBe(expected);
    }
  });

  /**
   * `xs` is **not a height step** — it is a tier that only drops the radius one
   * level, so its height equals `sm` (the same grammar `chip`'s `xs` uses above).
   * Without this assertion, somebody could attach a fourth height to `xs` and nobody
   * would know.
   */
  it('xs 는 sm 과 같은 높이이고 반경만 한 층 낮다', () => {
    const xs = fieldClass({ frame: 'boxed', size: 'xs' });
    const sm = fieldClass({ frame: 'boxed', size: 'sm' });
    expect(heightPx(xs)).toBe(heightPx(sm));
    expect(xs).toContain('rounded-micro');
    expect(sm).toContain('rounded-chip');
  });

  it('한 줄은 하드 높이, 여러 줄은 min-height — 자라야 하는 것이 잘리지 않는다', () => {
    for (const size of SIZES) {
      expect(fieldClass({ frame: 'boxed', size, multiline: false })).toMatch(/(?:^|\s)h-\d/);
      expect(fieldClass({ frame: 'boxed', size, multiline: true })).toMatch(/(?:^|\s)min-h-\d/);
    }
  });
});

describe('frame — 누가 상자를 내는가', () => {
  it('boxed 는 보더·바탕·반경·초점을 정확히 한 벌씩 낸다', () => {
    for (const size of SIZES) {
      const cls = fieldClass({ frame: 'boxed', size });
      expect(cls).toContain('border-[color:var(--color-border-soft)]');
      expect(cls).toContain('bg-[color:var(--color-overlay-1)]');
      expect(cls).toMatch(/rounded-(chip|micro)/);
      expect(cls).toContain('focus-visible:border-[color:var(--color-indigo-a46)]');
    }
  });

  /**
   * **`bare` must not emit a box.** The parent already emitted one, and a second
   * box pushes that one outward from the inside. The hierarchy seat's verdict: all 10
   * lookup places are ones where **the result is the attention winner**, so an input
   * carrying an affordance beats the result.
   */
  it.each(SIZES.flatMap((s) => MULTILINE.map((m) => [`${s}/multiline=${m}`, s, m] as const)))(
    'bare/%s 는 치수·보더·반경·터치 바닥을 하나도 내지 않는다',
    (_n, size, multiline) => {
      const cls = fieldClass({ frame: 'bare', size, multiline });
      expect(cls, '높이를 냈다').not.toMatch(/(?:^|\s)(?:min-)?h-\d/);
      expect(cls, '보더를 냈다').not.toMatch(/(?:^|\s)border(?:\s|-)/);
      expect(cls, '반경을 냈다').not.toMatch(/rounded-/);
      expect(cls, '터치 바닥을 냈다 — 부모 상자를 밀어낸다').not.toContain('atlas-touch-floor');
      expect(cls, '좌우 인셋을 냈다').not.toMatch(/(?:^|\s)px-/);
      expect(cls).toContain('bg-transparent');
    },
  );

  it('bare 는 size·multiline 이 무엇이든 같은 문자열이다 — 축이 헛돌지 않는지 못박는다', () => {
    const variants = new Set(
      SIZES.flatMap((size) =>
        MULTILINE.map((multiline) => fieldClass({ frame: 'bare', size, multiline: multiline })),
      ),
    );
    // Only multiline adds `resize-none`, so there must be exactly two.
    expect([...variants].length, `실제: ${[...variants].join(' | ')}`).toBe(2);
  });
});

describe('base — 모든 필드가 공유하는 것', () => {
  /**
   * ⚠️ **Do not write this as `toContain('text-body')`** — `text-body-lg` contains
   * it as a substring, so it **passes falsely** even after the rule changes. That
   * assertion really did stay green right after type was paired with size.
   *
   * The rule: **wide fields (md, lg) use `text-body-lg` (14); dense fields (xs, sm)
   * and `bare` use `text-body` (12.5).** The evidence is on screen — dropping
   * `/project/new` to 12.5px made **the value the user typed nearly the same rank as
   * the label the app wrote (11px)**. In a form, the most readable thing must be
   * what the user entered.
   */
  it.each(all.map((c) => [`${c.frame}/${c.size}`, c] as const))(
    '%s — 타입이 크기와 짝이다 (md·lg=body-lg · xs·sm·bare=body)',
    (_name, c) => {
      const step = c.cls.match(/(?:^|\s)(text-body(?:-lg)?)(?:\s|$)/)?.[1];
      const expected = c.frame === 'boxed' && (c.size === 'md' || c.size === 'lg') ? 'text-body-lg' : 'text-body';
      expect(step, `실제 클래스: ${c.cls}`).toBe(expected);
    },
  );

  it('타입 스텝이 정확히 하나다 — 둘이면 CSS 순서가 이기는 쪽을 정하게 된다', () => {
    for (const c of all) {
      const hits = [...c.cls.matchAll(/(?:^|\s)text-body(?:-lg)?(?:\s|$)/g)];
      expect(hits.length, `${c.frame}/${c.size}: ${c.cls}`).toBe(1);
    }
  });

  it('플레이스홀더 잉크가 본문 잉크와 다르다 — 같으면 입력값과 안내문이 구별되지 않는다', () => {
    for (const c of all) {
      expect(c.cls).toContain('text-[color:var(--color-text-primary)]');
      expect(c.cls).toContain('placeholder:text-[color:var(--color-text-quaternary)]');
    }
  });

  it('비활성 어포던스를 base 가 낸다 — 컴포넌트마다 챙기면 하나는 빠진다', () => {
    for (const c of all) expect(c.cls).toContain('disabled:cursor-not-allowed');
  });

  /**
   * **Width is not the value layer's share.** Consumers differ (some use `w-full`,
   * others get their width from a parent grid). If the base emitted a width, the
   * latter would no longer be a 0px migration — the first implementation did put
   * `w-full` on `boxed` and removed it for exactly this reason.
   */
  it('폭을 내지 않는다', () => {
    for (const c of all) {
      expect(c.cls, `폭을 냈다: ${c.cls}`).not.toMatch(/(?:^|\s)w-(full|\d)/);
      expect(c.cls).not.toMatch(/(?:^|\s)flex-1/);
    }
  });
});

/**
 * The touch floor. `boxed` emits its own box, so growing to 44px only pushes its
 * neighbours; `bare` sits inside the parent's box, so growing pushes that box
 * outward from the inside.
 */
describe('터치 바닥', () => {
  it('boxed 는 coarse 바닥을 받고 bare 는 받지 않는다', () => {
    for (const size of SIZES) {
      expect(fieldClass({ frame: 'boxed', size })).toContain('atlas-touch-floor');
      expect(fieldClass({ frame: 'bare', size })).not.toContain('atlas-touch-floor');
    }
  });
});
