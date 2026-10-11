import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { stripComments } from "../../scripts/lib/static-surface-census.mjs";

/**
 * Radiogroup behaviour ratchet: a hand-wired `role="radiogroup"` passes only if the same file calls
 * `useRovingRadioGroup`, the single implementation of arrow-key behaviour. Lint cannot find a missing
 * class and axe runs static DOM rules only. Registering a file without wiring the hook fails.
 */

const ROOT = process.cwd();

/** The single implementation of the behaviour. This file and the primitive are not counted. */
const HOOK = "useRovingRadioGroup";
const EXEMPT_FILES = new Set([
  "src/shared/lib/keyboard/use-roving-radio-group.ts",
  "src/shared/ui/segmented-control.tsx",
]);

/**
 * **Registered** — places that wear the hook directly because their container does
 * not converge onto either of the primitive's two canonical forms. Not an exemption
 * but **a record that "this container cannot be made from a variant"**.
 *
 * ⚠️ **Wearing the hook removes a place from this scanner's view** — the role comes
 * from the hook's `groupProps`, so no `role="radiogroup"` literal remains in the
 * file. That is correct by design (there is no hand-written role left to polish).
 * So this list is **a record, not enforcement**, and `HOOK_ADOPTION_FLOOR` below is
 * what stops adoption being quietly rolled back.
 */
const REGISTERED: ReadonlyArray<readonly [file: string, why: string]> = [
  ["src/widgets/app-settings-menu/ui/AppearancePickers.tsx", "격자 미리보기 타일 — shape:'tile' + 부모/자식으로 갈린 활성 잉크"],
  ["src/widgets/topology-index-panel/ui/TopologyIndexPanel.tsx", "패널 스코프 잉크 + 크롬 반경 + 소유자가 두 번 고쳐 확정한 48px 균일폭"],
  ["src/widgets/project-drawer/ui/ProjectDrawer.tsx", "shape:'pill' + 대문자 mono caption — 값 층 칩 램프의 조합이 아니다"],
  ["src/widgets/atlas-git-panel/ui/CommitDetail.tsx", "tone:'secondary' + 「눌린 칩의 인디고를 덮지 마라」 조건부 보더"],
  ["src/views/docs-vault/ui/parts/DocsSidebarBody.tsx", "bg-canvas 우물 · Chip 아이템 · Tooltip 래퍼 · 켜진 칩만 라벨"],
  /*
   * Hover ink is hand-written per place, not an axis in the value layer, so migrating these would
   * remove hover feedback on inactive items.
   */
  ["src/features/ontology-blocks/ui/BlockImportModule.tsx", "p-1/gap-1 인셋 + 비활성 세그먼트 hover"],
  ["src/features/first-run-starter/ui/FirstRunStarterModule.tsx", "패널 스코프 hover 잉크"],
];

/**
 * **The floor on the number of hook call *sites*.** Since the registration above
 * is not enforcement, this number locks the direction instead — a drop means
 * somebody removed the behaviour layer (raising it is free).
 *
 * ⚠️ **Sites are counted, not files.** Counting files first left a hole a probe
 * caught: `AppearancePickers` has two groups, so **removing the wiring from one
 * still leaves the file calling the hook** and it stayed green. Wherever the
 * ratchet's unit is coarser than the defect's unit, that much goes unseen.
 *
 * Today it is **10 sites across 9 registered files** (only `AppearancePickers` has
 * two groups). The primitive's own file is on the exemption list and does not count
 * here; whether the primitive uses the hook is asserted separately by the idling
 * guard — locked in two places.
 */
const HOOK_ADOPTION_FLOOR = 10;

/**
 * Debt ledger: hand-written radiogroups with neither migration nor the hook. It cannot grow; repaying
 * one deletes its row.
 */
const DEBT: ReadonlyArray<readonly [file: string, count: number]> = [
  /*
   * Empty: no hand-wired radiogroups remain outside the primitive. What remains is container
   * convergence, a design task rather than a defect.
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
 * Counts `role="radiogroup"` per file, matching both quote variants so a single-quote-only match
 * cannot hide most of the repository.
 */
const ROLE_RE = /role=\{?["']radiogroup["']\}?/g;

const HOOK_CALL_RE = new RegExp(`${HOOK}\\s*(?:<[^>]*>)?\\s*\\(`);
/** The global version of the same pattern — counts **sites** within a file. */
const HOOK_CALL_RE_G = new RegExp(`${HOOK}\\s*(?:<[^>]*>)?\\s*\\(`, "g");

function scan() {
  const found = new Map<string, number>();
  /** **Every** file that calls the hook — counted regardless of any role literal. */
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
       * Comments are stripped first, using the same helper as the static surface inventory, so a quotation
       * in a comment is not a violation and the two scanners cannot drift.
       */
      const src = stripComments(readFileSync(file, "utf8"));
      // Skip generic arguments (`useRovingRadioGroup<T>({…})`) — literal matching dies
      // silently on a single type argument.
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
     * Checks that **the premise of the two exemptions is still true**. The exemption
     * says "this file is not counted", and its evidence is "the hook owns the role and
     * the primitive wears it". If that structure breaks, the exemption becomes a hole.
     *
     * ⚠️ The primitive's body contains **no** `radiogroup` string — if it did, that
     * would signal the behaviour had grown a second implementation. The role is emitted
     * by the hook's `groupProps`.
     */
    const hook = stripComments(
      readFileSync(path.join(ROOT, "src/shared/lib/keyboard/use-roving-radio-group.ts"), "utf8"),
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
      "Do not set `role=\"radiogroup\"` by hand: `SegmentedControl` (variant well|chips) " +
        "supplies the container and the behaviour together. If the container really differs, wear `useRovingRadioGroup` and " +
        "register it in this file's REGISTERED with the reason.",
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
     * A place wearing the hook loses its `role` literal and leaves the scan above's
     * view, which removes any eye on "adoption being quietly rolled back" — this floor
     * is that eye. Raising it is free; lowering it turns red (a ratchet always runs one
     * way).
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
     * Proves synthetically that the regex matches every notation even if only one exists today, since
     * a non-empty set is not the same as seeing the whole set.
     */
    const probe = `role="radiogroup" role='radiogroup' role={"radiogroup"}`;
    expect([...probe.matchAll(ROLE_RE)]).toHaveLength(3);
    // Quotations inside comments are not counted — documenting a migration must not become a violation.
    const commented = stripComments(`/** 종전엔 role="radiogroup" 을 손으로 걸었다 */\nconst x = 1;`);
    expect([...commented.matchAll(ROLE_RE)]).toHaveLength(0);
    expect(census.doubleQuoted + census.singleQuoted).toBe(
      [...census.found.values()].reduce((a, b) => a + b, 0),
    );
  });
});
