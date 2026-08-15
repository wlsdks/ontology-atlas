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
 * 자리. 면제가 아니라 **「이 그릇은 변형으로 못 만든다」는 기록**이고, 각 줄은
 * 왜 그런지를 진다. 만들 수 있게 되면 줄을 지우고 이주한다.
 *
 * 오늘은 **비어 있다** — 이번 라운드가 이주시킨 것은 `Choice`(7 콜사이트가
 * 어댑터 하나로 접힌다) 뿐이고, 나머지 자리들은 아직 손 role 을 지고 있어
 * 아래 `DEBT` 에 있다.
 */
const REGISTERED: ReadonlyArray<readonly [file: string, why: string]> = [];

/**
 * **부채 장부** — 아직 이주도 훅 착용도 안 한 손 radiogroup. 늘 수 없고, 갚으면
 * 줄을 지운다. 각 줄의 처분은 「체계」석 판정(docs/DECISIONS.md 2026-08-15 (8))
 * 에 있다.
 */
const DEBT: ReadonlyArray<readonly [file: string, count: number]> = [
  ["src/features/ontology-blocks/ui/BlockImportModule.tsx", 1],
  ["src/widgets/app-settings-menu/ui/AppearancePickers.tsx", 2],
  ["src/widgets/topology-index-panel/ui/TopologyIndexPanel.tsx", 1],
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

function scan() {
  const found = new Map<string, number>();
  const withHook = new Set<string>();
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
      const hits = [...src.matchAll(ROLE_RE)];
      if (!hits.length) continue;
      found.set(rel, hits.length);
      for (const h of hits) {
        if (h[0].includes('"')) doubleQuoted += 1;
        else singleQuoted += 1;
      }
      // 제네릭 인자(`useRovingRadioGroup<T>({…})`)를 건너뛴다 — 리터럴 매칭은
      // 타입 인자 하나에 조용히 죽는다.
      if (new RegExp(`${HOOK}\\s*(?:<[^>]*>)?\\s*\\(`).test(src)) withHook.add(rel);
    }
  }
  return { found, withHook, scanned, doubleQuoted, singleQuoted };
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
      new RegExp(`${HOOK}\\s*(?:<[^>]*>)?\\s*\\(`).test(primitive),
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
      if (!census.withHook.has(file)) fake.push(`${file}: 등재돼 있는데 ${HOOK} 호출이 없다`);
    }
    expect(fake, "이름만 적어 둔 등재는 세탁이다").toEqual([]);
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
