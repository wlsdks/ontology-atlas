import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * 컨트롤 높이 사다리의 **적용 범위** 게이트.
 *
 * ## 왜 별도 파일인가 — `control-class.contract.test.ts` 가 못 보는 층
 *
 * 그 파일은 `controlClass()` 가 **내는 문자열**을 잰다. 그래서 값 층을 쓰는
 * 컨트롤은 전부 사다리 위에 세우지만, **값 층 밖에서 크롬 토큰이 치수를
 * 소유하는 자리**는 시야 밖이다. 원장이 다섯 라운드 연속으로 「크롬 토큰이
 * 치수를 소유한다」를 구멍으로 세어 온 그 자리다.
 *
 * 그 사각지대의 실제 비용이 **34** 였다(2026-08-03 실측):
 *
 * - `--docs-header-tile-size: 34px` 는 크롬 타일이 **44px** 이던 시절
 *   *"44 는 헤더 밀도에 안 맞는다"* 를 근거로 태어났다.
 * - 2026-07-23 에 크롬 타일이 **36px 로 내려왔다**. 34 의 유일한 근거가
 *   그날 사라졌는데, **아무 게이트도 울리지 않았다.**
 * - 그래서 같은 역할(정사각 아이콘 타일)에 값 둘 · coarse 승격 규칙 둘이
 *   9일 동안 남아 있었고, 다음 감사가 그것을 다시 발견했다.
 *
 * 사다리가 「이 표 밖은 이탈」이라고 말하려면 **어느 모양에 적용되는지**를
 * 규칙이 말해야 하고, 그 범위를 기계가 잡아야 한다. 정본 표:
 * `docs/DESIGN-SYSTEM.md` 「이 사다리는 어느 모양에 적용되나」.
 *
 * | 부류 | 사다리가 잡는 것 | 이 파일이 잡는가 |
 * |---|---|---|
 * | 가로 한 줄 컨트롤(chip·pill·segment·row·card) | 바깥 높이 | `control-class` 계약이 잡는다 |
 * | 정사각 아이콘 컨트롤(icon · 크롬/문서함 타일) | 변(邊) | **여기** — 크롬 토큰 쪽 |
 * | 세로로 쌓는 컨트롤(tile · 나브레일 항목) | **안쪽 타일**(바깥 합계는 아님) | **여기** |
 * | 인라인 텍스트 링크 | 면제 | 해당 없음 |
 *
 * 원장: `docs/DECISIONS.md` 2026-08-03 「타일 치수는 하나다」.
 */
describe('컨트롤 높이 사다리 — 적용 범위', () => {
  const GLOBALS = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');

  /** `--name: <값>;` 의 첫 선언. 다중 줄 값(`max(\n …\n)`)도 하나로 읽는다. */
  const cssVar = (name: string): string | undefined =>
    new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm').exec(GLOBALS)?.[1].trim();

  /**
   * 값에서 **기본 px** 를 꺼낸다. 이 앱의 치수 토큰은 세 형태로만 쓰인다:
   *   `36px` · `max(36px, var(--touch-target-min))` · `calc(32px * var(--scale))`
   * 셋 다 「기본값 + 승격/배율」이라 판정 대상은 **첫 px 리터럴**이다.
   * 승격 상한(44)과 배율은 각자의 계약(터치 타깃 e2e · 지도 스케일)이 진다.
   */
  function basePx(value: string): number | null {
    const px = /(\d+(?:\.\d+)?)px/.exec(value);
    return px ? Number(px[1]) : null;
  }

  /** 높이 어휘 — 손으로 적지 않고 사다리 토큰에서 파생한다. */
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
    // 토큰이 수렴해 어휘가 쪼그라들면 파생 자체가 신호를 잃는다.
    expect([...vocabulary].sort((a, b) => a - b), '높이 어휘가 6단이 아니다').toEqual([
      24, 28, 32, 36, 40, 44,
    ]);
    return vocabulary;
  }

  /** `--*-tile-size` · `--*-tile-height` 선언 전수. (width 는 높이 축이 아니다.) */
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

    // 공회전 차단 — 스캔이 0건이면 「위반 없음」이 아니라 정규식/경로 결함이다.
    const scanned = [...GLOBALS.matchAll(TILE_DIMENSION_DECL)];
    expect(
      scanned.length,
      '타일 치수 선언을 하나도 못 셌다 — 셀렉터나 파일 경로가 깨졌다',
    ).toBeGreaterThanOrEqual(3);
    // 기본 선언과 coarse 승격이 **둘 다** 잡혀야 한다(승격만 어휘 밖인 사고를 막는다).
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
     * 나브레일 항목은 전 라우트에서 **62px** 로 렌더된다(실측 1440×900):
     * `py-1.5`(12) + 타일 32 + `gap-1`(4) + 라벨 줄상자 14. 62 는 어휘에 없지만
     * 결함이 아니다 — 세로 2축이라 높이를 **내용이** 정하는 게 맞고, 바깥
     * 합계를 사다리로 못박으면 라벨 글자 수가 규격을 정하게 되어 사다리가
     * 자기 규율 1(「패딩이 높이를 정하면 안 된다」)을 스스로 어긴다.
     *
     * 대신 규칙은 **안쪽 정사각 타일**에 걸린다. 그게 이 단언이다.
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
     * 되돌아오는 경로가 정확히 이 모양이다: 「이 표면만 조금 다른 밀도가
     * 필요해」 → 새 `--<표면>-tile-size` → 어느 날 크롬 토큰이 움직여도
     * 이 값만 남는다. 위 어휘 게이트가 값을 잡지만, **소비처가 크롬 토큰을
     * 읽는지**는 소스가 말한다.
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

    // 위반 — 34 가 태어난 그 선언 그대로.
    expect(
      tileDimensionOffenders('  --docs-header-tile-size: 34px;\n', vocabulary),
    ).toHaveLength(1);
    // 위반 — coarse 승격의 **기본값**이 어휘 밖인 경우(승격만 보면 44라 정상으로 보인다).
    expect(
      tileDimensionOffenders(
        '  --foo-tile-size: max(\n    34px,\n    var(--touch-target-min)\n  );\n',
        vocabulary,
      ),
      '다중 줄 max() 안의 어휘 밖 기본값을 놓쳤다',
    ).toHaveLength(1);
    // 위반 — 배율 형태의 기본값이 어휘 밖인 경우.
    expect(
      tileDimensionOffenders(
        '  --foo-tile-height: calc(30px * var(--topology-ui-scale-factor));\n',
        vocabulary,
      ),
    ).toHaveLength(1);

    // 정상 — 세 형태 전부 어휘 안이면 통과한다.
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

    // 폭은 높이 축이 아니다 — 나브레일 타일은 38×32 가 설계다(잡으면 오탐).
    expect(
      tileDimensionOffenders(
        '  --app-nav-rail-tile-width: calc(38px * var(--topology-ui-scale-factor));\n',
        vocabulary,
      ),
      '폭 토큰을 높이 어휘로 재고 있다',
    ).toEqual([]);
  });
});
