import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { stripComments } from "../../scripts/lib/static-surface-census.mjs";

/**
 * radiogroup **행동** 래칫 — role 이 약속한 키보드가 실재하는가 (2026-08-15).
 *
 * ## 왜 이 게이트가 필요한가 — 값 축은 이미 「종료 선언」됐다
 *
 * `control-adoption-ratchet` 은 2026-08-06 에 **「손으로 스타일을 적은 자리 0」
 * 종료 선언**을 했다. 그런데 이번 전수에서 프리미티브 밖 손 radiogroup
 * **11그룹 + `aria-pressed` 로 배타 선택을 표현한 9그룹 = 18그룹**이 나왔고,
 * **roving 구현 0 · onKeyDown 0 — 100%** 였다. 그 11그룹은 거의 다
 * `controlClass` 를 부르므로 **값 축 래칫에서는 초록**이다.
 *
 * > **값 층은 완전 채택됐고, 행동 층은 한 번도 검사된 적이 없다.**
 *
 * ## 왜 lint 도 axe 도 못 잡나 (둘 다 실측했다)
 *
 * - **lint** — roving 의 부재는 **클래스의 부재**다. `no-restricted-syntax` 는
 *   있는 것을 찾지 못하는 것을 찾지 못한다.
 * - **axe** — 정적 DOM 룰만 돈다. `radiogroup > radio` 구조는 완벽히 유효하고,
 *   화살표 이동은 **행동**이라 룰 자체가 없다.
 *
 * ## 그래서 무엇을 세나 — 행동을 import 로 환원한다
 *
 * `useRovingRadioGroup` 이 **행동의 단일 구현**이 되는 순간, 「행동이 있는가」가
 * 「그 훅을 부르는가」로 환원된다. 그게 이 구조를 고른 두 번째 이유다.
 *
 * 프리미티브(`SegmentedControl`)를 쓰는 자리는 애초에 `role` 을 손으로 안 쓰므로
 * 이 스캐너의 시야 밖이다 — 즉 **여기 걸리는 것은 손으로 role 을 건 자리뿐**이고,
 * 그 자리는 같은 파일에서 훅을 불러야 통과한다.
 *
 * 등재는 면제가 아니다: 등재된 파일도 **훅 호출이 실재해야** 통과한다. 이름만
 * 적어 두고 배선을 안 하면 빨개진다(Dialog 래칫의 「장부가 실측보다 후하면
 * 빨개진다」 승계).
 */

const ROOT = process.cwd();

/** 행동의 단일 구현. 이 파일과 프리미티브는 세는 대상이 아니다. */
const HOOK = "useRovingRadioGroup";
const EXEMPT_FILES = new Set([
  "src/shared/lib/use-roving-radio-group.ts",
  "src/shared/ui/segmented-control.tsx",
]);

/**
 * **등재** — 그릇이 프리미티브의 두 캐노니컬로 수렴하지 않아 훅을 직접 입는
 * 자리. 면제가 아니라 **「이 그릇은 변형으로 못 만든다」는 기록**이다.
 *
 * ⚠️ **훅을 입으면 이 스캐너의 시야에서 빠진다** — role 이 훅의 `groupProps` 에서
 * 나오므로 파일에 `role="radiogroup"` 리터럴이 남지 않는다. 설계상 맞다(폴리싱할
 * 손 role 이 없다). 그래서 이 목록은 **강제가 아니라 기록**이고, 채택이 조용히
 * 되돌아가는 것은 아래 `HOOK_ADOPTION_FLOOR` 가 막는다.
 */
const REGISTERED: ReadonlyArray<readonly [file: string, why: string]> = [
  ["src/widgets/app-settings-menu/ui/AppearancePickers.tsx", "격자 미리보기 타일 — shape:'tile' + 부모/자식으로 갈린 활성 잉크"],
  ["src/widgets/topology-index-panel/ui/TopologyIndexPanel.tsx", "패널 스코프 잉크 + 크롬 반경 + 소유자가 두 번 고쳐 확정한 48px 균일폭"],
  ["src/widgets/project-drawer/ui/ProjectDrawer.tsx", "shape:'pill' + 대문자 mono caption — 값 층 칩 램프의 조합이 아니다"],
  ["src/widgets/atlas-git-panel/ui/CommitDetail.tsx", "tone:'secondary' + 「눌린 칩의 인디고를 덮지 마라」 조건부 보더"],
  ["src/views/docs-vault/ui/parts/DocsSidebarBody.tsx", "bg-canvas 우물 · Chip 아이템 · Tooltip 래퍼 · 켜진 칩만 라벨"],
  /*
   * ⚠️ 아래 다섯은 「체계」석 판정에서 **이주 대상**이었다. 실측이 그 배정을
   * 뒤집었다 — 다섯 다 **값 층에 없는 hover 잉크**를 지고 있어서, 이주하면
   * 비활성 항목의 hover 피드백이 사라진다. 이 저장소의 hover 는 축이 아니라
   * 자리마다 손으로 쓰는 것이고(전수: `controlClass` 호출 **312곳**이 hover 를
   * 손으로 쓴다 — 칩 88 · link 74 · row 42 · card 34 · icon 28 · pill 24 ·
   * segment 19), 같은 「비활성 세그먼트 hover」 역할에 세 자리가 **서로 다른
   * 잉크**를 쓴다(`text-primary` · `text-secondary` · `topology-v2-panel-text-primary`).
   *
   * 그래서 그릇 수렴은 **hover 축 판정 뒤**로 미룬다. 행동은 지금 다 붙였다.
   */
  ["src/views/ontology-insights/ui/tabs/MeaningGapSection.tsx", "비활성 칩 hover — 값 층에 칩 hover 가 없다"],
  ["src/features/ontology-blocks/ui/BlockImportModule.tsx", "p-1/gap-1 인셋 + 비활성 세그먼트 hover"],
  ["src/features/first-run-starter/ui/FirstRunStarterModule.tsx", "패널 스코프 hover 잉크"],
];

/**
 * **훅 호출 «자리» 수의 바닥.** 위 등재가 강제가 아니므로 이 수가 대신 방향을
 * 잠근다 — 줄면 누군가 행동 층을 걷어낸 것이다(늘리는 것은 자유).
 *
 * ⚠️ **파일 수가 아니라 자리 수를 센다.** 처음엔 파일로 셌는데 프로브가 그
 * 구멍을 잡았다: `AppearancePickers` 는 그룹이 둘이라 **한쪽 배선을 걷어내도
 * 파일은 여전히 훅을 부르므로** 초록이었다. 래칫의 단위가 결함의 단위보다
 * 굵으면 그만큼 못 본다.
 *
 * 오늘 **11자리 = 등재 10파일**(그중 `AppearancePickers` 만 그룹이 둘이라 2) 이다.
 * 프리미티브 파일 자신은 면제 목록이라 이 수에 안 들어가고, 「프리미티브가 훅을
 * 쓰는가」는 공회전 방지 시험이 따로 단언한다 — 두 자리에서 각각 잠근다.
 */
const HOOK_ADOPTION_FLOOR = 11;

/**
 * **부채 장부** — 아직 이주도 훅 착용도 안 한 손 radiogroup. 늘 수 없고, 갚으면
 * 줄을 지운다. 각 줄의 처분은 「체계」석 판정(docs/DECISIONS.md 2026-08-15 (8))
 * 에 있다.
 */
const DEBT: ReadonlyArray<readonly [file: string, count: number]> = [
  /*
   * ✅ **비어 있다 (2026-08-15).** 프리미티브 밖에서 손으로 건
   * `role="radiogroup"` 이 **0** 이고, 배타 선택을 `aria-pressed` 로 표현하던
   * 9그룹도 전부 재문법됐다. 행동 층 결함 18/18 → **0/18.**
   *
   * 남은 것은 **그릇**의 수렴이고 그건 결함이 아니라 설계 과제다(위 등재).
   */
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(p, out);
      continue;
    }
    if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

/**
 * `role="radiogroup"` 어커런스를 파일별로 센다.
 *
 * ⚠️ 따옴표 변종을 둘 다 본다 — 2026-08-05 에 아이콘 래칫이 작은따옴표만 보다가
 * 저장소의 **73%** 를 못 본 채 초록이었다. 그 교훈이 아래 커버리지 단언이다.
 */
const ROLE_RE = /role=\{?["']radiogroup["']\}?/g;

const HOOK_CALL_RE = new RegExp(`${HOOK}\\s*(?:<[^>]*>)?\\s*\\(`);
/** 같은 패턴의 전역판 — 파일 안의 **자리 수**를 센다. */
const HOOK_CALL_RE_G = new RegExp(`${HOOK}\\s*(?:<[^>]*>)?\\s*\\(`, "g");

function scan() {
  const found = new Map<string, number>();
  /** 훅을 부르는 **모든** 파일 — role 리터럴 유무와 무관하게 센다. */
  const hookFiles = new Set<string>();
  let hookCallSites = 0;
  let scanned = 0;
  let doubleQuoted = 0;
  let singleQuoted = 0;

  for (const dir of ["src", "app"]) {
    const base = path.join(ROOT, dir);
    for (const file of walk(base)) {
      const rel = path.relative(ROOT, file).split(path.sep).join("/");
      scanned += 1;
      if (EXEMPT_FILES.has(rel)) continue;
      /*
       * ⚠️ **주석을 먼저 지운다.** 켜는 날 이 스캐너가 `settings-primitives.tsx`
       * 를 위반으로 잡았는데, 그 자리는 **「종전엔 이랬다」고 설명하는 주석 안의
       * 인용문**이었다. 이주를 문서로 남긴 것이 그 이주의 위반으로 세인다면,
       * 다음 사람은 근거를 안 적는 쪽을 고르게 된다.
       *
       * 헬퍼는 정적 표면 census 와 **같은 것**을 쓴다 — 스캐너를 두 벌 만들면
       * 둘이 어긋나는 쪽이 기본값이 된다.
       */
      const src = stripComments(readFileSync(file, "utf8"));
      // 제네릭 인자(`useRovingRadioGroup<T>({…})`)를 건너뛴다 — 리터럴 매칭은
      // 타입 인자 하나에 조용히 죽는다.
      const hookCalls = [...src.matchAll(HOOK_CALL_RE_G)].length;
      if (hookCalls > 0) {
        hookFiles.add(rel);
        hookCallSites += hookCalls;
      }
      const hits = [...src.matchAll(ROLE_RE)];
      if (!hits.length) continue;
      found.set(rel, hits.length);
      for (const h of hits) {
        if (h[0].includes('"')) doubleQuoted += 1;
        else singleQuoted += 1;
      }
    }
  }
  return { found, hookFiles, hookCallSites, scanned, doubleQuoted, singleQuoted };
}

describe("radiogroup 행동 래칫 — role 이 약속한 키보드가 실재하는가", () => {
  const census = scan();
  const debt = new Map(DEBT);
  const registered = new Map(REGISTERED);

  it("탐지기가 공회전하지 않는다 — 훑은 파일이 충분하고 장부가 실재한다", () => {
    expect(census.scanned, "훑은 파일이 너무 적다 — 워커가 죽었다").toBeGreaterThan(300);
    for (const [file] of [...DEBT, ...REGISTERED]) {
      expect(statSync(path.join(ROOT, file)).isFile(), `${file} 이 실재하지 않는다`).toBe(true);
    }
    /*
     * 면제 둘의 **전제가 아직 참인지** 확인한다. 면제는 「이 파일은 세지
     * 않는다」인데, 그 근거는 「role 을 훅이 소유하고 프리미티브가 그것을
     * 입는다」이다. 그 구조가 깨지면 면제가 구멍이 된다.
     *
     * ⚠️ 프리미티브 본문에는 `radiogroup` 문자열이 **없다** — 있으면 오히려
     * 행동이 두 구현이 됐다는 신호다. role 은 훅의 `groupProps` 가 낸다.
     */
    const hook = stripComments(
      readFileSync(path.join(ROOT, "src/shared/lib/use-roving-radio-group.ts"), "utf8"),
    );
    expect(hook, "훅이 radiogroup role 을 잃었다 — 면제의 전제가 사라졌다").toContain("radiogroup");
    expect(hook, "훅이 roving tabindex 를 잃었다").toContain("tabIndex");
    expect(hook, "훅이 화살표 이동을 잃었다").toContain("ArrowRight");

    const primitive = stripComments(
      readFileSync(path.join(ROOT, "src/shared/ui/segmented-control.tsx"), "utf8"),
    );
    expect(
      HOOK_CALL_RE.test(primitive),
      "프리미티브가 훅을 안 쓴다 — 행동이 두 구현이 됐다",
    ).toBe(true);
    expect(primitive, "프리미티브가 훅의 groupProps 를 안 편다 — role 이 안 실린다").toContain(
      "groupProps",
    );
  });

  it("손으로 건 radiogroup 이 늘지 않는다 — 새 파일은 첫날부터 0", () => {
    const over: string[] = [];
    for (const [file, count] of census.found) {
      const allowed = registered.has(file) ? count : (debt.get(file) ?? 0);
      if (count > allowed) over.push(`${file}: ${count} > 허용 ${allowed}`);
    }
    expect(
      over,
      "`role=\"radiogroup\"` 을 손으로 걸지 마라 — `SegmentedControl`(variant well|chips)이 " +
        "그릇과 행동을 함께 준다. 그릇이 정말 다르면 `useRovingRadioGroup` 을 입고 " +
        "이 파일의 REGISTERED 에 근거와 함께 등재하라.",
    ).toEqual([]);
  });

  it("등재는 면제가 아니다 — 등재된 파일은 훅 호출이 실재해야 한다", () => {
    const fake: string[] = [];
    for (const [file] of REGISTERED) {
      if (!census.hookFiles.has(file)) fake.push(`${file}: 등재돼 있는데 ${HOOK} 호출이 없다`);
    }
    expect(fake, "이름만 적어 둔 등재는 세탁이다").toEqual([]);
  });

  it("행동 층 채택이 뒷걸음치지 않는다 — 훅 호출 자리 수의 바닥", () => {
    /*
     * 훅을 입은 자리는 `role` 리터럴을 잃어 위 스캔의 시야 밖이다. 그러면
     * 「채택을 조용히 걷어내는 것」을 볼 눈이 없어진다 — 이 바닥이 그 눈이다.
     * 늘리는 것은 자유이고 줄이면 빨개진다(래칫의 방향은 언제나 한쪽이다).
     */
    expect(
      census.hookCallSites,
      `${HOOK} 을 부르는 «자리» 가 줄었다 — 행동 층을 걷어낸 그룹이 있는지 보라.`,
    ).toBeGreaterThanOrEqual(HOOK_ADOPTION_FLOOR);
  });

  it("장부의 회수분은 내린다 — 실측보다 후한 장부는 래칫이 아니다", () => {
    const stale: string[] = [];
    for (const [file, allowed] of DEBT) {
      const actual = census.found.get(file) ?? 0;
      if (actual < allowed) stale.push(`${file}: 장부 ${allowed} > 실측 ${actual} — 내려라`);
    }
    expect(stale).toEqual([]);
  });

  it("표기 커버리지 — 따옴표 한 종류만 보고 있지 않다", () => {
    /*
     * 「공집합이 아니다」와 「전집합을 본다」는 다르다(2026-08-05 아이콘 래칫
     * 판례). 정규식이 두 표기를 실제로 매칭하는지 합성으로 증명한다 — 오늘
     * 저장소에 한 표기만 남아 있어도 다른 표기가 들어오면 잡혀야 한다.
     */
    const probe = `role="radiogroup" role='radiogroup' role={"radiogroup"}`;
    expect([...probe.matchAll(ROLE_RE)]).toHaveLength(3);
    // 주석 안의 인용은 안 센다 — 이주를 문서로 남긴 것이 위반이 되면 안 된다.
    const commented = stripComments(`/** 종전엔 role="radiogroup" 을 손으로 걸었다 */\nconst x = 1;`);
    expect([...commented.matchAll(ROLE_RE)]).toHaveLength(0);
    expect(census.doubleQuoted + census.singleQuoted).toBe(
      [...census.found.values()].reduce((a, b) => a + b, 0),
    );
  });
});
