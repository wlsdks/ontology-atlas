import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * 컨트롤 채택 래칫 — **손으로 쓴 컨트롤 className 은 늘어날 수 없다.**
 *
 * ## 왜 lint 룰이 아니라 래칫인가
 *
 * 갈래 D 의 원안은 「`<button>` 의 className 이 `controlClass()` 에서 오지 않으면
 * lint error」였다. 그런데 `/gate-probe` 규율대로 켜기 전에 전수를 세 보니
 * **419개**였다. 한 PR 로 못 치우는 룰은 강제가 아니라 소음이고, 기존 신호(현재
 * warning 96)까지 덮어 게이트를 무력화한다 — 이 저장소는 `shadow-[` 를 통째로
 * 금지했다가 lint 가 144 → 548 로 뛴 전례가 있다.
 *
 * 게다가 전환은 **정규화**라 픽셀이 바뀐다(칩 143개에 고유 크기 조합 50종, 상위
 * 3종 23% — `control-class.ts` 참조). 픽셀을 바꾸는 결정은 디자인 게이트의 일이지
 * lint 룰의 일이 아니다.
 *
 * 래칫은 그 둘을 가른다:
 *   - **오늘의 419는 그대로 둔다** — 정규화는 디자인 게이트가 순서를 정해 진행한다.
 *   - **420번째는 못 들어온다** — 새 컨트롤은 `controlClass()` 를 쓴다.
 *   - **줄면 기준선도 내린다** — 안 내리면 그 차이가 되돌아갈 여유로 남는다.
 *
 * 접근성 래칫(`tests/e2e/a11y-ratchet.spec.ts`)과 같은 형태다.
 */

const ROOTS = ['src', 'app'];

/**
 * 2026-08-03 전수 실측. **이 수는 내려가기만 한다.**
 *
 * | 모양 | 개수 |
 * |---|---:|
 * | 칩 | 128 |
 * | 텍스트 링크형 | 85 |
 * | 목록 행 | 39 |
 * | 아이콘 정사각 | 36 |
 * | pill | 32 |
 * | 토큰 반경 기타 · 미분류 | 58 |
 * | 카드형 | 18 |
 * | 떠 있는 · h-8 | 19 |
 * | 표준 버튼(기존 `<Button>` 이 덮는 유일한 모양) | 1 |
 *
 * 전수는 419였고 그중 **className 자체가 없는 2건**은 제외했다 — 손으로 쓴 규격이
 * 아니라 래퍼라서다. 이 2를 뺀 **417**이 기준선이고, 이 정정은 래칫이 스스로
 * 잡았다(첫 실행이 «419 → 417 로 줄었다» 로 빨개졌다).
 *
 * ## 내려온 기록 — 이 표가 곧 정규화의 진도다
 *
 * | 값 | 무엇이 옮겨졌나 |
 * |---:|---|
 * | 417 | 2026-08-03 최초 실측 |
 * | **406** | 설정 시트(`src/widgets/app-settings-menu/**`) 11개 — 칩 6 · 아이콘 2 · 행 1 · 링크형 1 (+ 그중 하나는 눌림 상태를 `active` 로 넘김) |
 * | **389** | 지도 두 위젯(`topology-map-v2` · `topology-index-panel`) 31개 중 17개 — 행 8 · 링크형 5 · 아이콘 3 · 카드 2 · 칩 1. 남긴 14개는 여섯 분류에 **없는** 모양(세로 액션 타일 5 · 세그먼트 탭 3 · 창 선택 칩 · 세로 엣지 탭 · 캔버스 앵커 원형 버튼 · 트리 셰브론)이거나, 램프의 최소 인셋(8px)이 이 패널의 4px 인셋과 어긋나 헤더가 자기 행들과 어긋나는 자리(2)다 |
 * | **303** | 문서함 · 빠른 서랍 · 공방(`views/docs-vault` · `widgets/docs-vault` · `widgets/docs-quick-drawer` · `views/ontology-studio`) 121개 중 86개 — 행 27 · 아이콘 24 · 칩 21 · 링크형 13 · pill 4 · 카드 2. 남긴 35개는 넷으로 갈린다: ① **크롬 토큰 계약**(`--chrome-tile-size` · `--docs-header-tile-size` · `--overlay-close-size`)을 지는 자리 4 — 램프가 아니라 크롬이 규격이다 ② **나침 무대의 절대배치 기하**(소켓 · 레인 접기 · 더 잇기 · 고정 높이 30/32 툴바) 15 — 이 표면의 문법이 따로 있고 `studio-navigation` 스펙이 그 치수를 계약으로 잡는다 ③ **한 벌로 읽혀야 하는 세트**(첫 실행 선택 행 4 + 최근 볼트 grid 행 1, 다중행 `items-start` 라 `row`(단행 `items-center`)에 안 맞는다) 11 ④ **문장·바 속 인라인 컨트롤** 5 — `link` 이 `min-h-11`(WCAG 2.5.8)을 실으면서 글줄 안에서는 줄 상자를 44px 로 밀어 올린다(실측 21.3 → 44). 시각 크기와 히트 영역이 다른 축이라는 상류 판단은 옳고, 다만 그 해법이 «문장 속» 이라는 세 번째 축을 아직 안 본다 |
 *
 * | **269** | 위 두 라운드가 「자리가 없어서」 남긴 48개의 회수 — 값 층의 구멍 넷을 메운(`a1f956ce9`) 직후다. 설정 시트 29(칩 24 · 타일 2 · 링크형 3) + 지도 액션 타일 5. `tone` 의 새 넷(secondary 6 · accent 11 · success 2 · warning 2 · danger 1)이 22개를, `shape: 'tile'` 이 7개를, `link` 의 `min-h-11` 이 3개를 열었다 |
 * | **252** | 지도 뷰(`src/views/home/**`) 31개 중 17개 — 아이콘 9 · pill 4 · 칩 1 · 링크형 1(그 외 2는 인디고 강조 아이콘/pill). 남긴 14개는 다섯으로 갈린다: ① **컨트롤이 아닌 것** 3 — `absolute inset-0` 전면 백드롭은 스크림이지 눌리는 원소가 아니다 ② **크롬 토큰 계약** 2 — 투어·단축키 타일은 `--chrome-tile-size`/`--chrome-radius` 를 진다 ③ **말줄임이 필요한 텍스트 컨트롤** 3 — 모양 일곱이 전부 flex 계열이라 `text-overflow: ellipsis` 가 통하지 않는다(실측: `inline-block` 은 `…`, `inline-flex` 는 하드 클립) ④ **패딩을 가진 텍스트 링크** 3 — `link` 는 패딩이 0이라 `px-1 py-0.5`/`px-2 py-1` 히트 영역이 사라진다 ⑤ **램프에 스텝이 없는 것** 3 — 20px 아이콘 · 40px(`--control-h-lg`) 인디고 pill · 2줄 세로 목록 행 |
 *
 * ## 남은 것을 왜 안 옮겼나 — 이 목록이 다음 라운드의 입력이다
 *
 * 이 스코프에 남은 14개(설정 5 · 지도 9)는 셋 중 하나다:
 *
 * 1. **소유자 판정이 문자열로 못박혀 있다** —
 *    `settings-sheet-type-dialect.contract.test.ts` 가 `Choice`·`SegmentSwitch`·
 *    알림 칩·LNB 항목의 클래스를 정규식으로 고정한다. 게이트가 지키는 값을
 *    이 전환이 되돌리지 않는다(4).
 * 2. **보더 있는 컨테이너 안의 보더 없는 컨트롤** — 발자국 프리셋 3종은
 *    `border` 를 두른 세그먼트 상자 안에 산다. `chip` 은 보더가 필수라
 *    상자 속 상자가 된다(1 파일 · 반복 3).
 * 3. **램프의 최소 인셋(8px)이 이 패널의 4px 위에 선다** — INDEX 접기 헤더 ·
 *    경계 토글. 옮기면 그 행만 자기 형제들과 어긋난다(2).
 *
 * 나머지 6(세그먼트 탭 3 · 창 선택 칩 · 세로 엣지 탭 · 캔버스 앵커 원형 버튼 ·
 * 트리 셰브론)은 일곱 모양 어디에도 없다.
 *
 * ## 이 수가 **과다 계상**이라는 것 — 알고 두는 한계
 *
 * 세는 것은 여는 태그 안의 **리터럴** `controlClass(` 다. 그래서 램프를 통과한
 * 완성 클래스를 상수로 뽑아 `className={SHARED}` 로 쓴 컨트롤은 여기서
 * 「손으로 쓴 것」으로 잡힌다. 안전한 방향의 오차이지만(과소 계상은 없다),
 * **공유 상수로 뽑는 옳은 리팩터에 벌점을 준다.** 그래서 이 라운드는 잉크만
 * 상수로 공유하고 램프 호출은 자리마다 인라인으로 썼다.
 */
const BASELINE_HAND_WRITTEN_CONTROLS = 252;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue;
      walk(p, out);
    } else if (name.endsWith('.tsx') && !name.endsWith('.test.tsx')) {
      out.push(p);
    }
  }
  return out;
}

/**
 * 여는 태그를 **중괄호 깊이**로 끊는다.
 *
 * ★ 이걸 안 하면 `onClick={() => …}` 의 `=>` 를 태그 끝으로 읽는다. 첫 측정에서
 * 실제로 그랬고, 그 결과 419개 중 251개가 「className 없음」으로 분류돼 결론이
 * 통째로 뒤집힐 뻔했다. **잴 원소를 틀리면 수치가 나와도 틀린 수치다.**
 */
function openingTag(source: string, from: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < source.length; i += 1) {
    const c = source[i];
    if (quote) {
      if (c === quote && source[i - 1] !== '\\') quote = null;
    } else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0) return source.slice(from, i);
  }
  return source.slice(from, from + 2000);
}

function countHandWrittenControls(): { total: number; byFile: Array<[string, number]> } {
  const byFile: Array<[string, number]> = [];
  let total = 0;
  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const source = readFileSync(file, 'utf8');
      // `const X = controlClass({…})` / `const X = cn(controlClass({…}), …)` 의 이름들.
      const systemConstants = [...source.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=[^;\n]*controlClass\s*\(/g)].map(
        (m) => m[1],
      );
      let n = 0;
      for (const m of source.matchAll(/<button\b/g)) {
        const tag = openingTag(source, m.index + m[0].length);
        if (!/className/.test(tag)) continue; // 클래스가 없으면 손으로 쓴 규격이 아니다
        /*
         * 시스템을 통과했나. **여는 태그의 리터럴만 보는 것으로는 부족하다** —
         * 완성된 클래스를 상수로 뽑아 여러 자리가 공유하면(`const INDIGO_CHIP =
         * controlClass({…})`) 그 소비처들이 「손으로 쓴 것」으로 잡힌다.
         *
         * 2026-08-03 회수 라운드가 그 벌점을 실제로 맞았다: 인디고 강조 칩이
         * 테두리·호버까지 있어야 완성이라 상수 4벌로 묶어야 했는데, 그러면 래칫이
         * 나빠졌다고 말한다. **옳은 리팩터를 말리는 게이트는 게이트가 아니다.**
         *
         * 그래서 같은 파일 안에서 `controlClass(...)` 로 만든 상수의 이름을 모아,
         * 그 이름을 쓰는 태그도 통과시킨다. 안전 방향(과소 계상)이 아니라 정확
         * 방향이다 — 그 상수는 실제로 시스템을 통과한 값이다.
         */
        if (/controlClass\s*\(/.test(tag)) continue;
        if (systemConstants.length > 0 && systemConstants.some((name) => new RegExp(`\\b${name}\\b`).test(tag))) continue;
        n += 1;
      }
      if (n > 0) {
        byFile.push([file, n]);
        total += n;
      }
    }
  }
  byFile.sort((a, b) => b[1] - a[1]);
  return { total, byFile };
}

describe('컨트롤 채택 래칫', () => {
  const { total, byFile } = countHandWrittenControls();

  it('손으로 쓴 컨트롤이 늘지 않는다 — 새 컨트롤은 controlClass() 를 쓴다', () => {
    expect(
      total,
      `손으로 className 을 쓴 <button> 이 ${BASELINE_HAND_WRITTEN_CONTROLS} → ${total} 로 늘었다.\n` +
        `새 컨트롤은 \`controlClass({ shape })\` 를 쓴다 — 모양 여섯은 실측에서 나왔고 ` +
        `(칩 128 · 링크형 85 · 행 39 · 아이콘 36 · pill 32 · 카드 18), 램프 밖 값을 못 낸다.\n` +
        `가장 많은 파일: ${byFile.slice(0, 3).map(([f, n]) => `${f}(${n})`).join(' · ')}`,
    ).toBeLessThanOrEqual(BASELINE_HAND_WRITTEN_CONTROLS);
  });

  it('줄었으면 기준선도 내린다 — 여유를 무료로 두지 않는다', () => {
    // 래칫의 나머지 절반. 고치고 기준선을 안 내리면 그만큼이 조용히 되돌아갈 수 있다.
    expect(
      total,
      `손으로 쓴 컨트롤이 ${BASELINE_HAND_WRITTEN_CONTROLS} → ${total} 로 줄었다. ` +
        `이 파일의 BASELINE_HAND_WRITTEN_CONTROLS 도 ${total} 로 내려라.`,
    ).toBeGreaterThanOrEqual(BASELINE_HAND_WRITTEN_CONTROLS);
  });

  it('탐지기가 실제로 세고 있다 — 0을 통과로 읽지 않는다', () => {
    // 워크가 조용히 빈 집합을 돌면 위 둘이 «항상 통과» 가 된다. 그건 게이트가
    // 없는 것과 구별되지 않는다.
    expect(total, '한 건도 못 셌다면 파서나 경로가 깨진 것이다').toBeGreaterThan(0);
    expect(byFile.length, '파일별 집계가 비었다').toBeGreaterThan(10);
  });
});
