import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **격자가 자기 틀보다 넓으면 안 된다.**
 *
 * ## 왜 이 검사가 생겼나 (2026-08-20 릴리스 검수 실측)
 *
 * `/project/new/` 와 `/project/[slug]/edit/` 의 두 열 격자가
 * `lg:grid-cols-[640px_260px]` + `gap-8` 이었다 — 합 **932px**. 그런데 그 폼이
 * 사는 틀은 `PAGE_FRAME_FORM`(max-w 960 + px-10)이라 내용 상자가 **880px** 다.
 * 그래서 오른쪽 열이 **모든 화면 폭에서** 제 컨테이너 밖으로 52px 나가 있었고
 * (1512 에서도 그랬다), 뷰포트가 ~1092px 밑이면 그때부터 화면에서 잘렸다.
 *
 * ## 왜 lint 나 브라우저 검사가 아닌가
 *
 * **lint 는 못 본다** — `grid-cols-[640px_260px]` 도 `max-w-[960px]` 도 각각은
 * 완전히 정당한 문자열이다. 틀린 것은 **둘을 같이 둔 것**이고, 그 둘은 다른
 * 파일에 있다. 한 파일의 구문 트리만 보는 룰로는 표현할 수 없다.
 *
 * **브라우저 없이도 판정된다** — 이건 산수다. 고정 트랙과 간격의 합이 내용
 * 상자보다 크면 넘친다. 그래서 e2e 가 아니라 계약 시험이다(밀리초 안에 끝나고
 * 기계에 따라 흔들리지 않는다 — 이 저장소가 밀리초 게이트를 금지하는 것과 같은
 * 이유로 여기서는 픽셀 산수를 고른다).
 */

const repoRoot = path.resolve(__dirname, '..', '..');
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), 'utf8');

/** Tailwind 여백 램프 한 칸 = 4px. `gap-8` → 32px. */
const SPACING_STEP = 4;

/** `max-w-[960px] … md:px-10` 에서 내용 상자 폭을 낸다. */
function frameContentWidth(frameConst: string): number {
  const source = read('src/shared/ui/page-frame.ts');
  // 선언이 두 줄로 쪼개져 있다(`= ` 다음 줄에 문자열). 줄 단위로 찾으면 놓친다.
  const declaration = new RegExp(`export const ${frameConst}\\s*=\\s*"([^"]+)"`).exec(source);
  if (!declaration) throw new Error(`${frameConst} 선언을 못 찾았다`);
  const classes = declaration[1];
  const max = /max-w-\[(\d+)px\]/.exec(classes);
  if (!max) throw new Error(`${frameConst} 에 max-w 리터럴이 없다`);
  // 넓은 화면에서 실제로 적용되는 것은 `md:px-N` 이다.
  const pad = /md:px-(\d+)/.exec(classes);
  const padPx = pad ? Number(pad[1]) * SPACING_STEP : 0;
  return Number(max[1]) - padPx * 2;
}

/**
 * 격자를 선언한 **그 className 문자열**을 통째로 돌려준다.
 *
 * ⚠️ 트랙과 간격을 각각 파일 전체에서 찾으면 안 된다 — 이 파일에는 `gap-2`
 * 같은 다른 간격이 앞쪽에 여럿 있고, 처음 켤 때 실제로 그것을 집어 간격을
 * 32px 대신 8px 로 **과소 보고**했다(넘침은 잡았지만 숫자가 틀렸고, 그 차이가
 * 큰 경우 진짜 넘침을 통과시킬 수 있다). 둘은 같은 문자열에서 읽는다.
 */
function gridClassName(source: string): string {
  const match = /className="([^"]*lg:grid-cols-\[[^\]]+\][^"]*)"/.exec(source);
  if (!match) throw new Error('className 안의 lg:grid-cols 리터럴을 못 찾았다');
  return match[1];
}

/** `lg:grid-cols-[A_B]` 의 **고정 폭 트랙**만 더한다(`1fr`·`minmax` 는 늘어난다). */
function fixedTrackWidth(source: string): { fixed: number; tracks: string[] } {
  /*
   * ⚠️ **주석 안의 옛 값을 집으면 안 된다.** 이 파일은 종전 값
   * (`lg:grid-cols-[640px_260px]`)을 주석에 그대로 인용해 두었고, 소스를 통째로
   * 훑는 정규식은 그것을 먼저 만난다 — 이 검사를 처음 켤 때 실제로 그렇게
   * 걸렸다. 그래서 **`className` 문자열 안**에 있는 것만 본다.
   */
  const match = /lg:grid-cols-\[([^\]]+)\]/.exec(gridClassName(source));
  if (!match) throw new Error('lg:grid-cols 트랙을 못 읽었다');
  // `minmax(0,1fr)_260px` — 콤마 안쪽을 건드리지 않게 괄호 깊이를 센다.
  const tracks: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of match[1]) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === '_' && depth === 0) {
      tracks.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  tracks.push(current);
  const fixed = tracks.reduce((sum, track) => {
    const px = /^(\d+)px$/.exec(track.trim());
    return sum + (px ? Number(px[1]) : 0);
  }, 0);
  return { fixed, tracks };
}

function gapWidth(source: string): number {
  // 격자를 선언한 그 className 안의 간격만 본다(위 주석의 이유).
  const match = /\bgap-(\d+)\b/.exec(gridClassName(source));
  return match ? Number(match[1]) * SPACING_STEP : 0;
}

describe('두 열 폼 격자 — 자기 틀 안에 들어가는가', () => {
  const form = read('src/features/project-edit/ui/ProjectForm.tsx');

  it('고정 트랙 + 간격이 틀의 내용 상자를 넘지 않는다', () => {
    const content = frameContentWidth('PAGE_FRAME_FORM');
    const { fixed, tracks } = fixedTrackWidth(form);
    const gap = gapWidth(form);
    expect(
      fixed + gap * (tracks.length - 1),
      `고정 트랙(${fixed}px) + 간격(${gap}px)이 틀의 내용 상자 ${content}px 를 넘는다 — ` +
        `오른쪽 열이 컨테이너 밖으로 나간다`,
    ).toBeLessThanOrEqual(content);
  });

  it('늘어나는 트랙이 하나는 있다 — 전부 고정이면 틀이 바뀔 때 다시 넘친다', () => {
    const { tracks } = fixedTrackWidth(form);
    expect(
      tracks.some((track) => /fr|minmax|auto/.test(track)),
      '모든 트랙이 고정 폭이다 — 틀이 좁아지면 그대로 넘친다',
    ).toBe(true);
  });

  it('검사기가 헛돌지 않는다 — 양쪽에서 실제로 값을 읽어 왔다', () => {
    // 추출기가 조용히 0 을 돌려주면 위 두 시험은 통과해 버린다.
    expect(frameContentWidth('PAGE_FRAME_FORM')).toBeGreaterThan(400);
    // 32px 이어야 한다(`gap-8`). 8 이 나오면 파일의 다른 간격을 집은 것이다.
    expect(gapWidth(form)).toBe(32);
    expect(fixedTrackWidth(form).tracks.length).toBeGreaterThan(1);
  });
});
