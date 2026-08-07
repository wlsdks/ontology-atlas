import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// 형제 계약(`contrast.contract.test.ts`)과 같은 ESM import 를 쓴다. `require` 는
// Vitest 모듈 그래프를 우회해서, `contrast.mjs` 를 고쳤을 때
// `pnpm checks:changed` 가 이 계약을 **추천하지 않는다** (2026-08-07 리뷰).
import { composite, contrastRatio, parseColor } from '../../scripts/lib/contrast.mjs';

/**
 * 지도 패널의 **두 번째 잉크 램프**를 규격으로 붙든다.
 *
 * ## 왜 이 계약이 생겼나 (2026-08-06 디자인 시스템 감사)
 *
 * 실물 계측에서 `--topology-v2-panel-*` 이 전역 중성색과 **몇 단위씩 어긋난
 * 평행 체계**를 돌리고 있는 것이 나왔다. 하드코딩은 0건이라 값 규칙은 전부
 * 통과했고, `check-no-raw-color` 도 할 일을 하고 있었다. 빠져 있던 것은 다른
 * 질문이다: **표면 전용 토큰이 디자인 시스템의 성질을 지키는지 아무도 안
 * 재고 있었다.**
 *
 * ## 왜 값을 전역으로 수렴시키지 않았나
 *
 * 수렴이 대비를 **좋게** 만든다는 것까지 재 봤다(전역 토큰을 패널 표면에
 * 올리면 primary 15.16 → 16.79 · secondary 7.14 → **12.23** · tertiary
 * 4.96 → 5.5). 그런데 secondary 를 7.14 에서 12.23 으로 올리는 것은 이 패널의
 * **잉크 위계 전체를 바꾸는** 일이다 — 패널은 위계를 일부러 압축한 조밀
 * 표면이고(전역 secondary/tertiary 비 2.23 대 패널 1.44), 전역은 차가운 계열
 * (`#d0d6e0`·`#8a8f98`)인데 패널은 무채색 계열(`#a3a3ac`·`#868690`)이다.
 * 채도를 뺀 것은 데이터가 빽빽한 표면에서 읽기 쉬운 쪽이라 취향이 아니라
 * 판단이고, `.claude/rules/design.md` 는 지도 값이 연구 기반이라고 못박아 뒀다.
 * 그리고 `text-quaternary` 는 **이미 전역과 값이 같다**(#82828a, 2026-08-03
 * 수렴) — 즉 이 램프는 «전역을 모르는 사본» 이 아니라 **부분적으로 의도해서
 * 갈라진 것**이다.
 *
 * 그래서 이 계약은 값을 정하지 않고 **성질**을 정한다: 그 표면 위에서 읽히는가 ·
 * 위계가 순서대로인가 · 잉크가 몰래 늘지 않는가. 값을 바꾸는 것은 여전히
 * 자유이고, 대신 아래 표를 같이 고쳐야 해서 **그 판단이 diff 에 남는다.**
 *
 * ## 이 계약이 못 하는 것
 *
 * 「이 램프가 둘이어야 하는가」는 판정하지 않는다. 그건 사람의 결정이고
 * `docs/DECISIONS.md` 2026-08-06 항목에 반증 조건과 함께 적혀 있다.
 */

const CSS = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');

/**
 * `--x: <value>;` 의 **기준 선언**을 읽는다.
 *
 * ⚠️ 「파일에서 마지막 선언」이 아니다 — 이 게이트를 처음 쓸 때 그렇게 했고
 * 틀렸다(2026-08-06). `--color-text-quaternary` 는 `@theme` 의 `#82828a` 가
 * 실효값인데, 파일 뒤쪽 `@media (prefers-contrast: more)` 안에 `#8f95a0` 이
 * 있어서 마지막 선언을 읽으면 **조건부 override 를 기준값으로 착각한다.**
 * 기준 선언은 항상 앞쪽(`@theme` / 최상위 `:root`)에 온다.
 */
function declaredValue(token: string): string | null {
  const match = new RegExp(`${token}\\s*:\\s*([^;]+);`).exec(CSS);
  return match ? match[1].trim() : null;
}

/** `var(--other)` 한 겹을 따라간다 — 이 파일의 별칭 토큰들이 그 모양이다. */
function resolve(token: string, depth = 0): string | null {
  const raw = declaredValue(token);
  if (!raw) return null;
  const alias = /^var\((--[a-z0-9-]+)\)$/.exec(raw);
  if (alias && depth < 4) return resolve(alias[1], depth + 1);
  return raw;
}

const SURFACE_TOKEN = '--topology-v2-panel-surface';

/**
 * 선언 장부 — **잉크마다 그 표면 위의 실측 대비**.
 *
 * 값을 바꾸면 이 표도 같이 고쳐야 한다. 그게 이 표의 목적이다: 지도 패널의
 * 잉크를 조정하는 것은 정당한 디자인 작업이지만 **조용히** 일어나면 안 된다.
 */
const INK_LEDGER: ReadonlyArray<readonly [token: string, ratio: number]> = [
  ['--topology-v2-panel-text-primary', 15.16],
  ['--topology-v2-panel-metric-text', 8.88],
  ['--topology-v2-panel-text-secondary', 7.14],
  ['--topology-v2-panel-text-tertiary', 4.96],
  ['--topology-v2-panel-text-quaternary', 4.69],
];

/** WCAG 1.4.3 본문 바닥. 패널의 잉크는 전부 본문 크기로 쓰인다. */
const BODY_AA = 4.5;

function ratioOnPanel(token: string): number {
  const surface = resolve(SURFACE_TOKEN);
  const ink = resolve(token);
  expect(surface, `${SURFACE_TOKEN} 를 못 읽었다`).toBeTruthy();
  expect(ink, `${token} 를 못 읽었다`).toBeTruthy();
  const bg = parseColor(surface);
  const fg = parseColor(ink);
  expect(bg, `${SURFACE_TOKEN} 값을 색으로 못 읽었다: ${surface}`).toBeTruthy();
  expect(fg, `${token} 값을 색으로 못 읽었다: ${ink}`).toBeTruthy();
  return contrastRatio(composite(fg, bg), bg);
}

describe('지도 패널 잉크 램프 (표면 전용 두 번째 램프)', () => {
  it('장부가 비어 있지 않고 표면 토큰이 실재한다', () => {
    // 공회전 차단 — 장부가 비거나 표면을 못 읽으면 아래 시험들이 전부 «통과» 가 된다.
    expect(INK_LEDGER.length).toBeGreaterThan(3);
    expect(resolve(SURFACE_TOKEN)).toMatch(/^#|^rgb/);
  });

  it('선언된 잉크가 globals.css 의 패널 잉크 **전부**를 덮는다', () => {
    /**
     * 커버리지 단언 — 「공집합이 아니다」가 아니라 「전집합을 본다」를 잰다
     * (`.claude/rules/design-gates.md`: 아이콘 래칫이 표기 하나만 봐서 3/4 을
     * 놓친 사례). 패널에 새 잉크가 생기면 여기서 먼저 터진다.
     */
    /**
     * ⚠️ 두 번 고쳤다 (2026-08-07 리뷰).
     *
     * ① 처음 쓴 `text-[a-z]+` 는 이름 안의 **하이픈**을 못 넘어서
     * `--topology-v2-panel-text-on-accent` 같은 잉크를 놓쳤다 — 「새 잉크가
     * 생기면 여기서 먼저 터진다」던 단언이 조용히 통과하는 상태였다
     * (`design-gates.md` 의 «스캐너가 표기 하나만 보면 그만큼 못 본다» 를 그대로
     * 반복했다).
     *
     * ② 그래서 이름에 `text` 가 들어가면 전부 걸리게 넓혔더니 이번엔 **강조
     * 잉크 셋**(`domain-text` · `count-text` · `primary-text`)까지 딸려 왔다.
     * 그것들은 인디고이고 **틴트 표면 위**에 얹히므로, 패널 표면 위 중성 사다리와
     * 같은 자로 재면 안 된다(대비도 위계도 다른 계약의 것이다).
     *
     * 손으로 빼면 다시 드리프트하므로 **분류로** 가른다: 인디고를 참조하면 강조
     * 잉크(→ `accent-ink-contrast` 계약 소관), 아니면 중성 사다리라 장부에 있어야
     * 한다. 새 중성 잉크는 여전히 여기서 터진다.
     */
    const allInks = [
      ...CSS.matchAll(/^\s*(--topology-v2-panel-[a-z0-9-]*text[a-z0-9-]*)\s*:/gm),
    ].map((m) => m[1]);
    const isAccentInk = (token: string): boolean =>
      /--color-indigo/.test(declaredValue(token) ?? '');
    const defined = allInks.filter((t) => !isAccentInk(t));
    expect(
      allInks.length - defined.length,
      '강조 잉크를 하나도 못 갈랐다 — 분류가 깨졌다',
    ).toBeGreaterThan(0);
    expect(defined.length, '패널 잉크 토큰을 하나도 못 찾았다 — 스캔이 깨졌다').toBeGreaterThan(3);
    const declared = new Set(INK_LEDGER.map(([t]) => t));
    const missing = [...new Set(defined)].filter((t) => !declared.has(t));
    expect(
      missing,
      `장부에 없는 패널 잉크: ${missing.join(', ')} — 새 잉크를 더했으면 대비를 재서 INK_LEDGER 에 등재한다`,
    ).toEqual([]);
  });

  it.each(INK_LEDGER)('%s 가 패널 표면 위에서 본문 AA 를 넘는다', (token) => {
    expect(ratioOnPanel(token)).toBeGreaterThanOrEqual(BODY_AA);
  });

  it.each(INK_LEDGER)('%s 의 실측 대비가 장부와 같다', (token, ratio) => {
    expect(
      Number(ratioOnPanel(token).toFixed(2)),
      `${token} 의 대비가 장부(${ratio})와 다르다 — 값을 바꿨으면 INK_LEDGER 도 같이 고쳐라. ` +
        `그 diff 가 «패널 잉크를 조정했다» 를 기록하는 자리다.`,
    ).toBeCloseTo(ratio, 1);
  });

  it('잉크 위계가 순서대로 내려간다', () => {
    /**
     * 위계가 뒤집히면 «주»가 «보조»보다 옅어진다 — 값 규칙은 전부 통과하면서
     * 화면에서만 읽는 순서가 무너지는 부류다. 장부 순서 그대로 단조 감소여야 한다.
     */
    const ratios = INK_LEDGER.map(([t]) => Number(ratioOnPanel(t).toFixed(2)));
    for (let i = 1; i < ratios.length; i += 1) {
      expect(
        ratios[i],
        `${INK_LEDGER[i][0]}(${ratios[i]}) 가 ${INK_LEDGER[i - 1][0]}(${ratios[i - 1]}) 보다 진하다 — 위계 역전`,
      ).toBeLessThan(ratios[i - 1]);
    }
  });

  it('전역 램프와 값이 같아진 잉크는 별칭이 아니라 같은 값으로 남는다', () => {
    /**
     * `text-quaternary` 는 2026-08-03 에 전역과 값이 수렴했다(#82828a). 그 사실을
     * 못박아 둔다 — 갈라진 램프가 **어디까지 갈라졌는지**가 이 계약의 정보이고,
     * 수렴한 자리가 조용히 다시 갈라지면 그건 후퇴다.
     */
    expect(resolve('--topology-v2-panel-text-quaternary')?.toLowerCase()).toBe(
      resolve('--color-text-quaternary')?.toLowerCase(),
    );
  });
});
