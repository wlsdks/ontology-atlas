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

const SHAPES: ControlShape[] = ['chip', 'icon', 'row', 'pill', 'card', 'link'];
const SIZES: ControlSize[] = ['sm', 'md', 'lg'];
const TONES: ControlTone[] = ['default', 'muted', 'strong'];

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
    const hued = [...tokens].filter((t) => !/^(text|divider|border|overlay|canvas|panel|elevated|secondary)/.test(t));
    expect(hued.sort(), `인디고 계열만 허용된다: ${hued.join(', ')}`).toEqual(
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

  it('정사각 모양은 좌우 패딩을 받지 않는다 — 받으면 정사각이 아니다', () => {
    for (const size of SIZES) {
      const cls = controlClass({ shape: 'icon', size });
      expect(cls, `icon/${size} 에 px 가 붙었다: ${cls}`).not.toMatch(/\bpx-/);
      const [, h] = /\bh-(\d+)\b/.exec(cls) ?? [];
      const [, w] = /\bw-(\d+)\b/.exec(cls) ?? [];
      expect(h, `icon/${size} 의 높이·너비가 다르다`).toBe(w);
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

  it('컴포넌트가 아니라 함수인 이유를 실측으로 적어 둔다', () => {
    // 「그냥 컴포넌트로 하지」로 되돌아오는 것을 막는 것은 취향이 아니라 이 사실이다.
    expect(SOURCE).toContain('DetailCard');
    expect(SOURCE).toMatch(/사용처가 \*\*0\*\*/);
  });
});
