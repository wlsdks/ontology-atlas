import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The **scope** gate for the control-height ladder.
 *
 * **Why a separate file — the layer `control-class.contract.test.ts` cannot see.**
 * That file measures the **string `controlClass()` emits**, so it puts every
 * control that uses the value layer on the ladder, while **places outside the value
 * layer where a chrome token owns the dimension** stay out of view. That is the
 * hole the ledger counted for five consecutive rounds as "a chrome token owns the
 * dimension".
 *
 * The real cost of that blind spot was **34** (measured 2026-08-03):
 *
 * - `--docs-header-tile-size: 34px` was born when chrome tiles were **44px**, on
 *   the grounds that *"44 does not suit header density"*.
 * - On 2026-07-23 chrome tiles **came down to 36px**. The only evidence for 34
 *   disappeared that day and **no gate made a sound.**
 * - So the same role (a square icon tile) carried two values and two coarse
 *   promotion rules for 9 days, until the next audit rediscovered it.
 *
 * For the ladder to say "outside this table is a deviation", the rule must say
 * **which shapes it applies to**, and a machine must hold that scope. Source table:
 * docs/DESIGN-SYSTEM.md 「이 사다리는 어느 모양에 적용되나」 (which shapes the
 * ladder applies to).
 *
 * | Category | What the ladder holds | Held here? |
 * |---|---|---|
 * | Single-row horizontal controls (chip·pill·segment·row·card) | outer height | the `control-class` contract |
 * | Square icon controls (icon, chrome/docs tiles) | the side | **here** — the chrome-token side |
 * | Vertically stacked controls (tile, nav rail items) | **the inner tile** (not the outer total) | **here** |
 * | Inline text links | exempt | n/a |
 *
 * Ledger: `docs/DECISIONS.md` 2026-08-03 「타일 치수는 하나다」 (one tile
 * dimension).
 */
describe('컨트롤 높이 사다리 — 적용 범위', () => {
  const GLOBALS = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');

  /** The first `--name: <value>;` declaration. Multi-line values (`max(\n …\n)`) read as one. */
  const cssVar = (name: string): string | undefined =>
    new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm').exec(GLOBALS)?.[1].trim();

  /**
   * Extracts the **base px** from a value. This app's dimension tokens take only
   * three forms:
   *   `36px` · `max(36px, var(--touch-target-min))` · `calc(32px * var(--scale))`
   * All three are "base value + promotion/scale", so the thing judged is the **first
   * px literal**. The promotion ceiling (44) and the scale factor are carried by their
   * own contracts (the touch-target e2e and the map zoom).
   */
  function basePx(value: string): number | null {
    const px = /(\d+(?:\.\d+)?)px/.exec(value);
    return px ? Number(px[1]) : null;
  }

  /** The height vocabulary — derived from the ladder tokens rather than written by hand. */
  function heightVocabulary(): Set<number> {
    const WCAG_TARGET_FLOOR_PX = 24;
    const tokenPx = (name: string): number => {
      const px = basePx(cssVar(name) ?? '');
      expect(px, `\`${name}\` 을 px 로 못 읽었다 — 어휘를 파생할 수 없다`).not.toBeNull();
      return px as number;
    };
    const vocabulary = new Set([
      WCAG_TARGET_FLOOR_PX,
      tokenPx('--control-h-sm'),
      tokenPx('--control-h-md'),
      tokenPx('--chrome-tile-size'),
      tokenPx('--control-h-lg'),
      tokenPx('--touch-target-min'),
    ]);
    // If tokens converge and the vocabulary shrinks, the derivation itself loses its
    // signal.
    expect([...vocabulary].sort((a, b) => a - b), '높이 어휘가 6단이 아니다').toEqual([
      24, 28, 32, 36, 40, 44,
    ]);
    return vocabulary;
  }

  /** Every `--*-tile-size` and `--*-tile-height` declaration. (width is not a height axis.) */
  const TILE_DIMENSION_DECL = /^[ \t]*(--[a-z0-9-]*tile-(?:size|height))\s*:\s*([^;]+);/gm;

  function tileDimensionOffenders(css: string, vocabulary: Set<number>): string[] {
    const offenders: string[] = [];
    for (const match of css.matchAll(TILE_DIMENSION_DECL)) {
      const [, name, value] = match;
      const px = basePx(value);
      if (px === null) {
        offenders.push(`${name}: 기본 px 를 못 읽었다 — \`${value.replace(/\s+/g, ' ')}\``);
        continue;
      }
      if (!vocabulary.has(px)) {
        offenders.push(`${name}: ${px}px 는 높이 어휘 밖이다`);
      }
    }
    return offenders;
  }

  it('타일 치수 토큰의 기본값이 전부 높이 어휘 안이다 — 34 가 태어난 구멍', () => {
    const vocabulary = heightVocabulary();

    // Idling guard — a scan returning 0 means a broken regex or path, not "no
    // violations".
    const scanned = [...GLOBALS.matchAll(TILE_DIMENSION_DECL)];
    expect(
      scanned.length,
      '타일 치수 선언을 하나도 못 셌다 — 셀렉터나 파일 경로가 깨졌다',
    ).toBeGreaterThanOrEqual(3);
    // **Both** the base declaration and the coarse promotion must be caught (blocking
    // the accident where only the promotion is off-vocabulary).
    expect(
      scanned.filter(([, , value]) => value.includes('max(')).length,
      'coarse 승격 선언이 스캔에 안 잡혔다 — 다중 줄 값을 놓치고 있다',
    ).toBeGreaterThan(0);

    expect(
      tileDimensionOffenders(GLOBALS, vocabulary),
      '타일 치수 토큰이 사다리 밖이다. 새 값이 필요하면 축을 더하지 말고 사다리 표를 고쳐라.',
    ).toEqual([]);
  });

  it('세로로 쌓는 컨트롤은 **안쪽 타일**이 사다리에 선다 — 바깥 합계는 사다리의 일이 아니다', () => {
    /*
     * Nav rail items render at **62px** on every route (measured at 1440×900):
     * `py-1.5`(12) + tile 32 + `gap-1`(4) + label line box 14. 62 is not in the
     * vocabulary but it is not a defect — with two vertical axes it is right that
     * **content** decides the height, and pinning the outer total to the ladder would
     * let label length decide the spec, making the ladder break its own first rule
     * ("padding must not decide height").
     *
     * The rule applies to the **inner square tile** instead. That is this assertion.
     */
    const railTile = basePx(cssVar('--app-nav-rail-tile-height') ?? '');
    const controlMd = basePx(cssVar('--control-h-md') ?? '');
    expect(railTile, '`--app-nav-rail-tile-height` 를 px 로 못 읽었다').not.toBeNull();
    expect(
      railTile,
      '세로 컨트롤의 안쪽 타일이 사다리에서 내려왔다 — `--control-h-md` 와 같아야 한다',
    ).toBe(controlMd);
  });

  it('문서함 헤더 타일이 자기 치수 토큰을 다시 만들지 않았다', () => {
    /*
     * The way this comes back has exactly this shape: "this one surface needs slightly
     * different density" → a new `--<surface>-tile-size` → the day the chrome token
     * moves, only that value stays behind. The vocabulary gate above catches the value,
     * but **whether the consumer reads the chrome token** is something the source says.
     */
    const source = readFileSync(
      join(process.cwd(), 'src/views/docs-vault/ui/parts/DocsHeaderTile.tsx'),
      'utf8',
    );
    expect(source, '문서함 헤더 타일이 크롬 치수 토큰을 안 읽는다').toContain(
      'size-[var(--chrome-tile-size)]',
    );
    expect(
      /--docs-header-tile-size\s*\)/.test(source),
      '삭제한 `--docs-header-tile-size` 를 다시 참조한다',
    ).toBe(false);
  });

  it('게이트가 실제로 위반을 잡는다 — 세 형태와 34 로 프로브', () => {
    const vocabulary = heightVocabulary();

    // Violation — the exact declaration that produced 34.
    expect(
      tileDimensionOffenders('  --docs-header-tile-size: 34px;\n', vocabulary),
    ).toHaveLength(1);
    // Violation — the coarse promotion's **base value** is off-vocabulary (looking at
    // the promotion alone it is 44 and appears fine).
    expect(
      tileDimensionOffenders(
        '  --foo-tile-size: max(\n    34px,\n    var(--touch-target-min)\n  );\n',
        vocabulary,
      ),
      '다중 줄 max() 안의 어휘 밖 기본값을 놓쳤다',
    ).toHaveLength(1);
    // Violation — the base value of the scale form is off-vocabulary.
    expect(
      tileDimensionOffenders(
        '  --foo-tile-height: calc(30px * var(--topology-ui-scale-factor));\n',
        vocabulary,
      ),
    ).toHaveLength(1);

    // Clean — all three forms pass when they are in the vocabulary.
    expect(
      tileDimensionOffenders(
        [
          '  --a-tile-size: 36px;',
          '  --b-tile-size: max(36px, var(--touch-target-min));',
          '  --c-tile-height: calc(32px * var(--topology-ui-scale-factor));',
          '',
        ].join('\n'),
        vocabulary,
      ),
    ).toEqual([]);

    // Width is not a height axis — nav rail tiles are 38×32 by design (catching it
    // would be a false positive).
    expect(
      tileDimensionOffenders(
        '  --app-nav-rail-tile-width: calc(38px * var(--topology-ui-scale-factor));\n',
        vocabulary,
      ),
      '폭 토큰을 높이 어휘로 재고 있다',
    ).toEqual([]);
  });
});
