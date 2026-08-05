import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * 이름 있는 Tailwind 기본 스텝 래칫 — **게이트가 없다고 주석이 자백하던 자리**.
 *
 * ## 왜 이 파일이 존재하나 (2026-08-03 규칙 감사 → 체계석)
 *
 * `eslint.config.mjs` 는 오래 "래칫(`type-ramp-coverage`)이 이름 있는 스텝을
 * 붙든다" 고 적어 왔는데 **거짓이었다** — 그 래칫의 `ARBITRARY_SIZE` 는 대괄호
 * arbitrary 패턴만 세고, 이름 유틸리티(`rounded-2xl` · `text-xl` …)는 한 건도
 * 세지 않는다. 게다가 그 래칫은 eslint 가 덮는 디렉토리를 통째로 건너뛰는데
 * `rounded-2xl` 19건 중 18건이 그 안이었다 — lint 도 래칫도 안 보는 자리.
 * 증거는 수 자체다: 주석이 12건이라 적은 뒤 20건으로 자랐고 아무것도 빨개지지
 * 않았다.
 *
 * ## 왜 lint 확장이 아니라 래칫인가
 *
 * `text-lg` 류 11건은 lint 커버 디렉토리 안에 있어 셀렉터를 켜면 즉시 CI 가
 * 빨개진다. 치환은 픽셀을 움직이므로(`text-xl` 20px 은 램프 어느 스텝도 아니다)
 * 자리마다 디자인 판정이 필요하고, 그 판정을 기다리는 동안 **자라지 못하게
 * 붙드는 일**은 래칫의 몫이다. `rounded-sm`(59) + 무접미 `rounded`(37)는 같은
 * 날 `--radius-micro`(4px) 등재 + 전량 기계 치환으로 **0이 됐고** eslint
 * 셀렉터가 마저 막는다 — 여기서는 재유입 차단(기준선 0)만 맡는다.
 *
 * 이 래칫은 `type-ramp-coverage` 와 달리 **eslint 커버 디렉토리를 건너뛰지
 * 않는다** — 이름 유틸리티는 그 룰의 사정거리 밖이라 커버/미커버 구분이 없다.
 */

/**
 * 패밀리별 기준선 — **내려가기만 한다.**
 *
 * 0 인 패밀리는 "없음"이 아니라 "재유입 차단"이다.
 *
 * ## 2026-08-04: 마지막 24건을 자리마다 판정해 전부 램프로 들였다
 *
 * 남아 있던 것은 값이 없어서가 아니라 **자리마다 디자인 판정이 필요해서**였다.
 * 빌드된 화면에서 재고 나서야 무엇을 고를지가 정해졌다:
 *
 * - **`rounded-2xl`(16px) 16건 → 전부 `rounded-panel`(12px).** 실측 근거는
 *   드로어 한 칸 안의 반경 센서스였다 — 399px 폭 한 열에 20 / 18 / 16 / 12 /
 *   9 / 6 **여섯 종**이 동시에 살아 있었고, 그중 `completeness`/`freshness`
 *   짝만 이미 `rounded-panel` 이라 **같은 줄의 형제가 어긋나 있었다**. 16 을
 *   12 로 내리면 시트 단(문서화된 예외 18·20)과 콘텐츠 단(12)이 갈리고,
 *   16/18/20 이 세 가지 일을 하면서 거의 같아 보이던 평평함이 사라진다.
 *   `card`(9)가 아니라 `panel`(12)인 이유: 이 상자들은 폭 365~399px 의 절
 *   컨테이너이고, 이미 그 자리를 고른 형제 둘과 `TopologyEmptyState` 의
 *   덮어쓰기(`rounded-[var(--radius-panel)]`)가 같은 답을 냈다.
 * - **`text-xl`(20px) 2건** — 드로어 아이콘 타일의 이모지는 `text-display`(23)
 *   로. 44px 타일에서 20px 는 채움률 54.5% 였고 램프 이웃은 16(36%)과
 *   23(52%)뿐이라 광학적으로 가까운 쪽을 골랐다. 마크다운 미리보기 `h1` 도
 *   같은 스텝 — 행간 짝이 28px 로 종전과 같아 줄 높이가 안 움직인다.
 * - **`text-lg`(18) 1건 · `text-base`(16) 1건** — 마크다운 미리보기의 h2/h3.
 *   본문이 `text-body-lg`(14)라 **머리말이 쓸 수 있는 램프 스텝은 16 과 23
 *   둘뿐**이다(그 아래는 본문보다 작아져 위계가 뒤집힌다). 그래서 사다리는
 *   display 23 / title 16 / body-lg 14(굵게)로 확정.
 * - **`text-2xl`+`text-3xl` 각 1건** — 편집기 h1 의 `text-2xl md:text-3xl` 을
 *   `text-display md:text-hero` 로. 24→23 은 1px, 30→30 은 0px 이고, 대신
 *   두 크기가 **행간 짝을 얻는다**(32→28 · 36→34).
 *
 * **`text-lg` 만 1 로 남는다** — `src/shared/ui/controls.tsx` 의 **산문 주석**
 * 이다(삭제된 `CardTitle` 이 램프 밖 `text-lg` 를 썼다는 사고 기록). 렌더되는
 * 값이 아니고, 게다가 `control-class.contract.test.ts` 가
 * `expect(SOURCE).toContain('text-lg')` 로 **그 문장을 붙들고 있다**. 이 래칫이
 * `.tsx` 만 스캔하는 이유가 "클래스 문자열은 컴포넌트 파일에 산다" 인데,
 * 주석도 같은 파일에 산다는 예외가 여기 하나 있다. 1 은 그 한 문장이다.
 */
const FAMILIES: ReadonlyArray<readonly [name: string, re: RegExp, budget: number]> = [
  ['rounded (무접미, 4px)', /(?<![-\w])rounded(?![-\w])/g, 0],
  ['rounded-xs', /(?<![-\w])rounded-xs(?![-\w])/g, 0],
  ['rounded-sm', /(?<![-\w])rounded-sm(?![-\w])/g, 0],
  // 19 → 16 → 0. 16 → 0 은 2026-08-04 per-site 판정(위 주석) — 전부 panel(12).
  ['rounded-2xl', /(?<![-\w])rounded-2xl(?![-\w])/g, 0],
  ['rounded-3xl', /(?<![-\w])rounded-3xl(?![-\w])/g, 0],
  ['text-xs', /(?<![-\w])text-xs(?![-\w])/g, 0],
  ['text-sm', /(?<![-\w])text-sm(?![-\w])/g, 0],
  ['text-base', /(?<![-\w])text-base(?![-\w])/g, 0],
  // 3 → 1. 남은 1 은 `controls.tsx` 의 산문 주석이고 계약 테스트가 그 문장을
  // 고정한다 — 렌더되는 값이 아니라 내릴 수 없는 바닥이다.
  ['text-lg', /(?<![-\w])text-lg(?![-\w])/g, 1],
  ['text-xl', /(?<![-\w])text-xl(?![-\w])/g, 0],
  ['text-2xl', /(?<![-\w])text-2xl(?![-\w])/g, 0],
  ['text-3xl', /(?<![-\w])text-3xl(?![-\w])/g, 0],
  ['text-4xl', /(?<![-\w])text-4xl(?![-\w])/g, 0],
  /*
   * ## 2026-08-04: 행간 패밀리 — 세 램프 중 마지막 무게이트 구멍을 닫는다
   *
   * 타입·반경은 이 래칫 + eslint 이름 스텝 셀렉터가 붙드는데 **행간만 아무
   * 게이트가 없었다** — eslint 는 `leading-[N]`(대괄호)만 보고, 이름 유틸리티
   * (`leading-relaxed` 71 · `leading-snug` 17 …)는 어떤 룰도 안 거쳤다.
   * `text-sm`/`rounded-md` 268건이 램프를 통째로 우회하던 것과 같은 모양이다.
   *
   * 켜기 전 전수(이 스캐너와 동일 조건, 2026-08-04): relaxed 71 · 숫자꼴 103 ·
   * snug 17 · none 9 · tight 8 · normal 0 · loose 0 = **208곳 / 40여 파일**.
   * 한 PR 로 못 치우는 규모다 — 값 층 정본이 「행간은 크기의 짝」이라 못박아서
   * 치환이 기계적이지 않다: `leading-relaxed`(×1.625)를 짝 스텝으로 옮기면
   * 픽셀이 움직이고(실측 22.75→22 등), `leading-4/5/6`(16/20/24px)은 픽셀
   * 동일 치환이 가능하지만 **어느 크기와 짝인지**는 자리마다 봐야 한다.
   * 그래서 shadow-\[ 전례(켜자마자 144→548 소음)를 따르지 않고 래칫으로
   * 붙들고 단계를 나눈다 — 재유입은 오늘부터 0, 상환은 per-site 판정 라운드로.
   * 치환 목적지는 `--leading-*` 램프(caption…hero-lg · display-tight · prose)다.
   */
  /*
   * ## 비율 계열 — 2026-08-05 에 **자리별로 실측했다** (아직 안 갚음)
   *
   * 숫자 계열과 달리 이쪽은 픽셀이 움직인다. 다음 디자인 패스가 처음부터 다시
   * 재지 않도록, 각 자리가 **어느 램프 스텝으로 갈 때 몇 px 움직이는지**를 여기
   * 남긴다(98곳이 같은 줄에 타입을 갖고 있고 2곳은 없다):
   *
   * | 현재 | 옆 타입 | 결과 px | 최근접 스텝 | 이동 | 건수 |
   * |---|---|---|---|---|---|
   * | relaxed | label(11)     | 17.88 | label(16)     | **−1.88** | **31** |
   * | relaxed | caption(9.5)  | 15.44 | label(16)     | +0.56 | 22 |
   * | snug    | label(11)     | 15.12 | label(16)     | +0.88 | 14 |
   * | relaxed | body(12.5)    | 20.31 | body(20)      | −0.31 | 11 |
   * | none    | caption(9.5)  |  9.50 | caption(14)   | **+4.50** | 6 |
   * | tight   | display(23)   | 28.75 | display(28)   | −0.75 | 3 |
   * | relaxed | body-lg(14)   | 22.75 | body-lg(22)   | −0.75 | 3 |
   *
   * 픽셀 0 은 **4곳뿐**이고 58곳이 1px 이하, 7곳이 2px 초과다.
   *
   * **기계 치환을 하면 안 되는 이유 둘** — 둘 다 위 표가 아니라 «무엇을 하는
   * 자리인가» 에서 나온다:
   *
   * 1. **`relaxed + text-label` 31곳은 −1.88px, 즉 좁히는 방향**이다. 작은
   *    한글 본문에서 행간을 2px 좁히는 것은 가독성 결정이지 정리가 아니다
   *    (`design.md`: 행간 상한은 한글 기준으로 정한다).
   * 2. **`leading-none` 은 행간 값이 아니라 레이아웃 지시**다 — 배지·숫자처럼
   *    고정 높이 상자 안의 한 줄에서 «여분을 주지 마라» 는 뜻이고, 그래서
   *    `caption`(14)으로 옮기면 9.5px 상자가 +4.5px 터진다. 무게 축에서
   *    `font-normal`(「강조를 끈다」)을 램프 밖이 아니라 **기본값**으로 본 것과
   *    같은 종류의 구별이다.
   *
   * 갚는 라운드는 자리별 before→after 표를 갖는 디자인 패스다.
   */
  ['leading-none', /(?<![-\w])leading-none(?![-\w])/g, 9],
  ['leading-tight', /(?<![-\w])leading-tight(?![-\w])/g, 8],
  ['leading-snug', /(?<![-\w])leading-snug(?![-\w])/g, 16],
  ['leading-normal', /(?<![-\w])leading-normal(?![-\w])/g, 0],
  ['leading-relaxed', /(?<![-\w])leading-relaxed(?![-\w])/g, 71],
  ['leading-loose', /(?<![-\w])leading-loose(?![-\w])/g, 0],
  // 숫자꼴(leading-4/5/6/7 …)은 px 고정이라 램프 스텝과 값이 겹치지만
  // (16/20/24/28 = label/body/title/display) 짝 판정 없는 이름이다.
  // 103 → 86: 「내 에이전트 연결」 재구성(2026-08-04)이 이 한 파일에서 17건을
  // 갚았다. 갚는 법은 치환이 아니라 **삭제**였다 — 크기 스텝이 자기 행간을
  // 이미 싣고 있어서(companion 결합) `text-label leading-4` 의 뒤 절반은
  // 램프가 내는 값을 손으로 다시 적은 것이었다.
  /*
   * ## 2026-08-05: 숫자 계열 86 → 0 (픽셀 이동 0)
   *
   * Tailwind 의 `leading-<n>` 은 `n × 4px` 이고, 이 저장소의 행간 램프에 **같은
   * px 이 이미 이름으로 있었다**:
   *
   *   leading-4 (16px) → leading-label · leading-5 (20px) → leading-body
   *   leading-6 (24px) → leading-title · leading-7 (28px) → leading-display
   *
   * 그래서 86곳 전부가 **바이트가 아니라 픽셀이 동일한** 치환이었다. 위 절이
   * 「치환이 기계적이지 않다」고 적어 둔 것은 **비율 계열**(relaxed 1.625 ·
   * snug 1.375 …)에 대한 판단이고, 숫자 계열에는 해당하지 않았다 — 두 부류를
   * 한 문장으로 묶은 것이 그때의 과잉 일반화다.
   *
   * 짝 실측: 30곳은 `text-X + leading-X` 로 램프의 기본 짝과 일치했고, 52곳은
   * 의도된 오버라이드였다(예: `text-caption`(9.5) 옆의 16px — 한글 본문에서
   * 기본 14px 보다 느슨하게 준 자리). 오버라이드도 픽셀은 그대로이고, 달라진
   * 것은 **익명의 20px 이 「body 행간」이라는 이름을 얻은 것**뿐이다.
   */
  ['leading-<number>', /(?<![-\w])leading-\d+(?![-\w])/g, 0],
];

const ROOTS = ['src', 'app'] as const;

function collect(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      collect(p, out);
      continue;
    }
    /*
     * `.tsx` 만 — `.ts` 를 넣으면 주석·산문 속 영어 단어("rounded", 그리고
     * 값 층 주석이 실측 근거로 적어 둔 `text-lg`)가 위반으로 잡힌다(초판
     * 실측: .ts 포함 시 무접미 rounded 오탐 13건, 전부 주석/산문). 클래스
     * 문자열은 컴포넌트 파일에 산다 — 실위반 전수도 전부 .tsx 였다.
     */
    if (!name.endsWith('.tsx')) continue;
    if (name.includes('.test.') || name.includes('.spec.')) continue;
    out.push(p);
  }
}

function measure(): Map<string, { count: number; files: Map<string, number> }> {
  const files: string[] = [];
  for (const root of ROOTS) collect(join(process.cwd(), root), files);
  expect(files.length, '스캔이 비었다 — 빈 집합 위의 래칫은 게이트가 아니다').toBeGreaterThan(150);

  const result = new Map<string, { count: number; files: Map<string, number> }>();
  for (const [name] of FAMILIES) result.set(name, { count: 0, files: new Map() });
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const rel = relative(process.cwd(), file);
    for (const [name, re] of FAMILIES) {
      const hits = source.match(re)?.length ?? 0;
      if (hits === 0) continue;
      const bucket = result.get(name)!;
      bucket.count += hits;
      bucket.files.set(rel, hits);
    }
  }
  return result;
}

describe('이름 있는 off-ramp 유틸리티 래칫', () => {
  const actual = measure();

  it('패밀리별 부채가 기준선을 넘지 않는다', () => {
    const grown: string[] = [];
    for (const [name, , budget] of FAMILIES) {
      const bucket = actual.get(name)!;
      if (bucket.count > budget) {
        const top = [...bucket.files.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([f, n]) => `${f}(${n})`)
          .join(' · ');
        grown.push(`  ${name}: ${budget} → ${bucket.count} — ${top}`);
      }
    }
    expect(
      grown,
      `이름 있는 Tailwind 기본 스텝이 늘었다 — 램프 우회다.\n` +
        `크기는 text-caption…hero, 반경은 rounded-micro/chip/card/panel 로.\n${grown.join('\n')}`,
    ).toEqual([]);
  });

  it('줄었으면 기준선도 내린다 — 여유를 무료로 두지 않는다', () => {
    const lowered = FAMILIES.filter(([name, , budget]) => actual.get(name)!.count < budget).map(
      ([name, , budget]) => `  ${name}: 장부 ${budget} → 실측 ${actual.get(name)!.count}`,
    );
    expect(
      lowered,
      `부채가 줄었다. FAMILIES 의 기준선도 같이 내려라.\n${lowered.join('\n')}`,
    ).toEqual([]);
  });

  it('탐지기가 실제로 잡는다 — 위반 1줄 + 정상 1줄 프로브', () => {
    const violating =
      'className="rounded-sm rounded rounded-2xl text-xl text-sm md:text-3xl leading-relaxed leading-none leading-5"';
    const clean =
      'className="rounded-micro rounded-chip rounded-card rounded-panel rounded-sheet rounded-full text-caption text-label text-body-lg text-left leading-body leading-display-tight leading-prose"';
    const count = (s: string) =>
      FAMILIES.reduce((sum, [, re]) => sum + (s.match(re)?.length ?? 0), 0);
    expect(count(violating)).toBe(9);
    expect(count(clean)).toBe(0);
  });
});
