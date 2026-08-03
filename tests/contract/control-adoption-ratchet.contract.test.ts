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
 */
const BASELINE_HAND_WRITTEN_CONTROLS = 389;

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
      let n = 0;
      for (const m of source.matchAll(/<button\b/g)) {
        const tag = openingTag(source, m.index + m[0].length);
        if (!/className/.test(tag)) continue; // 클래스가 없으면 손으로 쓴 규격이 아니다
        if (/controlClass\s*\(/.test(tag)) continue; // 시스템을 통과했다
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
