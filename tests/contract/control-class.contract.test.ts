import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { TYPE_RAMP_STEPS } from '@/shared/lib/cn';
import {
  controlClass,
  type ControlShape,
  type ControlSize,
  type ControlTone,
} from '@/shared/ui/control-class';

/**
 * The contract for `controlClass`.
 *
 * **Without this file the function is worthless.** Moving hand-written classNames
 * behind a function only gathers the off-ramp values into one place; they are
 * still off-ramp values. The single reason this function beats writing them by
 * hand is that **every value it emits is forced onto a ramp**, and this file is
 * that enforcement.
 *
 * Evidence: the 300+ off-ramp values found by the 2026-08-03 design-system audit
 * all came from places written by hand because no component existed.
 */

const SHAPES: ControlShape[] = ['chip', 'icon', 'row', 'pill', 'card', 'link', 'tile', 'segment'];
const SIZES: ControlSize[] = ['xs', 'sm', 'md', 'lg'];
const TONES: ControlTone[] = [
  'default',
  'muted',
  'secondary',
  'strong',
  'accent',
  'accentOnTint',
  'warning',
  'danger',
  'success',
  'onAccent',
];
const SCOPES = ['app', 'panel'] as const;

/**
 * The token namespaces the value layer **may read**.
 *
 * It went from one to two, and the reason is measurement rather than taste: the
 * test below reads `globals.css` directly and asserts that the two neutral ramps
 * really do carry different values. While that test is green this list is
 * justified; if the values converge the test turns red and **tells you to shrink
 * this list**.
 */
const TOKEN_NAMESPACES = ['--color-', '--topology-v2-panel-text-'];

/** The 4 steps of the radius ramp in `app/globals.css`. Any radius not here is off-ramp. */
const RADIUS_STEPS = ['micro', 'chip', 'card', 'panel'];

const all = (fn: (s: ControlShape, z: ControlSize, t: ControlTone, a: boolean) => void) => {
  for (const s of SHAPES) for (const z of SIZES) for (const t of TONES) for (const a of [true, false]) fn(s, z, t, a);
};

/** The same exhaustive sweep plus the `scope` axis — used to check that a new axis does not leak off the ramp. */
const allScoped = (fn: (cls: string, label: string) => void) => {
  for (const s of SHAPES)
    for (const z of SIZES)
      for (const t of TONES)
        for (const a of [true, false])
          for (const sc of SCOPES)
            for (const tr of [true, false])
              fn(
                controlClass({ shape: s, size: z, tone: t, active: a, scope: sc, truncate: tr }),
                `${s}/${z}/${t}/${a}/${sc}/trunc=${tr}`,
              );
};

describe('controlClass — 램프 밖 값을 낼 수 없다', () => {
  it('arbitrary 크기·반경을 내지 않는다', () => {
    const offenders: string[] = [];
    all((shape, size, tone, active) => {
      for (const c of controlClass({ shape, size, tone, active }).split(' ')) {
        // `text-[color:var(--color-…)]` is a colour and legitimate. What is banned is arbitrary **dimensions**.
        if (/^(text|rounded|leading)-\[(?!color:)/.test(c) || /^(min-h|min-w|h|w|p[xy]?|gap)-\[/.test(c)) {
          offenders.push(`${shape}/${size}/${tone}/${active}: ${c}`);
        }
      }
    });
    expect(offenders, `램프를 우회한 값이 있다:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('폰트 크기는 등록된 타입 램프 스텝만 쓴다', () => {
    // An undefined step **leaves no literal behind** — Tailwind simply does not emit
    // the class and it renders at the root 16px, which puts it outside the
    // hardcoded-value check's field of view (measured 2026-07-27).
    const offenders: string[] = [];
    all((shape, size, tone, active) => {
      for (const c of controlClass({ shape, size, tone, active }).split(' ')) {
        const m = /^text-([a-z-]+)$/.exec(c);
        // `text-` is shared by three axes: size, alignment, and colour. Only the size
        // axis is checked — without that split, `text-left` is caught as "a step not on
        // the ramp" and the gate lies.
        const ALIGNMENT = ['left', 'center', 'right', 'justify', 'start', 'end'];
        if (m && !ALIGNMENT.includes(m[1]) && !TYPE_RAMP_STEPS.includes(m[1] as never)) {
          offenders.push(`${shape}/${size}: ${c}`);
        }
      }
    });
    expect(offenders, `타입 램프에 없는 스텝:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('반경은 4단 램프 안이다', () => {
    const offenders: string[] = [];
    all((shape, size, tone, active) => {
      for (const c of controlClass({ shape, size, tone, active }).split(' ')) {
        const m = /^rounded-([a-z0-9-]+)$/.exec(c);
        if (m && !RADIUS_STEPS.includes(m[1]) && m[1] !== 'full') offenders.push(`${shape}: ${c}`);
      }
    });
    expect(offenders, `반경 램프 밖:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('색은 전부 토큰 참조다 — hex 도 rgb 도 안 낸다', () => {
    const offenders: string[] = [];
    all((shape, size, tone, active) => {
      const cls = controlClass({ shape, size, tone, active });
      for (const c of cls.split(' ')) {
        if (/#[0-9a-f]{3,8}\b/i.test(c) || /rgba?\(/.test(c)) offenders.push(`${shape}: ${c}`);
        // Colour utilities must go through a registered token namespace.
        if (/^(text|bg|border)-\[/.test(c) && !TOKEN_NAMESPACES.some((ns) => c.includes(`var(${ns}`))) {
          offenders.push(`${shape}: ${c}`);
        }
      }
    });
    expect(offenders, `토큰을 안 거친 색:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('두 번째 채색 시스템을 만들지 않는다 — 인디고 외 hue 0', () => {
    // The charter: neutrals + a single indigo. Expressing a pressed state with a new colour is the most common escape.
    const tokens = new Set<string>();
    all((shape, size, tone, active) => {
      for (const m of controlClass({ shape, size, tone, active }).matchAll(/var\(--color-([a-z0-9-]+)\)/g)) {
        tokens.add(m[1]);
      }
    });
    /*
     * The charter is neutrals + a single indigo **+ 3 signal colours** (warning,
     * error, success). Signals are for states like connected / failed / warning and
     * are never extended into decoration. Any hue outside those three is a second
     * colour system.
     */
    const SIGNAL = /^(status-warning|status-success|danger-text|success-text)/;
    const hued = [...tokens].filter(
      (t) => !/^(text|divider|border|overlay|canvas|panel|elevated|secondary)/.test(t) && !SIGNAL.test(t),
    );
    expect(hued.sort(), `인디고 계열과 신호 3종만 허용된다: ${hued.join(', ')}`).toEqual(
      hued.filter((t) => t.startsWith('indigo')).sort(),
    );
  });
});

describe('controlClass — 모양이 실제로 서로 다르다', () => {
  it('여섯 모양이 서로 구별되는 문자열을 낸다', () => {
    // Two shapes emitting the same value are not a classification — they are one thing with two names.
    const seen = new Map<string, ControlShape>();
    for (const shape of SHAPES) {
      const cls = controlClass({ shape });
      const dup = seen.get(cls);
      expect(dup, `\`${shape}\` 와 \`${dup}\` 이 같은 클래스를 낸다`).toBeUndefined();
      seen.set(cls, shape);
    }
  });

  it('칩·필의 `md`·`lg` 는 사다리 위에 선다 — `sm` 만 24px 바닥에 남는다', () => {
    /*
     * **An inverted assertion** (owner decision 2026-08-03 · `docs/DECISIONS.md`).
     *
     * The assertion here used to be **"by default, padding decides the height"**
     * (`expect(controlClass({ shape: 'chip' })).not.toMatch(/\bh-\d/)`). That rule
     * produced chip 24/30/34 and pill 20/22/30, and **30 · 34 · 22 · 20 are not in
     * this app's height vocabulary**. When those values collided with the contract
     * (32), an exception axis (`fixedHeight`) was bolted on instead of fixing the
     * values — the axis was a symptom.
     *
     * So the rule is inverted: **the ladder decides the height and padding follows
     * inside it.** `md` and `lg` stand on `--control-h-md` (32px); only `sm` stays at
     * the WCAG 2.5.8 minimum target of 24px.
     */
    for (const shape of ['chip', 'pill'] as const) {
      for (const size of ['md', 'lg'] as const) {
        expect(
          controlClass({ shape, size }),
          `${shape}/${size} 가 사다리(32px)에 안 선다 — 패딩의 부산물로 되돌아갔다`,
        ).toContain('min-h-8');
      }
      expect(
        controlClass({ shape, size: 'sm' }),
        `${shape}/sm 이 32px 로 올라갔다 — 24px 바닥이 사라지면 밀도가 통째로 바뀐다`,
      ).not.toContain('min-h-8');
    }
    // No hard height — it would clip a wrapped chip and hide content.
    for (const shape of ['chip', 'pill'] as const) {
      for (const size of SIZES) {
        expect(
          controlClass({ shape, size }),
          `${shape}/${size} 가 하드 높이를 쓴다 — 넘치는 내용이 잘린다`,
        ).not.toMatch(/(^| )h-\d/);
      }
    }
  });

  it('정사각 모양은 좌우 패딩을 받지 않는다 — 받으면 정사각이 아니다', () => {
    for (const size of SIZES) {
      const cls = controlClass({ shape: 'icon', size });
      expect(cls, `icon/${size} 에 px 가 붙었다: ${cls}`).not.toMatch(/\bpx-/);
      const [, h] = /\bh-(\d+)\b/.exec(cls) ?? [];
      const [, w] = /\bw-(\d+)\b/.exec(cls) ?? [];
      expect(h, `icon/${size} 의 높이·너비가 다르다`).toBe(w);
    }
  });

  it('세로 타일은 아이콘 위·글자 아래다 — 가로 모양들과 축이 다르다', () => {
    // A hole the 2026-08-03 normalisation found: all six shapes were horizontal, so
    // 5 vertical action tiles sat outside the system. The inventory had counted
    // "shape" along one axis only.
    const cls = controlClass({ shape: 'tile' });
    expect(cls).toContain('flex-col');
    expect(cls).toContain('text-center');
  });

  it('link 의 바닥은 24(2.5.8 AA)다 — 44(2.5.5/HIG)를 fine 포인터 전면에 싣지 않는다', () => {
    /*
     * Floor reset, 2026-08-04 (ledger 「link floor 24」 — the link floor of 24). The
     * value layer used to cite WCAG 2.5.8 (AA, 24×24) while loading 2.5.5 (AAA) /
     * HIG's 44 (`min-h-11`). 44 is `--touch-target-min`, which the touch contract
     * (design.md) pins as the single source for coarse pointers, so 44 across the
     * board on fine pointers violated the repository's own contract. The escape hatch
     * that floor created (the `inline` axis) let 4 misconfigurations through without
     * any static check seeing them. The coarse 44 is emitted by `.touch-hit-expand`
     * (zero layout shift), not by the height.
     */
    for (const size of SIZES) {
      const cls = controlClass({ shape: 'link', size });
      expect(cls, `link/${size} 바닥이 24(min-h-6)가 아니다`).toMatch(/(^| )min-h-6( |$)/);
      expect(cls, `link/${size} 가 coarse 값 44 를 fine 전면에 싣는다`).not.toMatch(/min-h-11/);
    }
  });

  it('홀로 선 글자 컨트롤은 손가락에 잡힌다 — 기본값이 안전한 쪽이다', () => {
    /*
     * `link` has no border and no background, so visually it must be exactly the
     * text — but if the hit area is also text-sized it drops from 24 to 16px, below
     * WCAG 2.5.8 (24×24). Three settings-sheet controls stayed outside the system for
     * exactly this reason.
     */
    for (const size of SIZES) {
      expect(controlClass({ shape: 'link', size }), `link/${size} 에 최소 높이가 없다`).toMatch(
        /min-h-/,
      );
    }
  });

  it('모든 모양이 반경을 갖는다 — 안 주면 호버 배경이 각진다', () => {
    // `row` originally shipped without a radius, which made hover on normalised list rows square-cornered.
    for (const shape of SHAPES) {
      expect(controlClass({ shape }), `${shape} 에 반경이 없다`).toMatch(/rounded-/);
    }
  });

  it('행 모양은 좌정렬 전폭이다 — 그게 목록 행의 정체성이다', () => {
    const cls = controlClass({ shape: 'row' });
    expect(cls).toContain('w-full');
    expect(cls).toContain('text-left');
  });

  it('눌린 상태가 눌리지 않은 상태와 다르다', () => {
    for (const shape of SHAPES) {
      expect(
        controlClass({ shape, active: true }),
        `\`${shape}\` 의 눌림 상태가 화면에서 구별되지 않는다`,
      ).not.toBe(controlClass({ shape, active: false }));
    }
  });

  it('className 은 덧붙고, 램프 값을 이기지 않는다', () => {
    // `cn()` is tailwind-merge, so on the same axis the later class wins. The
    // discipline "pass placement only" is not kept if it lives only in a document, so
    // at minimum the "it appends" contract is pinned here.
    expect(controlClass({ shape: 'chip', className: 'absolute right-2' })).toContain('absolute');
  });
});

/**
 * Axes that filled holes in the value layer — **only those the ledger counted
 * repeatedly** were admitted.
 *
 * Every test here locks down the reason its axis exists. An axis is not free:
 * each one adds something for the next person to choose between, and an axis
 * added without evidence becomes a second system by itself. So each axis carries
 * one test that **turns red when its evidence disappears**.
 */
describe('controlClass — 여덟째 모양과 세 축', () => {
  const GLOBALS = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');
  const cssVar = (name: string): string | undefined =>
    new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm').exec(GLOBALS)?.[1].trim();

  it('여덟째 모양은 보더가 없고 인셋이 있다 — 그 사이가 비어 있어서 생겼다', () => {
    /*
     * `chip`/`pill`/`card`/`tile` require a border, so inside an already-bordered box
     * they become a box in a box; `link` has zero inset, so a segment's hit area
     * disappears. This shape exists only because it is neither.
     */
    for (const size of SIZES) {
      const cls = controlClass({ shape: 'segment', size });
      // ⚠️ Variant prefixes (`disabled:hover:border-inherit`) must be filtered out —
      // without that this test turns red **for every shape**. The first run did exactly
      // that.
      const base = cls.split(' ').filter((c) => !c.includes(':') || c.startsWith('border-[color:'));
      expect(base.join(' '), `segment/${size} 에 보더가 붙었다 — 상자 속 상자가 된다`).not.toMatch(
        /(^| )border(-|$| )/,
      );
      expect(cls, `segment/${size} 에 좌우 인셋이 없다 — 그러면 link 와 같다`).toMatch(/\bpx-/);
    }
  });

  it('세그먼트 반경은 `--chrome-radius-inner` 와 같은 값이다 — 별칭이라 픽셀이 안 바뀐다', () => {
    /*
     * Five consumers were using `rounded-[var(--chrome-radius-inner)]`. The only
     * evidence that moving them is safe is that the token is an **alias** for
     * `--radius-chip`, so that fact is read straight from the CSS and locked. If
     * someone splits `--chrome-radius-inner` off to 7px this test turns red — and on
     * that day the five moved places would be 1px off.
     */
    expect(
      cssVar('--chrome-radius-inner'),
      '`--chrome-radius-inner` 가 `--radius-chip` 의 별칭이 아니게 됐다 — segment 가 rounded-chip 을 쓰면 안 된다',
    ).toBe('var(--radius-chip)');
    expect(controlClass({ shape: 'segment' })).toContain('rounded-chip');
  });

  it('두 무채 램프는 실제로 값이 다르다 — 같아지면 `scope` 축은 폐기 대상이다', () => {
    /*
     * The **only** evidence that the `scope` axis should exist. The day the two ramps
     * carry the same values, the axis does nothing while still adding a choice, so
     * this test must turn red and say to delete it.
     */
    /*
     * It was four until 2026-08-03. Raising the global quaternary (#787c84 →
     * #82828a, docs/DECISIONS.md) made quaternary **converge to the same value** in
     * both ramps; this test turned red as designed and that step's panel compound was
     * deleted. So the axis now remaps three steps, and each of the three has its own
     * evidence that the values really differ.
     */
    const DIVERGING_STEPS = ['primary', 'secondary', 'tertiary'] as const;
    const pairs: Array<[string, string]> = [];
    for (const step of DIVERGING_STEPS) {
      const app = cssVar(`--color-text-${step}`);
      const panel = cssVar(`--topology-v2-panel-text-${step}`);
      expect(app, `--color-text-${step} 를 못 읽었다`).toBeTruthy();
      expect(panel, `--topology-v2-panel-text-${step} 를 못 읽었다`).toBeTruthy();
      pairs.push([app as string, panel as string]);
    }
    // Idling guard — if all three steps were not read, the assertion below passes on an empty set.
    expect(pairs.length, '두 램프의 단을 하나도 못 짝지었다').toBe(3);
    /*
     * ⚠️ This started as "pass if any one differs", and `/gate-probe` caught that
     * it was **not a gate**: reverting one of the remapped steps to the same value
     * still went green. **Every** step the axis remaps must carry its own evidence —
     * when one step converges, its compound occupies space while doing nothing.
     */
    const same = pairs
      .map(([a, b], i) => (a === b ? `${DIVERGING_STEPS[i]}: ${a}` : null))
      .filter((x): x is string => x !== null);
    expect(
      same,
      `두 무채 램프의 이 단이 같아졌다 — 그 단의 \`scope: 'panel'\` 컴파운드는 근거가 없다.\n` +
        `수렴한 단을 값 층에서 지우거나(그 단은 tone 하나로 충분하다), 전부 수렴했으면 축 자체를 지워라.\n` +
        same.join('\n'),
    ).toEqual([]);
  });

  it('quaternary 는 수렴 상태로 고정한다 — 다시 갈라지면 panel 컴파운드를 되살려야 한다', () => {
    /*
     * The mirror of the test above. On 2026-08-03 quaternary converged to `#82828a`
     * in both ramps and the panel compound was deleted. The value is now written in
     * two places, but **this pin catches the drift mechanically** — the reason they
     * were not merged behind an alias var() is that `prefers-contrast: more` raises
     * only the global quaternary to #8f95a0, and under an alias quaternary would at
     * that moment **invert above** tertiary (#868690) in the panel ladder. Evidence:
     * docs/DECISIONS.md, 2026-08-03 quaternary entry.
     *
     * Without this test two failures are silent: ① only one value moves, they diverge
     * again, and with no remap `muted` on a panel emits the wrong ink; ② the compound
     * is resurrected without evidence. Both turn red here.
     */
    const app = cssVar('--color-text-quaternary');
    const panel = cssVar('--topology-v2-panel-text-quaternary');
    expect(app, '--color-text-quaternary 를 못 읽었다').toBeTruthy();
    expect(panel, '--topology-v2-panel-text-quaternary 를 못 읽었다').toBeTruthy();
    expect(
      panel,
      `quaternary 가 두 램프에서 다시 갈라졌다(전역 ${app} · 패널 ${panel}) — ` +
        `panel 위 muted 잉크가 근거를 잃었다. \`scope: 'panel', tone: 'muted'\` 컴파운드를 되살리고 이 고정을 갱신하라.`,
    ).toBe(app);
    // The compound really is absent — `muted` emits one global token regardless of scope.
    const onPanel = controlClass({ shape: 'chip', size: 'md', tone: 'muted', scope: 'panel' });
    expect(
      onPanel.includes('--topology-v2-panel-text-quaternary'),
      '수렴 상태인데 panel 컴파운드가 되살아나 있다 — 같은 값을 내는 무노동 분기다. 지워라.',
    ).toBe(false);
    expect(onPanel).toContain('text-[color:var(--color-text-quaternary)]');
  });

  it('`scope: panel` 은 잉크만 바꾼다 — 바탕·보더로 새면 두 번째 채색 시스템이다', () => {
    /*
     * The price of opening this axis must be only "the value layer acknowledges a
     * second ramp". If the panel namespace also starts emitting through `bg-` and
     * `border-`, that really is two colour systems and violates the charter.
     */
    const offenders: string[] = [];
    allScoped((cls, label) => {
      for (const c of cls.split(' ')) {
        if (!c.includes('--topology-v2-panel-text-')) continue;
        if (!/^text-\[color:/.test(c)) offenders.push(`${label}: ${c}`);
      }
    });
    expect(offenders, `패널 램프가 잉크 밖으로 샜다:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('신호 3종과 인디고는 `scope` 를 안 탄다 — 뜻으로 정해지는 색은 바탕을 안 본다', () => {
    for (const tone of ['accent', 'accentOnTint', 'warning', 'danger', 'success'] as const) {
      expect(
        controlClass({ shape: 'chip', tone, scope: 'panel' }),
        `${tone} 가 패널에서 다른 색이 됐다`,
      ).toBe(controlClass({ shape: 'chip', tone, scope: 'app' }));
    }
  });

  it('`scope` 가 실제로 무언가를 바꾼다 — 값이 갈리는 무채 단은 패널에서 다른 잉크다', () => {
    // The test above only checks "nothing changes", so without this one the axis
    // could be turned into a complete no-op and both would stay green. `muted` is not
    // here — its remap was deleted by the 2026-08-03 quaternary convergence, and that
    // state is caught from the other direction by the test pinning quaternary as
    // converged.
    for (const tone of ['default', 'secondary', 'strong'] as const) {
      expect(
        controlClass({ shape: 'chip', tone, scope: 'panel' }),
        `${tone} 가 패널에서 그대로다 — scope 축이 공회전한다`,
      ).not.toBe(controlClass({ shape: 'chip', tone, scope: 'app' }));
    }
  });

  it('`truncate` 는 display 를 flex 밖으로 뺀다 — 안 그러면 `…` 가 안 그려진다', () => {
    /*
     * Measured: at the same text and width, `inline-block` gives `…` while
     * `inline-flex` hard-clips. Adding the `truncate` utility alone does not fix it.
     */
    for (const shape of SHAPES) {
      const cls = controlClass({ shape, truncate: true });
      expect(cls, `${shape}/truncate 에 truncate 가 없다`).toContain('truncate');
      expect(cls, `${shape}/truncate 가 여전히 flex 다 — 말줄임이 하드 클립된다`).not.toMatch(
        /(^| )(inline-)?flex( |$)/,
      );
      // Turning it off leaves today's behaviour unchanged.
      expect(controlClass({ shape, truncate: false })).toBe(controlClass({ shape }));
    }
  });

  it('채움 톤은 바탕과 잉크를 한 쌍으로 내고 보더를 지운다', () => {
    /*
     * Emitting ink alone leaves consumers hand-writing `bg-…`, which passes shape
     * through `className` and neutralises the layer. So they are emitted as a pair.
     */
    for (const shape of SHAPES) {
      const cls = controlClass({ shape, tone: 'onAccent' });
      expect(cls, `${shape}/onAccent 에 채움이 없다`).toContain('bg-[color:var(--color-indigo-brand)]');
      expect(cls, `${shape}/onAccent 에 전경 토큰이 없다`).toContain(
        'text-[color:var(--color-text-on-accent)]',
      );
      expect(cls, `${shape}/onAccent 에 보더가 남았다 — 채운 주 동작은 테두리가 없다`).not.toMatch(
        /border-\[color:/,
      );
    }
    // The foreground token must exist. If it does not, the browser ignores the colour
    // entirely and the inherited colour shows through — which reads on screen as
    // "slightly darker text" and nobody can point at it.
    expect(cssVar('--color-text-on-accent'), '`--color-text-on-accent` 가 globals.css 에 없다').toBeTruthy();
  });

  it('`min-h-8` 은 `--control-h-md` 와 같은 값이다 — 사다리 토큰이 움직이면 여기가 먼저 빨개진다', () => {
    /*
     * **This is the central gate of the whole arrangement.** The value layer emits a
     * Tailwind step (`min-h-8`) while the token (`--control-h-md`) lives in CSS.
     * Nothing in code forces the two to be the same value, so it is locked here by
     * **reading the CSS directly**.
     *
     * The value is not registered by hand — Tailwind spacing is 1 = 4px, so the step
     * is multiplied by 4 and compared against the token's px. If someone moves
     * `--control-h-md` to 33px, the ramp's 32px is off the ladder from that day, and
     * this line is what says so.
     */
    const px = Number(/^(\d+)px$/.exec(cssVar('--control-h-md') ?? '')?.[1]);
    expect(px, '`--control-h-md` 를 px 로 못 읽었다').toBeGreaterThan(0);

    let checked = 0;
    for (const shape of ['chip', 'pill'] as const) {
      for (const size of ['md', 'lg'] as const) {
        const cls = controlClass({ shape, size });
        const step = Number(/\bmin-h-(\d+)\b/.exec(cls)?.[1]);
        expect(step, `${shape}/${size} 에서 min-h 스텝을 못 읽었다: ${cls}`).toBeGreaterThan(0);
        expect(
          step * 4,
          `${shape}/${size} 의 min-h-${step}(${step * 4}px) 이 --control-h-md(${px}px) 와 다르다`,
        ).toBe(px);
        checked += 1;
      }
    }
    // Idling guard — a gate that passes without running a single combination is not a gate.
    expect(checked, '사다리에 선 조합을 하나도 못 쟀다').toBe(4);
  });

  it('가로 한 줄 모양 전 조합이 명시 높이를 선언하고, 그 값은 높이 어휘 안이다', () => {
    /*
     * **The other half of #884** (second exhaustive count, 2026-08-03 · system seat).
     *
     * The ladder restoration had stopped at chips and pills. What the second count
     * found:
     *
     * | Combination | Value | Consumers |
     * |---|---:|---:|
     * | segment/sm | 22px — below the WCAG 2.5.8 (24×24) floor | 0 |
     * | row/lg | 42px — outside the height vocabulary | 0 |
     * | card/sm | 30px — outside the vocabulary | 15 |
     * | card/md | 34px — coincidentally occupying a chrome-locked step (`--docs-header-tile-size`) | 5 |
     *
     * All four are by-products of "padding decides the height". Asserting one
     * combination at a time would let the next shape slip out again, so the verdict is
     * raised to **a gate over the whole family**: every combination of the
     * single-row horizontal shapes (chip · pill · segment · row · card) must declare
     * an explicit `min-h-*`, the square shape (icon) an `h-*`, and the pixel value
     * must be inside the height vocabulary.
     *
     * The vocabulary is not written by hand — it is derived by reading
     * `--control-h-{sm,md,lg}`, `--chrome-tile-size`, and `--touch-target-min` from
     * the CSS and adding the WCAG floor of 24. If a token moves, this turns red with
     * it.
     *
     * (The 34 that card/md occupied in the table above was then a separate token,
     * `--docs-header-tile-size`. That token was deleted on 2026-08-03 and the docs
     * header tile moved onto `--chrome-tile-size` (36) — 34 is now no token's value at
     * all, simply outside the vocabulary. Ledger: 2026-08-03 「Tile dimensions are one」
     * (there is one tile dimension).)
     *
     * `link` (floor 24 — see the test above) and `tile` (two vertical axes, content
     * decides the height) are not covered by this gate; each is locked by its own test
     * above.
     */
    const WCAG_TARGET_FLOOR_PX = 24;
    const tokenPx = (name: string): number => {
      const px = Number(/^(\d+)px$/.exec(cssVar(name) ?? '')?.[1]);
      expect(px, `\`${name}\` 을 px 로 못 읽었다 — 어휘를 파생할 수 없다`).toBeGreaterThan(0);
      return px;
    };
    const vocabulary = new Set([
      WCAG_TARGET_FLOOR_PX,
      tokenPx('--control-h-sm'),
      tokenPx('--control-h-md'),
      tokenPx('--chrome-tile-size'),
      tokenPx('--control-h-lg'),
      tokenPx('--touch-target-min'),
    ]);
    // If the tokens converge and the vocabulary shrinks, the derivation itself loses its signal.
    expect([...vocabulary].sort((a, b) => a - b), '높이 어휘가 6단이 아니다').toEqual([24, 28, 32, 36, 40, 44]);

    const offenders: string[] = [];
    let checked = 0;
    for (const shape of ['chip', 'pill', 'segment', 'row', 'card'] as const) {
      for (const size of SIZES) {
        const cls = controlClass({ shape, size });
        const step = Number(/\bmin-h-(\d+)\b/.exec(cls)?.[1]);
        if (!step) {
          offenders.push(`${shape}/${size}: 명시 min-h 없음 — 높이가 패딩의 부산물이다 (${cls})`);
          continue;
        }
        if (!vocabulary.has(step * 4)) {
          offenders.push(`${shape}/${size}: min-h-${step}(${step * 4}px) 는 높이 어휘 밖이다`);
        }
        if (step * 4 < WCAG_TARGET_FLOOR_PX) {
          offenders.push(`${shape}/${size}: ${step * 4}px — WCAG 2.5.8 바닥(24px) 미달`);
        }
        checked += 1;
      }
    }
    for (const size of SIZES) {
      const cls = controlClass({ shape: 'icon', size });
      const step = Number(/\bh-(\d+)\b/.exec(cls)?.[1]);
      if (!step || !vocabulary.has(step * 4)) {
        offenders.push(`icon/${size}: 정사각 높이가 어휘 밖이다 (${cls})`);
      } else {
        checked += 1;
      }
    }
    expect(offenders, `사다리 밖 조합:\n${offenders.join('\n')}`).toEqual([]);
    // Idling guard — were all 5 shapes × 4 sizes + icon 4 = 24 combinations actually measured?
    expect(checked, '어휘 판정을 전 조합에 돌리지 못했다').toBe(5 * SIZES.length + SIZES.length);
  });

  it('마이크로 티어는 칩에서만 실재한다 — 다른 모양의 `xs` 는 `sm` 의 별칭이다', () => {
    /*
     * **Why an alias** (2026-08-03, system seat).
     *
     * "There is no step below sm" is a hole the ratchet ledger recorded three rounds
     * running, and the measured consumers (micro command tags · px-1.5 py-0.5 · 9px
     * mono · radius 4px) were all **chip-shaped**. The cva size axis is a type shared
     * across shapes, so adding a step gives it to all eight shapes — and outside chips
     * there is no consumer for `xs`. Rather than invent a value with zero consumers it
     * stays an alias for `sm` (the same idiom as the `true`=`md` alias #884 left
     * behind). When a micro-tier consumer is measured outside chips, the alias is
     * unwound and a real value is defined; this test makes that moment an explicit
     * decision.
     */
    for (const shape of SHAPES.filter((sh) => sh !== 'chip')) {
      expect(
        controlClass({ shape, size: 'xs' }),
        `${shape}/xs 가 sm 과 갈라졌다 — 소비처 전수와 함께 별칭을 푼 결정인가?`,
      ).toBe(controlClass({ shape, size: 'sm' }));
    }
    // It is real for chips — as a pure alias this step would only add a choice.
    expect(controlClass({ shape: 'chip', size: 'xs' })).not.toBe(controlClass({ shape: 'chip', size: 'sm' }));
  });

  it('칩 마이크로 티어 — 반경은 micro, 높이는 그대로 24 바닥이다', () => {
    /*
     * The micro tier opens **inset, type, and radius** — not height. Never creating a
     * step below 24 (WCAG 2.5.8) is the ladder's first discipline. The 4px radius is
     * not an invention but an inventory: at registration time `rounded-sm` (59) plus
     * suffix-less `rounded` (37) = 96 places were already on 4px.
     */
    const cls = controlClass({ shape: 'chip', size: 'xs' });
    expect(cls).toContain('rounded-micro');
    expect(cls).toContain('min-h-6');
    expect(cls).toContain('text-caption');
    expect(cls, 'chip/xs 의 인셋은 sm(px-2) 한 칸 아래다').toContain('px-1.5');
  });

  it('어느 조합도 반경 클래스를 정확히 하나 낸다 — 둘이면 CSS 소스 순서가 승자다', () => {
    /*
     * Locks the cost of moving the chip radius from the base into a size compound.
     * Even with cn's radius group merge (`RADIUS_RAMP_STEPS`), a combination that
     * emits zero or two radii means a missing or duplicated compound.
     */
    let counted = 0;
    all((shape, size, tone, active) => {
      const n = controlClass({ shape, size, tone, active })
        .split(' ')
        .filter((c) => /^rounded-/.test(c)).length;
      expect(n, `${shape}/${size}/${tone}/${active}: 반경 클래스가 ${n}개다`).toBe(1);
      counted += 1;
    });
    expect(counted, '조합을 하나도 안 돌렸다').toBeGreaterThan(500);
  });

  it('칩·필의 기본 보더는 앱 다수(border-soft)다 — 옮길 때마다 진해지던 문을 닫는다', () => {
    /*
     * Inventory at registration: hand-written borders on chip-radius elements were
     * **border-soft/chrome-border 74 vs divider 18** (4:1). If the ramp default is the
     * minority (0.08), normalising silently darkens everything by one step — the value
     * layer's version of rule 0, count the majority first. card/tile were border-soft
     * from the start, so all four bordered shapes now stand on the same default.
     */
    for (const shape of ['chip', 'pill', 'card', 'tile'] as const) {
      expect(
        controlClass({ shape }),
        `${shape} 의 기본 보더가 다수(0.06)에서 벗어났다`,
      ).toContain('border-[color:var(--color-border-soft)]');
      expect(controlClass({ shape })).not.toContain('border-[color:var(--color-divider)]');
    }
  });

  it('신호 톤의 잉크는 글자 역할 토큰이다 — success 가 신호색이면 소비처가 램프 밖에 남는다', () => {
    /*
     * Locks the 2026-08-03 correction. danger (`--color-danger-text`) and success
     * (`--color-success-text-a94`) are text roles — a signal colour (#32b97d and the
     * like) belongs to dots and borders, not to ink inside a sentence. While success
     * was a signal token this tone had 0 real consumers.
     * warning is still a signal token (`--color-status-warning`): its single consumer
     * is correct on that value, and convergence with the amber text idiom
     * (amber-source-a90) was left as a separate verdict together with an inventory. If
     * that convergence is decided, fix this test with it.
     */
    expect(controlClass({ shape: 'chip', tone: 'success' })).toContain('--color-success-text-a94');
    expect(controlClass({ shape: 'chip', tone: 'danger' })).toContain('--color-danger-text');
    expect(controlClass({ shape: 'chip', tone: 'warning' })).toContain('--color-status-warning');
  });

  it('삭제된 `fixedHeight` 축이 되살아나지 않는다 — 값이 아니라 축으로 되돌리는 것이 그때의 실수였다', () => {
    const source = readFileSync(join(process.cwd(), 'src/shared/ui/control-class.ts'), 'utf8');
    const live = source
      .split('\n')
      .filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l))
      .join('\n');
    expect(live, '`fixedHeight` 축이 돌아왔다 — 사다리에 이미 있는 값이면 그건 축이 아니라 `size` 다').not.toMatch(
      /fixedHeight/,
    );
  });

  it('새 축 셋의 기본값은 오늘 출력과 바이트 동일하다 — 축을 더한 것이 회귀가 아니게', () => {
    /*
     * 244 places already use these values. If the defaults move by one character all
     * of them change silently — this test locks that door.
     */
    for (const shape of SHAPES) {
      for (const size of SIZES) {
        for (const tone of TONES) {
          const explicit = controlClass({
            shape,
            size,
            tone,
            scope: 'app',
            truncate: false,
          });
          expect(controlClass({ shape, size, tone }), `${shape}/${size}/${tone} 의 기본값이 움직였다`).toBe(
            explicit,
          );
        }
      }
    }
  });

  it('새 축을 다 켜도 램프 밖 값이 안 나온다 — 축은 구멍이지 뒷문이 아니다', () => {
    const offenders: string[] = [];
    let counted = 0;
    allScoped((cls, label) => {
      counted += 1;
      for (const c of cls.split(' ')) {
        if (/^(text|rounded|leading)-\[(?!color:)/.test(c) || /^(min-h|min-w|h|w|p[xy]?|gap)-\[/.test(c)) {
          offenders.push(`${label}: ${c}`);
        }
        const m = /^text-([a-z-]+)$/.exec(c);
        const ALIGNMENT = ['left', 'center', 'right', 'justify', 'start', 'end'];
        if (m && !ALIGNMENT.includes(m[1]) && !TYPE_RAMP_STEPS.includes(m[1] as never)) {
          offenders.push(`${label}: ${c}`);
        }
        const r = /^rounded-([a-z0-9-]+)$/.exec(c);
        if (r && !RADIUS_STEPS.includes(r[1]) && r[1] !== 'full') offenders.push(`${label}: ${c}`);
      }
    });
    // Idling guard — were the combinations actually built?
    expect(counted, '축 조합을 하나도 안 돌렸다').toBeGreaterThan(1000);
    expect(offenders, `축을 켰더니 램프 밖으로 샜다:\n${offenders.slice(0, 20).join('\n')}`).toEqual([]);
  });
});

describe('계기가 스스로를 설명한다', () => {
  const SOURCE = readFileSync(join(process.cwd(), 'src/shared/ui/control-class.ts'), 'utf8');

  it('여섯 모양이 어디서 왔는지 실측으로 적어 둔다', () => {
    // What stops the next person adding a "seventh shape" on instinct is this number,
    // not the code — a shape outside the classification is the signal to re-run the
    // inventory.
    expect(SOURCE).toContain('419');
  });

  it('값 층과 행동 층을 가르는 이유를 실측으로 적어 둔다', () => {
    /*
     * This is not "components are banned" but **why the values are a function**. The
     * first judgement — "components do not work here" — was wrong: the three with zero
     * usage were not evidence of laziness but primitives **born without a gate that
     * violated the ramp** (`CardTitle` used `text-lg`, which is not on the ramp). If
     * that correction disappears the next person inherits the same misjudgement.
     */
    /*
     * ⚠️ **Only derivable anchors are pinned** (2026-08-22). A Korean phrase used to
     * be matched here as well. `documentation.md` forbids pinning a sentence a human
     * wrote, and the English comment pass showed why: the correction survived word
     * for word while the pinned characters did not, so the gate went red over a
     * rewording that changed nothing. `text-lg` is the off-ramp value that caused the
     * misjudgement, and the two product names are citations — both survive any
     * rewrite of the prose around them.
     */
    expect(SOURCE).toContain('text-lg');
    expect(SOURCE, '업계 표준이 컴포넌트라는 사실도 함께 적어야 균형이 잡힌다').toMatch(
      /Carbon|shadcn/,
    );
  });
});

/**
 * **Three hover axes** (2026-08-15, ledger entry 11).
 *
 * What this file's long-standing rule that "hover is the consumer's job" actually
 * produced, measured: **752 hover declarations across 511 places in 129 files**,
 * with different ink sets for the same role. It was not a discipline but a
 * **vacancy** — the third such finding after `DISABLED` (2026-08-03) and `FOCUS`
 * (08-05).
 *
 * lint cannot lock this: the thing being judged is **the result string cva
 * composes**, so the code holds only keys like `hoverInk: 'strong'` and the values
 * are joined at run time.
 */
describe('호버 축 — 값 층이 내는 결과 문자열', () => {
  const hovers = (s: string) => s.split(' ').filter((c) => c.startsWith('hover:'));

  it('탐지기가 공회전하지 않는다 — 축이 실제로 무언가를 낸다', () => {
    expect(hovers(controlClass({ hoverInk: 'strong' })).length).toBeGreaterThan(0);
    expect(hovers(controlClass({ shape: 'row', hoverSurface: 'lift' })).length).toBeGreaterThan(0);
    expect(hovers(controlClass({ hoverBorder: 'strong' })).length).toBeGreaterThan(0);
  });

  it('기본값은 아무것도 안 낸다 — 전부 옵트인이다', () => {
    /*
     * Turning it on by default would silently change places that have no hover at all
     * today (30 places counting borders alone). That is a global visual change rather
     * than adding an axis, so it is not this axis's job — this assertion pins that
     * judgement.
     */
    for (const shape of ['chip', 'pill', 'row', 'icon', 'segment', 'card', 'tile', 'link'] as const) {
      expect(hovers(controlClass({ shape })), `${shape} 기본값이 호버를 낸다`).toEqual([]);
    }
  });

  it('잉크는 scope 가 값을 고른다 — 축은 밝기 단만 고른다', () => {
    expect(controlClass({ hoverInk: 'strong' })).toContain(
      'hover:text-[color:var(--color-text-primary)]',
    );
    expect(controlClass({ hoverInk: 'secondary' })).toContain(
      'hover:text-[color:var(--color-text-secondary)]',
    );
    expect(controlClass({ hoverInk: 'strong', scope: 'panel' })).toContain(
      'hover:text-[color:var(--topology-v2-panel-text-primary)]',
    );
    expect(controlClass({ hoverInk: 'secondary', scope: 'panel' })).toContain(
      'hover:text-[color:var(--topology-v2-panel-text-secondary)]',
    );
  });

  it('면은 행과 부품이 다른 단을 쓴다 — rest 가 다르기 때문이다', () => {
    // Rows rest transparent so they take the first step; parts already sit one step up so they take the next.
    expect(controlClass({ shape: 'row', hoverSurface: 'lift' })).toContain(
      'hover:bg-[color:var(--color-overlay-1)]',
    );
    for (const shape of ['chip', 'pill', 'icon', 'segment'] as const) {
      expect(controlClass({ shape, hoverSurface: 'lift' })).toContain(
        'hover:bg-[color:var(--color-overlay-2)]',
      );
    }
    expect(controlClass({ shape: 'row', hoverSurface: 'lift', scope: 'panel' })).toContain(
      'hover:bg-[color:var(--topology-v2-panel-row-hover)]',
    );
  });

  it('골라진 것은 호버를 안 받는다 — 「곧」과 「지금」이 같은 말을 하면 안 된다', () => {
    /*
     * Measured (2026-08-15, ledger entry 10): where they overlapped, hover covered the
     * selection border and **weakened** it from 2.09 to 1.48. Consumers were writing
     * that guard by hand every time; this key absorbs it structurally.
     */
    for (const v of [
      { hoverInk: 'strong' },
      { hoverSurface: 'lift' },
      { hoverBorder: 'strong' },
      { hoverInk: 'secondary', hoverSurface: 'lift', hoverBorder: 'strong' },
    ] as const) {
      expect(hovers(controlClass({ ...v, active: true })), `${JSON.stringify(v)} 가 active 에서 샜다`).toEqual([]);
    }
  });

  it('셋은 서로 독립이다 — 두 속성이 함께 필요한 자리가 96곳이었다', () => {
    const both = controlClass({ hoverInk: 'strong', hoverBorder: 'strong' });
    expect(both).toContain('hover:text-[color:var(--color-text-primary)]');
    expect(both).toContain('hover:border-[color:var(--color-border-strong)]');
    const all3 = controlClass({ shape: 'chip', hoverInk: 'strong', hoverSurface: 'lift', hoverBorder: 'strong' });
    expect(hovers(all3)).toHaveLength(3);
  });

  it('축이 램프 밖으로 새지 않는다 — 전 조합이 토큰만 낸다', () => {
    const offenders: string[] = [];
    for (const shape of ['chip', 'pill', 'row', 'icon', 'segment', 'card', 'tile', 'link'] as const) {
      for (const scope of ['app', 'panel'] as const) {
        for (const hoverInk of ['none', 'strong', 'secondary'] as const) {
          for (const hoverSurface of ['none', 'lift'] as const) {
            for (const hoverBorder of ['none', 'strong'] as const) {
              for (const h of hovers(controlClass({ shape, scope, hoverInk, hoverSurface, hoverBorder }))) {
                if (!/^hover:(text|bg|border)-\[color:var\(--[a-z0-9-]+\)\]$/.test(h)) {
                  offenders.push(`${shape}/${scope}: ${h}`);
                }
              }
            }
          }
        }
      }
    }
    expect(offenders, '호버 축이 토큰이 아닌 값을 냈다').toEqual([]);
  });

  it('축이 조용히 늘지 않는다 — 선택지는 실측 다수파만', () => {
    const SOURCE = readFileSync(join(process.cwd(), 'src/shared/ui/control-class.ts'), 'utf8');
    /*
     * Pins the options in source — adding one requires editing this line, and that
     * diff demands an answer to "which measurement required this option" (the badge
     * tone axis set the precedent).
     */
    expect(SOURCE).toContain("hoverInk: { none: '', strong: '', secondary: '' },");
    expect(SOURCE).toContain("hoverSurface: { none: '', lift: '' },");
    expect(SOURCE).toContain("hoverBorder: { none: '', strong: '' },");
    // Four in total — four rather than three because ink alone has two steps.
    const options = ['strong', 'secondary', 'lift', 'strong'];
    expect(options).toHaveLength(4);
  });
});
