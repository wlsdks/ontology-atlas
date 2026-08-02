import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
// 글로브 목록을 여기에 복제하지 않고 **원본을 읽는다** — 복제본은 조용히 드리프트
// 하고, 그러면 이 테스트가 지키려는 사각지대를 스스로 만든다.
import { codexMigratedGlobs } from "../../eslint.config.mjs";

/**
 * 타입/반경 램프 lint 룰이 **어디를 안 보는지** 를 고정하는 래칫.
 *
 * ## 왜 이 테스트가 존재하나
 *
 * 2026-07-26 실측: `ProjectDetailPage.tsx` 의 브레드크럼이 `text-[12px]` 로
 * 램프를 벗어나 있었고 구분자 글리프는 크기 클래스가 아예 없어 루트 16px 로
 * 렌더됐다. 그런데
 *
 *     pnpm exec eslint src/views/project-detail/ui/ProjectDetailPage.tsx
 *
 * 는 **위반 0건**을 보고했다. 룰이 틀린 게 아니라 그 디렉토리를 안 덮고 있었다.
 * 이건 게이트의 최악 실패 모드다 — 침묵하는 통과. 사람은 "0건" 을 "깨끗함" 으로
 * 읽지 "안 봄" 으로 읽지 않는다.
 *
 * ## 왜 룰을 전면 확대하지 않았나
 *
 * `design.md` "룰을 켜기 전 반드시 측정한다" 절차대로 세어봤다: 미커버
 * 디렉토리 19곳에 이탈 363건. 그중 상당수는 램프에 **없는 값**(13 · 27 · 11.5 ·
 * 10.5px…)이라 치환이 곧 렌더 픽셀 변경이고, 자리마다 디자인 판단이 필요하다.
 * 룰을 그대로 켜면 lint 경고가 145 → 500+ 로 뛰어 기존 신호를 덮는다. 강제가
 * 아니라 소음이다.
 *
 * 그래서 룰 대신 **래칫**을 건다. 부채는 그대로 두되 **자라지 못하게** 한다:
 *
 * - 커버된 디렉토리(`codexMigratedGlobs`)는 ESLint 가 error 로 막는다.
 * - 미커버 디렉토리는 여기 등재된 수치를 **넘을 수 없다**.
 * - 등재되지 않은 새 미커버 디렉토리가 이탈을 들고 나타나면 실패한다.
 * - 부채가 0이 된 디렉토리는 `codexMigratedGlobs` 로 승격하라고 실패로 알린다.
 */

/** ESLint `arbitrarySizeSelectors` 와 같은 판정을 **손으로 복제한 것**이다.
 * 한 쪽만 고치면 드리프트고, 실제로 드리프트했다 — 2026-07-28 실측에서 12
 * 패밀리 중 7종만 여기 있었다. 복제본은 반드시 갈라지므로 근본 해법은
 * 원본에서 파생시키는 것이다. 그 리팩터 전까지는 **패밀리를 추가할 때 양쪽을
 * 같이 고친다**. */
const ARBITRARY_SIZE = [
  /text-\[[0-9.]+px\]/g,
  /rounded-\[[0-9.]+px\]/g,
  /shadow-\[(?:(?!var\()[^\]])*\]/g,
  /-\[(?:color:)?#[0-9a-fA-F]{3,8}/g,
  /(?:^|[^-\w])duration-\d+/g,
  /leading-\[[0-9.]+\]/g,
  /text-\[length:var\(--text-/g,
  // 2026-07-28 — 이 목록이 ESLint 셀렉터와 **갈라져 있었다**. 주석은 "같은
  // 판정" 이라 적어 놨는데 12 패밀리 중 7종만 복제돼 있었고, 나머지 5종은
  // lint 가 안 보는 14개 디렉토리에서 아무 게이트도 없이 자랄 수 있었다.
  // 그게 정확히 이 래칫이 막으라고 만들어진 침묵이다.
  //
  // 근본 해법은 셀렉터를 원본에서 **파생**시키는 것이다(복제본은 반드시
  // 갈라진다). 그 리팩터가 오기 전까지, 목록을 맞춰 두고 개수를 잰다.
  /animate-\[[^\]]*_[0-9.]+m?s/g,
  /duration-\[[0-9.]+m?s\]/g,
  /shadow-\[0_0_(?!0[_\]])[^\]]*var\(--color-(?!shadow-)/g,
  /(?:^|[^-\w])shadow-(?:2xs|xs|sm|md|lg|xl|2xl)(?![-\w])/g,
];

/**
 * 미커버 디렉토리의 **현재** 이탈 수. 이 수는 내려가기만 한다.
 *
 * 올리는 커밋은 반려다 — 새 하드코딩을 추가하는 대신 램프 토큰을 쓰거나, 램프에
 * 없는 값이 정말 필요하면 토큰 신설 PR 을 먼저 낸다.
 */
// 2026-07-26 진입 검수 E-11 — 진입 경로 4곳(first-run-starter 23 ·
// docs-vault-local 18 · locale-switch 2 · project-quick-edit 1)을 0으로 만들고
// `codexMigratedGlobs` 로 승격했다. 여기서 빠졌다는 것은 "부채 없음"이 아니라
// **lint 가 error 로 막는다**는 뜻이다.
// 2026-07-27 새 프로젝트 화면 재구성 — 만들기 화면의 가르치는 카드 4개와
// 상단 저장 클러스터를 걷어내면서 그 안의 램프 이탈이 같이 사라졌다
// (project-edit 32 → 26 · project-editor 6 → 2). 래칫은 내려가기만 한다.
// 2026-07-27 `/download` 리메이크 — 이 장부의 최대 항목(59건)이 재구성으로
// 0이 되어 `codexMigratedGlobs` 로 승격됐다. 여기서 빠졌다는 것은 "부채
// 없음"이 아니라 **lint 가 error 로 막는다**는 뜻이다.
const UNCOVERED_DEBT: ReadonlyArray<readonly [string, number]> = [
  ["src/views/home", 45],
  ["src/views/ontology-studio", 45],
  ["src/entities/project", 33],
  ["src/features/project-edit", 26],
  ["src/features/vault-ontology", 27],
  ["src/views/project-detail", 23],
  ["src/views/first-run", 14],
  ["src/views/project-editor", 2],
  ["src/views/root-entry", 6],
];

const ROOTS = ["src", "app"] as const;

function collectSourceFiles(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, out);
      continue;
    }
    if (!/\.tsx?$/.test(full)) continue;
    if (full.includes(".test.") || full.includes(".spec.")) continue;
    out.push(full);
  }
}

/** `src/shared/ui/**​/*.{ts,tsx}` 같은 glob 을 디렉토리 접두사로 환원한다. */
function globPrefix(pattern: string): string {
  return pattern.replace(/\/\*\*.*$/, "");
}

/** 경로를 부채 장부의 키(상위 3단 디렉토리 또는 파일)로 접는다. */
function debtKey(path: string): string {
  const parts = path.split("/");
  return parts.length >= 3 ? parts.slice(0, 3).join("/") : path;
}

function measure(): Map<string, number> {
  const covered = (codexMigratedGlobs as string[]).map(globPrefix);
  const files: string[] = [];
  for (const root of ROOTS) collectSourceFiles(join(process.cwd(), root), files);

  const counts = new Map<string, number>();
  for (const file of files) {
    const path = relative(process.cwd(), file);
    if (covered.some((prefix) => path.startsWith(`${prefix}/`))) continue;
    const source = readFileSync(file, "utf8");
    const hits = ARBITRARY_SIZE.reduce((sum, re) => sum + (source.match(re)?.length ?? 0), 0);
    if (hits === 0) continue;
    const key = debtKey(path);
    counts.set(key, (counts.get(key) ?? 0) + hits);
  }
  return counts;
}

describe("타입/반경 램프 — lint 사각지대 래칫", () => {
  it("미커버 디렉토리의 램프 이탈이 장부를 넘지 않는다", () => {
    const actual = measure();
    // 게이트 생존 확인 — 스캔이 비면 "부채 0" 이 아니라 결함이다.
    expect(actual.size).toBeGreaterThan(0);

    const ledger = new Map(UNCOVERED_DEBT);
    const grown: string[] = [];
    const undeclared: string[] = [];

    for (const [key, count] of actual) {
      const budget = ledger.get(key);
      if (budget === undefined) {
        undeclared.push(`  ${key}: ${count}건 (장부에 없음)`);
        continue;
      }
      if (count > budget) grown.push(`  ${key}: ${budget} → ${count}`);
    }

    expect(
      [...grown, ...undeclared],
      `램프 밖 하드코딩이 늘었다. ESLint 는 이 디렉토리를 안 보므로 "위반 0건"\n` +
        `으로 보고한다 — 사각지대다. text-caption/label/body/body-lg/title/display/\n` +
        `hero · rounded-chip/card/panel 로 쓰고, 램프에 없는 값이 필요하면 토큰\n` +
        `신설 PR 을 먼저 내라.\n${[...grown, ...undeclared].join("\n")}`,
    ).toEqual([]);
  });

  it("부채가 0이 된 디렉토리는 lint 커버리지로 승격한다", () => {
    const actual = measure();
    const cleared = UNCOVERED_DEBT.filter(([key]) => (actual.get(key) ?? 0) === 0).map(
      ([key, budget]) => `  ${key} (장부 ${budget} → 실측 0)`,
    );

    expect(
      cleared,
      `이탈이 0이 된 디렉토리다. 장부에서 빼고 eslint.config.mjs 의\n` +
        `codexMigratedGlobs 에 넣어라 — 래칫은 임시 조치고, 진짜 게이트는 lint 다.\n` +
        `${cleared.join("\n")}`,
    ).toEqual([]);
  });

  it("장부에 사라진 경로가 남아 있지 않다", () => {
    const actual = measure();
    // 디렉토리가 삭제·이동됐는데 장부만 남으면 예산이 유령으로 살아남는다.
    const stale = UNCOVERED_DEBT.filter(([key]) => !actual.has(key)).map(([key]) => `  ${key}`);
    expect(stale, `장부에만 있는 경로 — 삭제하거나 갱신하라.\n${stale.join("\n")}`).toEqual([]);
  });

  it("래칫이 실제로 위반을 잡는다", () => {
    // 판정 자체를 고정한다 — 정규식이 무력화되면 위 테스트는 영원히 통과한다.
    const violating =
      'className="text-[12px] rounded-[9px] shadow-[0_1px_2px_rgba(0,0,0,.4)] duration-150 leading-[1.55] sm:text-[length:var(--text-display)]"';
    // 정상형이 전부 통과해야 한다: 토큰 참조, 기본(--motion-fast)이라 duration
    // 클래스를 생략한 형태, 행간 램프 스텝, 값이 램프 짝과 같은 기존 named 행간
    // 유틸리티(leading-5 = 20px = --leading-body), 그리고 램프 **밖** 크기
    // 토큰의 arbitrary length 참조(레일·크롬 전용 — 램프 우회가 아니다).
    const clean =
      'className="text-body rounded-card shadow-[var(--shadow-elevation-1)] duration-[var(--motion-base)] transition-colors leading-body leading-5 text-[length:var(--topology-chrome-title-size)]"';
    const count = (s: string) =>
      ARBITRARY_SIZE.reduce((sum, re) => sum + (s.match(re)?.length ?? 0), 0);
    expect(count(violating)).toBe(6);
    expect(count(clean)).toBe(0);
  });
});
