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

const SHAPES: ControlShape[] = ['chip', 'icon', 'row', 'pill', 'card', 'link', 'tile'];
const SIZES: ControlSize[] = ['sm', 'md', 'lg'];
const TONES: ControlTone[] = ['default', 'muted', 'secondary', 'strong', 'accent', 'warning', 'danger', 'success'];

/** `app/globals.css` 의 radius 램프 3단. 여기 없는 반경은 이탈이다. */
const RADIUS_STEPS = ['chip', 'card', 'panel'];

const all = (fn: (s: ControlShape, z: ControlSize, t: ControlTone, a: boolean) => void) => {
  for (const s of SHAPES) for (const z of SIZES) for (const t of TONES) for (const a of [true, false]) fn(s, z, t, a);
};

describe('controlClass — 램프 밖 값을 낼 수 없다', () => {
  it('arbitrary 크기·반경을 내지 않는다', () => {
    const offenders: string[] = [];
    all((shape, size, tone, active) => {
      for (const c of controlClass({ shape, size, tone, active }).split(' ')) {
        // `text-[color:var(--color-…)]` 는 색이라 정당하다. 금지는 **치수**의 arbitrary 다.
        if (/^(text|rounded|leading)-\[(?!color:)/.test(c) || /^(h|w|p[xy]?|gap)-\[/.test(c)) {
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
        // 색 유틸리티는 반드시 `var(--color-…)` 를 통과해야 한다.
        if (/^(text|bg|border)-\[/.test(c) && !c.includes('var(--color-')) offenders.push(`${shape}: ${c}`);
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

  it('계약이 치수를 소유한 자리는 높이를 고정할 수 있다 — 2px 이 남지 않게', () => {
    /*
     * 칩 램프는 패딩으로 높이가 정해져 md=30 · lg=34 다. 그런데 설정 시트 계약은
     * `h-8`(32)을 문자열로 못박아, **어느 조합으로도 2px 이 남았다**(2026-08-03
     * 회수 라운드 실측). 램프를 쓰면 계약이 깨지고 계약을 지키면 램프 밖이다.
     */
    expect(controlClass({ shape: 'chip', fixedHeight: true })).toContain('h-8');
    expect(controlClass({ shape: 'pill', fixedHeight: true })).toContain('h-8');
    // 기본값은 여전히 「패딩이 높이를 정한다」 — 칩 143개 중 명시 높이는 38개뿐이라
    // 강제하면 70%의 키가 바뀐다.
    expect(controlClass({ shape: 'chip' })).not.toMatch(/\bh-\d/);
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
