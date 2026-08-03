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
 * `controlClass` 의 계약.
 *
 * ## 이 파일이 없으면 이 함수는 값어치가 없다
 *
 * 손 className 을 함수 뒤로 옮기기만 하면 **이탈값이 한 파일에 모였을 뿐** 여전히
 * 이탈값이다. 이 함수가 손으로 쓰는 것보다 나은 유일한 이유는 **여기서 나오는
 * 모든 값이 램프 위에 있음이 강제된다**는 것이고, 그 강제가 이 파일이다.
 *
 * 실측 근거: 2026-08-03 design-system 감사가 찾은 300+ 이탈값은 전부 «컴포넌트가
 * 없어서 손으로 쓴» 자리에서 나왔다.
 */

const SHAPES: ControlShape[] = ['chip', 'icon', 'row', 'pill', 'card', 'link', 'tile', 'segment'];
const SIZES: ControlSize[] = ['sm', 'md', 'lg'];
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
 * 값 층이 **읽어도 되는 토큰 네임스페이스**.
 *
 * 하나뿐이었다가 둘이 됐다. 늘린 이유는 취향이 아니라 실측이다 — 아래
 * 「두 무채 램프는 실제로 다르다」가 두 램프의 값이 갈린다는 것을 `globals.css`
 * 에서 직접 읽어 단언한다. 그 시험이 초록인 한 이 목록은 정당하고, 값이 같아지면
 * 그 시험이 빨개져 **이 목록을 줄이라고 말한다**.
 */
const TOKEN_NAMESPACES = ['--color-', '--topology-v2-panel-text-'];

/** `app/globals.css` 의 radius 램프 3단. 여기 없는 반경은 이탈이다. */
const RADIUS_STEPS = ['chip', 'card', 'panel'];

const all = (fn: (s: ControlShape, z: ControlSize, t: ControlTone, a: boolean) => void) => {
  for (const s of SHAPES) for (const z of SIZES) for (const t of TONES) for (const a of [true, false]) fn(s, z, t, a);
};

/** 위와 같은 전수에 `scope` 축을 더한 것. 새 축이 램프 밖으로 새지 않는지 볼 때 쓴다. */
const allScoped = (fn: (cls: string, label: string) => void) => {
  for (const s of SHAPES)
    for (const z of SIZES)
      for (const t of TONES)
        for (const a of [true, false])
          for (const sc of SCOPES)
            for (const tr of [true, false])
              for (const inl of [true, false])
                fn(
                  controlClass({ shape: s, size: z, tone: t, active: a, scope: sc, truncate: tr, inline: inl }),
                  `${s}/${z}/${t}/${a}/${sc}/trunc=${tr}/inline=${inl}`,
                );
};

describe('controlClass — 램프 밖 값을 낼 수 없다', () => {
  it('arbitrary 크기·반경을 내지 않는다', () => {
    const offenders: string[] = [];
    all((shape, size, tone, active) => {
      for (const c of controlClass({ shape, size, tone, active }).split(' ')) {
        // `text-[color:var(--color-…)]` 는 색이라 정당하다. 금지는 **치수**의 arbitrary 다.
        if (/^(text|rounded|leading)-\[(?!color:)/.test(c) || /^(min-h|min-w|h|w|p[xy]?|gap)-\[/.test(c)) {
          offenders.push(`${shape}/${size}/${tone}/${active}: ${c}`);
        }
      }
    });
    expect(offenders, `램프를 우회한 값이 있다:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('폰트 크기는 등록된 타입 램프 스텝만 쓴다', () => {
    // 미정의 스텝은 **리터럴을 안 남긴다** — Tailwind 가 클래스를 아예 안 만들고
    // 루트 16px 로 렌더될 뿐이라 하드코딩 검사의 시야 밖이다(2026-07-27 실측).
    const offenders: string[] = [];
    all((shape, size, tone, active) => {
      for (const c of controlClass({ shape, size, tone, active }).split(' ')) {
        const m = /^text-([a-z-]+)$/.exec(c);
        // `text-` 는 크기 · 정렬 · 색 세 축이 이름을 공유한다. 크기 축만 본다 —
        // 안 가르면 `text-left` 가 「램프에 없는 스텝」으로 잡혀 게이트가 거짓말을 한다.
        const ALIGNMENT = ['left', 'center', 'right', 'justify', 'start', 'end'];
        if (m && !ALIGNMENT.includes(m[1]) && !TYPE_RAMP_STEPS.includes(m[1] as never)) {
          offenders.push(`${shape}/${size}: ${c}`);
        }
      }
    });
    expect(offenders, `타입 램프에 없는 스텝:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('반경은 3단 램프 안이다', () => {
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
        // 색 유틸리티는 반드시 등재된 토큰 네임스페이스를 통과해야 한다.
        if (/^(text|bg|border)-\[/.test(c) && !TOKEN_NAMESPACES.some((ns) => c.includes(`var(${ns}`))) {
          offenders.push(`${shape}: ${c}`);
        }
      }
    });
    expect(offenders, `토큰을 안 거친 색:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('두 번째 채색 시스템을 만들지 않는다 — 인디고 외 hue 0', () => {
    // 헌장: 무채색 + 단일 인디고. 눌림 상태를 새 색으로 표현하는 것이 가장 흔한 이탈이다.
    const tokens = new Set<string>();
    all((shape, size, tone, active) => {
      for (const m of controlClass({ shape, size, tone, active }).matchAll(/var\(--color-([a-z0-9-]+)\)/g)) {
        tokens.add(m[1]);
      }
    });
    /*
     * 헌장은 무채색 + 단일 인디고 **+ 신호 3종**(warning · error · success)이다.
     * 신호는 「연결됨 / 실패 / 경고」 같은 상태에만 쓰고 장식으로 확장하지 않는다.
     * 그 셋 밖의 hue 가 나오면 두 번째 채색 시스템이다.
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
    // 같은 값을 내는 두 모양이 있으면 그건 분류가 아니라 이름이 둘인 것이다.
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
     * ## 뒤집힌 단언 (2026-08-03 소유자 결정 · `docs/DECISIONS.md`)
     *
     * 여기 있던 단언은 **「기본값은 패딩이 높이를 정한다」**
     * (`expect(controlClass({ shape: 'chip' })).not.toMatch(/\bh-\d/)`) 였다.
     * 그 규칙이 만든 값이 칩 24/30/34 · 필 20/22/30 이고, **30 · 34 · 22 · 20
     * 은 이 앱의 높이 어휘에 없는 값**이다. 그 값이 계약(32)과 부딪히자 값을
     * 고치는 대신 예외 축(`fixedHeight`)이 붙었다 — 축은 증상이었다.
     *
     * 그래서 규칙을 뒤집는다: **높이는 사다리가 정하고, 패딩은 그 안에서
     * 결정된다.** `md`·`lg` 는 `--control-h-md`(32px)에 서고, `sm` 만 WCAG
     * 2.5.8 최소 타깃 24px 에 남는다.
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
    // 하드 높이는 쓰지 않는다 — 줄바꿈한 칩을 잘라 내용을 숨긴다.
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
    // 2026-08-03 정규화가 찾은 구멍: 모양 여섯이 전부 가로라 세로 액션 타일 5개가
    // 시스템 밖에 있었다. 전수에서 「모양」을 셀 때 축을 하나만 봤다.
    const cls = controlClass({ shape: 'tile' });
    expect(cls).toContain('flex-col');
    expect(cls).toContain('text-center');
  });

  it('문장 속 글자 컨트롤은 줄 상자를 밀지 않는다 — WCAG 2.5.8 인라인 면제', () => {
    /*
     * `link` 에 터치 타깃을 실었더니 **문장 속 컨트롤의 줄 상자가 21.3 → 44px 로
     * 밀려 올라갔다**(2026-08-03 실측). 하나를 고치다 다른 하나를 깬 것이다.
     *
     * WCAG 2.5.8 은 인라인을 명시적으로 면제한다 — *"The target is in a sentence
     * or its size is otherwise constrained by the line-height of non-target text."*
     */
    for (const size of SIZES) {
      expect(
        controlClass({ shape: 'link', size, inline: true }),
        `link/${size}/inline 이 최소 높이를 실어 줄 상자를 민다`,
      ).not.toMatch(/min-h-/);
    }
  });

  it('인라인 면제는 `link` 에만 뜻이 있다 — 상자를 가진 모양은 타깃을 유지한다', () => {
    // `inline` 을 아무 모양에나 넘겨 타깃을 벗기는 우회를 막는다.
    for (const shape of SHAPES.filter((s) => s !== 'link')) {
      expect(
        controlClass({ shape, inline: true }),
        `${shape} 가 inline 으로 규격을 잃는다`,
      ).toBe(controlClass({ shape, inline: false }));
    }
  });

  it('홀로 선 글자 컨트롤은 손가락에 잡힌다 — 기본값이 안전한 쪽이다', () => {
    /*
     * `link` 는 보더도 배경도 없어 시각적으로는 글자 그대로여야 하지만, 히트
     * 영역까지 글자 크기면 24 → 16px 로 내려가 WCAG 2.5.8(24×24) 아래가 된다.
     * 실제로 설정 시트 컨트롤 3개가 이 이유로 시스템 밖에 남았다.
     */
    for (const size of SIZES) {
      expect(controlClass({ shape: 'link', size }), `link/${size} 에 최소 높이가 없다`).toMatch(
        /min-h-/,
      );
    }
  });

  it('모든 모양이 반경을 갖는다 — 안 주면 호버 배경이 각진다', () => {
    // `row` 가 처음에 반경 없이 나가 정규화된 목록 행의 호버가 각지게 됐다.
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
    // `cn()` 이 tailwind-merge 라 같은 축의 클래스는 뒤가 이긴다. 자리잡기만 넘기라는
    // 규율이 문서에만 있으면 안 지켜지므로, 최소한 «덧붙는다»는 계약은 못박는다.
    expect(controlClass({ shape: 'chip', className: 'absolute right-2' })).toContain('absolute');
  });
});

/**
 * 값 층의 구멍을 메운 축들 — **원장이 반복해서 센 것만** 들어왔다.
 *
 * 여기 있는 시험은 전부 「이 축이 실재하는 이유」를 잠근다. 축은 공짜가 아니다:
 * 하나 늘 때마다 다음 사람이 고를 것이 늘고, 근거 없이 늘어난 축은 그 자체로
 * 두 번째 시스템이 된다. 그래서 각 축마다 **근거가 사라지면 빨개지는** 시험을
 * 하나씩 둔다.
 */
describe('controlClass — 여덟째 모양과 세 축', () => {
  const GLOBALS = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');
  const cssVar = (name: string): string | undefined =>
    new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm').exec(GLOBALS)?.[1].trim();

  it('여덟째 모양은 보더가 없고 인셋이 있다 — 그 사이가 비어 있어서 생겼다', () => {
    /*
     * `chip`/`pill`/`card`/`tile` 은 보더가 필수라 이미 보더를 두른 상자 안에서
     * 「상자 속 상자」가 되고, `link` 는 인셋이 0이라 세그먼트의 히트 영역이
     * 사라진다. 그 둘 다 아니어야 이 모양이 존재할 이유가 있다.
     */
    for (const size of SIZES) {
      const cls = controlClass({ shape: 'segment', size });
      // ⚠️ 변형 접두(`disabled:hover:border-inherit`)를 걸러야 한다 — 안 거르면 이
      // 시험이 **모든 모양에 대해** 빨개진다. 첫 실행이 실제로 그랬다.
      const base = cls.split(' ').filter((c) => !c.includes(':') || c.startsWith('border-[color:'));
      expect(base.join(' '), `segment/${size} 에 보더가 붙었다 — 상자 속 상자가 된다`).not.toMatch(
        /(^| )border(-|$| )/,
      );
      expect(cls, `segment/${size} 에 좌우 인셋이 없다 — 그러면 link 와 같다`).toMatch(/\bpx-/);
    }
  });

  it('세그먼트 반경은 `--chrome-radius-inner` 와 같은 값이다 — 별칭이라 픽셀이 안 바뀐다', () => {
    /*
     * 소비처 다섯이 `rounded-[var(--chrome-radius-inner)]` 를 쓰고 있었다. 옮겨도
     * 되는 근거는 그 토큰이 `--radius-chip` 의 **별칭**이라는 사실 하나뿐이므로,
     * 그 사실을 CSS 에서 직접 읽어 잠근다. 누가 `--chrome-radius-inner` 를 7px
     * 로 갈라 놓으면 이 시험이 빨개지고, 그때는 옮긴 다섯 자리가 1px 틀어진다.
     */
    expect(
      cssVar('--chrome-radius-inner'),
      '`--chrome-radius-inner` 가 `--radius-chip` 의 별칭이 아니게 됐다 — segment 가 rounded-chip 을 쓰면 안 된다',
    ).toBe('var(--radius-chip)');
    expect(controlClass({ shape: 'segment' })).toContain('rounded-chip');
  });

  it('두 무채 램프는 실제로 값이 다르다 — 같아지면 `scope` 축은 폐기 대상이다', () => {
    /*
     * `scope` 축이 존재하는 **유일한** 근거다. 두 램프가 같은 값이 되는 날
     * 이 축은 아무것도 안 하면서 고를 것만 늘리는 축이 되므로, 그날 이 시험이
     * 빨개져 지우라고 말해야 한다.
     */
    const STEPS = ['primary', 'secondary', 'tertiary', 'quaternary'] as const;
    const pairs: Array<[string, string]> = [];
    for (const step of STEPS) {
      const app = cssVar(`--color-text-${step}`);
      const panel = cssVar(`--topology-v2-panel-text-${step}`);
      expect(app, `--color-text-${step} 를 못 읽었다`).toBeTruthy();
      expect(panel, `--topology-v2-panel-text-${step} 를 못 읽었다`).toBeTruthy();
      pairs.push([app as string, panel as string]);
    }
    // 공회전 차단 — 4단을 다 못 읽었으면 아래 단언은 빈 집합을 통과한다.
    expect(pairs.length, '두 램프의 단을 하나도 못 짝지었다').toBe(4);
    /*
     * ⚠️ 처음엔 「하나라도 다르면 통과」였고, `/gate-probe` 가 그게 **게이트가
     * 아님**을 잡았다: 4단 중 하나를 같은 값으로 되돌려도 초록이었다. 축이
     * 재매핑하는 단은 **넷 다** 각자 근거가 있어야 한다 — 한 단이 수렴하면 그
     * 단의 컴파운드는 아무것도 안 하면서 자리만 차지한다.
     */
    const same = pairs
      .map(([a, b], i) => (a === b ? `${STEPS[i]}: ${a}` : null))
      .filter((x): x is string => x !== null);
    expect(
      same,
      `두 무채 램프의 이 단이 같아졌다 — 그 단의 \`scope: 'panel'\` 컴파운드는 근거가 없다.\n` +
        `수렴한 단을 값 층에서 지우거나(그 단은 tone 하나로 충분하다), 넷 다 수렴했으면 축 자체를 지워라.\n` +
        same.join('\n'),
    ).toEqual([]);
  });

  it('`scope: panel` 은 잉크만 바꾼다 — 바탕·보더로 새면 두 번째 채색 시스템이다', () => {
    /*
     * 이 축을 여는 대가는 「두 번째 램프를 값 층이 인정한다」는 것뿐이어야 한다.
     * 패널 네임스페이스가 `bg-`/`border-` 로도 나가기 시작하면 그때는 진짜로
     * 두 벌의 채색 시스템이 되고, 헌장 위반이다.
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

  it('`scope` 가 실제로 무언가를 바꾼다 — 무채 4단은 패널에서 다른 잉크다', () => {
    // 위 시험이 「안 바뀐다」만 보므로, 이 시험이 없으면 축을 통째로 no-op 으로
    // 만들어도 둘 다 초록이다.
    for (const tone of ['default', 'muted', 'secondary', 'strong'] as const) {
      expect(
        controlClass({ shape: 'chip', tone, scope: 'panel' }),
        `${tone} 가 패널에서 그대로다 — scope 축이 공회전한다`,
      ).not.toBe(controlClass({ shape: 'chip', tone, scope: 'app' }));
    }
  });

  it('`truncate` 는 display 를 flex 밖으로 뺀다 — 안 그러면 `…` 가 안 그려진다', () => {
    /*
     * 실측: 같은 텍스트·같은 폭에서 `inline-block` 은 `…`, `inline-flex` 는
     * 하드 클립. `truncate` 유틸리티만 얹는 것으로는 못 고친다.
     */
    for (const shape of SHAPES) {
      const cls = controlClass({ shape, truncate: true });
      expect(cls, `${shape}/truncate 에 truncate 가 없다`).toContain('truncate');
      expect(cls, `${shape}/truncate 가 여전히 flex 다 — 말줄임이 하드 클립된다`).not.toMatch(
        /(^| )(inline-)?flex( |$)/,
      );
      // 끄면 오늘 그대로다.
      expect(controlClass({ shape, truncate: false })).toBe(controlClass({ shape }));
    }
  });

  it('채움 톤은 바탕과 잉크를 한 쌍으로 내고 보더를 지운다', () => {
    /*
     * 잉크만 내면 소비처가 `bg-…` 를 계속 손으로 쓴다 = 모양을 className 으로
     * 넘기는 것 = 층이 있으나 마나. 그래서 쌍으로 낸다.
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
    // 전경 토큰은 실재해야 한다. 없으면 브라우저가 색을 통째로 무시하고 상속색이
    // 나오는데, 그건 화면에서 「조금 어두운 글자」로 보일 뿐 아무도 못 짚는다.
    expect(cssVar('--color-text-on-accent'), '`--color-text-on-accent` 가 globals.css 에 없다').toBeTruthy();
  });

  it('`min-h-8` 은 `--control-h-md` 와 같은 값이다 — 사다리 토큰이 움직이면 여기가 먼저 빨개진다', () => {
    /*
     * **이 시험이 이 정리의 핵심 게이트다.** 값 층은 Tailwind 스텝(`min-h-8`)을
     * 내고 토큰(`--control-h-md`)은 CSS 에 산다. 둘이 같은 값이라는 것은 아무
     * 코드도 강제하지 않으므로, 여기서 **CSS 를 직접 읽어** 잠근다.
     *
     * 값을 손으로 등재하지 않는다 — Tailwind spacing 은 1 = 4px 이므로 스텝에
     * 4를 곱해 토큰의 px 와 맞춘다. 누가 `--control-h-md` 를 33px 로 옮기면
     * 램프의 32px 은 그날부터 사다리 밖인데, 그 사실을 말해 주는 것이 이 줄이다.
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
    // 공회전 차단 — 조합을 하나도 안 돌고 통과하는 게이트는 게이트가 아니다.
    expect(checked, '사다리에 선 조합을 하나도 못 쟀다').toBe(4);
  });

  it('가로 한 줄 모양 전 조합이 명시 높이를 선언하고, 그 값은 높이 어휘 안이다', () => {
    /*
     * ## #884 의 남은 절반 (2026-08-03 2차 전수 · 체계석)
     *
     * 사다리 복원이 칩·필에서 멈춰 있었다. 2차 전수가 찾은 것:
     *
     * | 조합 | 값 | 소비처 |
     * |---|---:|---:|
     * | segment/sm | 22px — WCAG 2.5.8(24×24) 바닥 미달 | 0 |
     * | row/lg | 42px — 높이 어휘 밖 | 0 |
     * | card/sm | 30px — 어휘 밖 | 15 |
     * | card/md | 34px — 크롬 잠금 단(`--docs-header-tile-size`)의 우연 점유 | 5 |
     *
     * 넷 다 「패딩이 높이를 정한」 부산물이다. 조합을 하나씩 단언하면 다음
     * 모양이 또 빠지므로, 판정을 **부류 전체의 게이트**로 올린다: 가로 한 줄
     * 모양(chip·pill·segment·row·card)은 전 조합이 명시 `min-h-*` 를,
     * 정사각(icon)은 `h-*` 를 선언하고, 그 픽셀값은 높이 어휘 안이어야 한다.
     *
     * 어휘는 손으로 적지 않는다 — `--control-h-{sm,md,lg}` ·
     * `--chrome-tile-size` · `--touch-target-min` 을 CSS 에서 읽고 WCAG 바닥
     * 24 를 더해 파생한다. 토큰이 움직이면 여기가 같이 빨개진다.
     * `--docs-header-tile-size`(34)는 **일부러 안 넣는다** — 그 단은 문서함
     * 헤더 크롬이 소유한 치수라, 컨트롤이 거기 서면 그게 결함이다.
     *
     * `link`(비인라인 min-h-11 / 인라인 면제)와 `tile`(세로 2축 — 내용이
     * 높이를 정한다)은 이 게이트의 대상이 아니다 — 각자 위의 시험이 잠근다.
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
    // 토큰이 서로 수렴해 어휘가 쪼그라들면 파생 자체가 신호를 잃는다.
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
    // 공회전 차단 — 5모양×3 + icon 3 = 18 조합을 실제로 다 쟀는가.
    expect(checked, '어휘 판정을 전 조합에 돌리지 못했다').toBe(18);
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
     * 244개가 이미 이 값들을 쓰고 있다. 기본값이 한 글자라도 움직이면 그
     * 전부가 조용히 바뀐다 — 이 시험이 그 문을 잠근다.
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
    // 공회전 차단 — 조합이 실제로 만들어졌는지.
    expect(counted, '축 조합을 하나도 안 돌렸다').toBeGreaterThan(1000);
    expect(offenders, `축을 켰더니 램프 밖으로 샜다:\n${offenders.slice(0, 20).join('\n')}`).toEqual([]);
  });
});

describe('계기가 스스로를 설명한다', () => {
  const SOURCE = readFileSync(join(process.cwd(), 'src/shared/ui/control-class.ts'), 'utf8');

  it('여섯 모양이 어디서 왔는지 실측으로 적어 둔다', () => {
    // 다음 사람이 «일곱째 모양» 을 감으로 추가하는 것을 막는 것은 코드가 아니라
    // 이 숫자다 — 분류에 없는 모양이 나왔다는 것은 전수를 다시 세라는 신호다.
    expect(SOURCE).toContain('419');
    expect(SOURCE).toMatch(/전수 분류/);
  });

  it('값 층과 행동 층을 가르는 이유를 실측으로 적어 둔다', () => {
    /*
     * 여기 있는 것은 「컴포넌트 금지」가 아니라 **왜 값이 함수인가**다. 첫 판단은
     * 「컴포넌트는 여기서 안 먹힌다」였고 틀렸다 — 사용처 0이던 셋은 게으름의
     * 증거가 아니라 **게이트 없이 태어나 램프를 위반한** 프리미티브였다
     * (`CardTitle` 이 램프에 없는 `text-lg`). 그 정정이 사라지면 다음 사람이
     * 같은 오판을 물려받는다.
     */
    expect(SOURCE).toContain('text-lg');
    expect(SOURCE, '게이트 없는 컴포넌트가 실패했다는 정정이 남아 있어야 한다').toMatch(
      /게이트 없는 컴포넌트/,
    );
    expect(SOURCE, '업계 표준이 컴포넌트라는 사실도 함께 적어야 균형이 잡힌다').toMatch(
      /Carbon|shadcn/,
    );
  });
});
