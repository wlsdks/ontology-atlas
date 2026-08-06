import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CONTROL_DISABLED_CLASS } from '@/shared/ui/control-class';

/**
 * **누를 수 없으면 누를 수 없어 보여야 한다.**
 *
 * ## 이 게이트가 왜 생겼나
 *
 * 2026-08-03 소유자 실보고: *"'최근 변경' 누르니까 아무런 반응이 없는데?"*.
 * 그 칩은 `disabled` 였고 코드 주석은 「자리는 남기고 이유는 툴팁이 말한다」고
 * 적혀 있었다. 그런데 실측하니 **계산된 스타일이 옆의 활성 칩 셋과 완전히
 * 동일**했다 — color · bg · border · opacity · cursor 전부 같은 값.
 *
 * | 칩 | disabled | opacity | cursor |
 * |---|---|---|---|
 * | 자동 정렬 | false | 1 | default |
 * | 검색 | false | 1 | default |
 * | 내 데이터로 전환 | false | 1 | default |
 * | **최근 변경** | **true** | **1** | **default** |
 *
 * `ChromeChip` 에 `disabled:` 처리가 **아예 없었고**, 공유 프리미티브라 **모든
 * 칩이 같은 구멍**을 갖고 있었다. 툴팁은 호버하고 기다려야 나오므로 **누르는
 * 사람에게는 침묵**이었다.
 *
 * 이 저장소의 반복 교훈 그대로다: **주석에만 있는 규격은 화면에 없다.**
 * lint 는 못 잡는다 — 값 규칙이 아니라 «이 상태에 대한 처리가 존재하는가» 라서다.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * 값의 정본 — `control-class.ts` 의 `CONTROL_DISABLED_CLASS`. 이 테스트는
 * **소스의 클래스 문자열이 아니라 값을 묻는다** (2026-08-06 재작성): 종전에는
 * 파일마다 `disabled:opacity-` 리터럴이 있기를 요구해서, 값 층 상수로 옮기는
 * 정확히 올바른 리팩터링이 이 게이트를 깨뜨렸다. 지금은 「그 파일이 비활성
 * 처리를 어디서 받는가」(상수 조합 또는 자기 리터럴)와 「모든 경로의 값이
 * 하나인가」만 묻는다.
 */
const DISABLED_STEP = (() => {
  const m = CONTROL_DISABLED_CLASS.match(/disabled:opacity-(\d+)/);
  if (!m) throw new Error('CONTROL_DISABLED_CLASS 에 비활성 흐림 값이 없다');
  return m[1];
})();

/**
 * 눌리는 공유 프리미티브. **여기 하나를 더할 때 이 목록도 늘린다** — 목록이 곧
 * 이 게이트의 사정거리이고, 빠진 프리미티브는 게이트가 없는 것과 같다.
 * `Chip`/`IconButton`/`RowButton` 은 값 층(`control-class.ts`)에서 받으므로
 * 등재 대상은 그 값을 내는 파일이다.
 */
const PRESSABLE_PRIMITIVES = [
  'src/shared/ui/button.tsx',
  'src/shared/ui/chrome-chip.tsx',
  'src/shared/ui/chrome-tile.tsx',
  'src/shared/ui/select.tsx',
  'src/shared/ui/control-class.ts',
] as const;

/** 상수를 조합하면 그 자체로 네 처리(흐림·커서·그림자·호버 무력화)를 다 받는다. */
const composesConstant = (source: string) => source.includes('CONTROL_DISABLED_CLASS');

describe('비활성 어포던스 — 값 층', () => {
  it('CONTROL_DISABLED_CLASS 가 네 처리를 한 세트로 싣는다', () => {
    // 흐림만 있으면 마우스 사용자가 누르기 전까지 모르고, 커서만 있으면 터치에서
    // 신호가 0이고, 호버가 살아 있으면 «눌러도 되는 것» 이라고 손이 먼저 판단한다.
    expect(CONTROL_DISABLED_CLASS).toMatch(/disabled:opacity-\d+/);
    expect(CONTROL_DISABLED_CLASS).toContain('disabled:cursor-not-allowed');
    expect(CONTROL_DISABLED_CLASS).toContain('disabled:shadow-none');
    expect(CONTROL_DISABLED_CLASS).toMatch(/disabled:hover:/);
  });

  it.each(PRESSABLE_PRIMITIVES)('%s — 비활성 처리를 값 층 또는 자기 리터럴로 받는다', (path) => {
    const source = read(path);
    if (composesConstant(source)) return; // 값 층 한 세트를 통째로 받는다
    expect(source, `${path}: 비활성 흐림 처리가 없다`).toMatch(/disabled:opacity-/);
    expect(source, `${path}: 비활성 커서 처리가 없다`).toContain('disabled:cursor-not-allowed');
    expect(source, `${path}: 비활성 호버 무력화가 없다`).toMatch(/disabled:hover:/);
  });

  it('비활성 흐림 값이 경로마다 갈리지 않는다', () => {
    // 같은 상태를 두 값으로 그리면 그건 시스템이 아니라 우연이다.
    const values = new Set(
      PRESSABLE_PRIMITIVES.flatMap((p) => [...read(p).matchAll(/disabled:opacity-(\d+)/g)].map((m) => m[1])),
    );
    values.add(DISABLED_STEP);
    expect([...values], `비활성 불투명도가 여러 값이다: ${[...values].join(', ')}`).toEqual([DISABLED_STEP]);
  });

  it('lint 게이트가 허용하는 값과 값 층의 값이 같다', () => {
    // eslint 의 disabledAffordanceSelectors 는 «55 가 아닌 값만 금지» 형태라
    // 55 라는 숫자가 lint 에도 적힌다 — 값 층이 이사하면 여기가 빨개져서
    // 둘이 같이 이사하게 만든다. (파일 면제 블록 대신 이 대조를 골랐다:
    // 이 config 는 면제 블록이 셀렉터 배열을 다시 싣는 걸 잊는 사고를 세 번
    // 겪었다.)
    const eslintConfig = read('eslint.config.mjs');
    const gates = [...eslintConfig.matchAll(/disabled\):opacity-\(\?!(\d+)/g)].map((m) => m[1]);
    expect(gates.length, 'disabledAffordanceSelectors 가 eslint.config.mjs 에 없다').toBeGreaterThanOrEqual(2);
    expect(new Set(gates), 'lint 가 허용하는 비활성 흐림 값이 값 층과 다르다').toEqual(new Set([DISABLED_STEP]));
  });
});

describe('최근 변경 칩 — 못 쓰는 이유를 모드별로 말한다', () => {
  const HOME = read('src/views/home/ui/HomePage.tsx');

  it('샘플과 내 폴더의 사유를 다른 문장으로 낸다', () => {
    // 샘플을 보는 사람에게 「문서를 고치면」은 **고칠 문서가 있다는 전제**다.
    // 실제 이유는 다르다 — 샘플의 날짜는 이 저장소가 픽스처를 마지막으로 건드린
    // 시각이라 사용자와 무관하고, 폴더를 열기 전에는 이 기능이 뜻을 못 가진다.
    expect(HOME).toContain('spotlightSampleTooltip');
    expect(HOME).toContain('spotlightEmptyTooltip');
  });

  it.each(['ko', 'en'])('%s 문구가 샘플 사유를 폴더로 설명한다', (locale) => {
    const messages = JSON.parse(read(`messages/${locale}.json`));
    const text: string = messages.topology.controls.spotlightSampleTooltip;
    expect(text, `${locale}: 샘플 사유 문구가 없다`).toBeTruthy();
    // 「무엇을 하면 되는지」가 없으면 그건 사과문이지 안내가 아니다 —
    // `surfaces.md` 의 강등 계약(왜 + 어디서)과 같은 규율.
    expect(text, `${locale}: 다음 행동(폴더)을 안 말한다`).toMatch(locale === 'ko' ? /폴더/ : /folder/i);
  });
});
