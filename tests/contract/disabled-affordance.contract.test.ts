import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

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
 * 눌리는 공유 프리미티브. **여기 하나를 더할 때 이 목록도 늘린다** — 목록이 곧
 * 이 게이트의 사정거리이고, 빠진 프리미티브는 게이트가 없는 것과 같다.
 */
const PRESSABLE_PRIMITIVES = [
  'src/shared/ui/button.tsx',
  'src/shared/ui/chrome-chip.tsx',
  'src/shared/ui/chrome-tile.tsx',
] as const;

describe('비활성 어포던스', () => {
  it.each(PRESSABLE_PRIMITIVES)('%s — 비활성 상태에 시각 처리가 있다', (path) => {
    const source = read(path);
    // 최소한 «흐려짐» 과 «커서» 둘 다. 하나만으로는 약하다 — 커서만이면 터치에서
    // 신호가 0이고, 흐려짐만이면 마우스 사용자가 누르기 전까지 모른다.
    expect(source, `${path}: 비활성 흐림 처리가 없다`).toMatch(/disabled:opacity-/);
    expect(source, `${path}: 비활성 커서 처리가 없다`).toContain('disabled:cursor-not-allowed');
  });

  it('비활성 흐림 값이 프리미티브마다 갈리지 않는다', () => {
    // 같은 상태를 두 값으로 그리면 그건 시스템이 아니라 우연이다.
    const values = new Set(
      PRESSABLE_PRIMITIVES.flatMap((p) => [...read(p).matchAll(/disabled:opacity-(\d+)/g)].map((m) => m[1])),
    );
    expect([...values], `비활성 불투명도가 여러 값이다: ${[...values].join(', ')}`).toHaveLength(1);
  });

  it('비활성일 때 호버 스타일이 되살아나지 않는다', () => {
    // 호버가 살아 있으면 «눌러도 되는 것» 이라고 손이 먼저 판단한다.
    for (const path of PRESSABLE_PRIMITIVES) {
      expect(read(path), `${path}: 비활성 호버 무력화가 없다`).toMatch(/disabled:hover:/);
    }
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
