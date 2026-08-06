import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { fieldClass, type FieldFrame, type FieldSize } from '@/shared/ui/control-class';

/**
 * `fieldClass` 의 계약 — 폼 필드의 값 층.
 *
 * ## 왜 별도 cva 이고 아홉째 `shape` 가 아닌가
 *
 * 2026-08-06 디자인 카운슬(「체계」+「위계」)의 판정이다. 셋 다 값 층 자신의
 * 규율에서 나왔다:
 *
 * 1. 모양 여덟의 근거는 `<button>` **419 전수**인데 필드는 **다른 모집단**(폼 63)이다
 * 2. `tone` 10단 중 필드에 뜻이 있는 것이 사실상 0이라 **죽은 조합**이 대부분이 된다
 * 3. 산수 — 아홉째 모양은 `control-class.contract` 전수를 **+320** 만들고,
 *    별도 cva 는 **16**(frame 2 × size 4 × multiline 2)으로 끝난다
 *
 * ## 축이 셋인 근거 — 두 자리가 독립적으로 같은 선을 그었다
 *
 * 「위계」석이 실물을 열고 폼을 셋으로 갈랐다 — **기록**(값이 디스크에 남는다,
 * 눈은 입력에) · **조회**(있는 것에 도착한다, 눈은 **결과**에) · **무대**(카드에
 * 쓰일 글자를 그 자리에서 쓴다). 앞의 둘이 `frame` 축이고, 합치면 안 되는
 * 이유가 그 자리에서 나왔다: 기록을 투명하게 하면 폼이 사라지고, 조회를 무겁게
 * 하면 **입력이 결과를 이긴다**.
 *
 * ## ⚠️ 이 파일에서 가장 중요한 단언 — 「어휘 안인가」로 쓰면 안 된다
 *
 * 「체계」의 음성 프로브 넷 중 하나가 **초록으로 새어 나갔다**: 「한 줄 `md` 를
 * `h-9`(36)으로」. 36 이 높이 어휘 안에 있으니 어휘 검사는 통과시킨 것이다.
 *
 * 그래서 이 계약은 **단↔토큰 1:1** 로 쓴다 — `globals.css` 에서
 * `--control-h-{sm,md,lg}` 의 px 를 **읽어서** 각 단이 그 값을 내는지 대조한다.
 * 값을 여기 베껴 두면 그 사본이 램프와 어긋나는 순간 검사가 못 보는 구멍이 된다.
 */

const ROOT = join(__dirname, '..', '..');
const GLOBALS = readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8');

const FRAMES: FieldFrame[] = ['boxed', 'bare'];
const SIZES: FieldSize[] = ['xs', 'sm', 'md', 'lg'];
const MULTILINE = [false, true] as const;

/** Tailwind 의 `h-N`/`min-h-N` 은 0.25rem 단위. */
const STEP_PX = 4;

function tokenPx(token: string): number | null {
  // coarse 블록의 재선언(`max(...)`)이 아니라 **기본 선언**을 읽는다.
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
 * **단↔토큰 1:1.** 이 파일의 핵심 단언 — 위 머리말의 `h-9` 사고를 막는다.
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
   * `xs` 는 **높이 단이 아니다** — 반경만 한 층 내리는 티어라 높이는 `sm` 과 같다
   * (위 `chip` 의 `xs` 가 쓰는 문법 그대로). 이 단언이 없으면 누군가 `xs` 에
   * 네 번째 높이를 붙여도 아무도 모른다.
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
   * **bare 는 상자를 내면 안 된다.** 부모가 이미 냈고, 여기서 또 내면 그 상자를
   * 안쪽에서 밀어낸다. 「위계」석 판정: 조회 10곳은 전부 **결과가 주목 승자**인
   * 자리라, 입력이 어포던스를 지면 결과를 이긴다.
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
    // multiline 만 `resize-none` 을 더하므로 정확히 둘이어야 한다.
    expect([...variants].length, `실제: ${[...variants].join(' | ')}`).toBe(2);
  });
});

describe('base — 모든 필드가 공유하는 것', () => {
  it('타입은 body 하나다 — 필드는 사용자 텍스트를 받는 자리라 읽기 크기가 하나다', () => {
    for (const c of all) expect(c.cls).toContain('text-body');
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
   * **폭은 값 층의 몫이 아니다.** 소비처가 갈린다(`w-full` 쓰는 곳 · 부모 grid 가
   * 폭을 주는 곳). base 가 폭을 내면 후자에서 0px 전환이 아니게 된다 — 실제로
   * 첫 구현에서 `boxed` 에 `w-full` 을 넣었다가 이 이유로 뺐다.
   */
  it('폭을 내지 않는다', () => {
    for (const c of all) {
      expect(c.cls, `폭을 냈다: ${c.cls}`).not.toMatch(/(?:^|\s)w-(full|\d)/);
      expect(c.cls).not.toMatch(/(?:^|\s)flex-1/);
    }
  });
});

/**
 * 손가락 바닥. `boxed` 는 자기 상자를 내므로 44px 로 커져도 이웃을 밀어낼 뿐이고,
 * `bare` 는 부모 상자 안이라 커지면 그 상자를 안쪽에서 밀어낸다.
 */
describe('터치 바닥', () => {
  it('boxed 는 coarse 바닥을 받고 bare 는 받지 않는다', () => {
    for (const size of SIZES) {
      expect(fieldClass({ frame: 'boxed', size })).toContain('atlas-touch-floor');
      expect(fieldClass({ frame: 'bare', size })).not.toContain('atlas-touch-floor');
    }
  });
});
