import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The pre-push hook is a **fast, path-scoped mirror of CI** — this locks the four
 * properties that make it survivable, because losing any one of them is what
 * killed the previous version.
 *
 * ## The history this encodes
 *
 * The first hook ran `checks:changed --run` over the whole pushed range, serially.
 * On a 1,536-file branch that was **657 checks, 40 minutes for 35 of them** —
 * twelve hours against CI's eight minutes. It was deleted (ledger 94), then
 * restored in Buzz's shape (ledger 95) after finding that `block/buzz` — the
 * project this repository benchmarks against — does ship one, built from
 * glob-filtered parallel lanes with e2e left to CI.
 *
 * The predecessor of this file (`local-ci-parity.contract.test.ts`) had already
 * written the failure mode down: *"one route took over 10 minutes to open. At that
 * point a person switches the hook off. And the moment it is switched off, this
 * hook may as well not exist."* It was right, so what is pinned here is speed
 * structure, not command parity.
 */

const ROOT = process.cwd();
const HOOK_PATH = ".githooks/pre-push";
const hook = readFileSync(path.join(ROOT, HOOK_PATH), "utf8");

/** Executed lines only — the same word inside a comment must not satisfy a check. */
const executable = hook
  .split("\n")
  .filter((line) => !/^\s*#/.test(line))
  .join("\n");

describe("pre-push 훅 — 빠른 CI 거울", () => {
  it("훅이 있고 실행 가능하다", () => {
    expect(statSync(path.join(ROOT, HOOK_PATH)).mode & 0o111).toBeGreaterThan(0);
  });

  it("package.json 의 prepare 가 core.hooksPath 를 .githooks 로 건다", () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.prepare ?? "").toContain("core.hooksPath");
    expect(pkg.scripts?.prepare ?? "").toContain(".githooks");
  });

  it("레인은 병렬로 돈다 — 직렬이면 이 훅은 다시 12시간이 된다", () => {
    // A lane is backgrounded and then joined; both halves have to be present.
    expect(executable, "레인을 백그라운드로 띄우지 않는다").toMatch(/\)\s*&\s*$/m);
    expect(executable, "레인을 join 하지 않는다 — 결과를 못 본다").toMatch(/^\s*wait\s*$/m);
  });

  it("범위는 3점 diff 다 — main 을 머지해도 남의 변경이 레인을 켜지 않는다", () => {
    expect(executable).toMatch(/\$BASE_REF\.\.\.HEAD/);
    expect(executable, "기준선이 origin/main 이 아니다").toMatch(/BASE_REF="origin\/main"/);
  });

  /**
   * e2e is CI's, and its absence is the single biggest reason this hook is fast.
   * CI shards Playwright three ways; here it would be serial, and that is exactly
   * the shape that got the last hook deleted.
   */
  it("e2e 는 훅에 없다 — CI 가 3갈래로 나눠 본다", () => {
    expect(executable, "훅이 playwright 를 돌린다 — 그 순간 다시 느려진다").not.toMatch(
      /playwright/i,
    );
  });

  /**
   * Timing ratios cannot be measured on a machine this hook is deliberately
   * saturating. `duplicate-pairs.perf.test.ts` compares a fast path against a naive
   * one and reads the clock; under parallel lanes (~900% CPU measured) it went
   * red on a push whose diff could not have touched it, and passed on a rerun. CI
   * runs the same three files on a quiet runner, where the number means something.
   *
   * The exclusion is scoped to this lane. Removing it re-introduces a flake that
   * looks like a real failure, which is worse than no gate — people learn to retry.
   */
  it("성능 시험은 훅에서 뺀다 — 바쁜 기계에서 잰 비율은 뜻이 없다", () => {
    const unitLane = executable.split("\n").find((line) => /lane unit /.test(line)) ?? "";
    expect(unitLane, "unit 레인을 못 찾았다 — 이 시험이 헛돈다").not.toBe("");
    expect(unitLane, "훅이 성능 시험까지 돌린다 — 바쁜 기계에서 흔들린다").toContain(
      "--exclude",
    );
    expect(unitLane).toContain("perf.test");

    // CI must still run them; the exclusion is local-only.
    const ci = readFileSync(path.join(ROOT, ".github/workflows/checks.yml"), "utf8");
    expect(ci, "CI 가 성능 시험을 제외한다 — 그러면 아무도 안 재는 것이 된다").not.toContain(
      "perf.test",
    );
  });

  it("정확성 시험은 바쁜 로컬 훅에서 worker를 나누고 넉넉한 timeout을 쓴다", () => {
    // Four workers in each correctness lane still starved two ordinary React
    // state-transition tests past five seconds when eleven lanes ran together
    // (2026-08-28). Two is the measured local saturation boundary; CI keeps its
    // normal pool on a quiet runner below.
    const correctnessLanes = ["unit", "contract"].map((name) =>
      executable.split("\n").find((line) => new RegExp(`lane ${name} `).test(line)) ?? "",
    );

    for (const lane of correctnessLanes) {
      expect(lane, "unit/contract 레인을 못 찾았다 — 이 시험이 헛돈다").not.toBe("");
      expect(lane, "병렬 레인이 Vitest worker를 무제한으로 늘려 다른 정확성 시험을 굶긴다").toContain(
        "--maxWorkers=2",
      );
      expect(lane, "병렬 부하에서 기본 timeout이 정확성 시험을 오탐한다").toContain(
        "--testTimeout=30000",
      );
    }

    // CI stays authoritative and keeps the normal timeout on its quiet runner.
    const ci = readFileSync(path.join(ROOT, ".github/workflows/checks.yml"), "utf8");
    expect(ci).not.toContain("--testTimeout");
  });

  it("실패한 레인만 출력한다 — 여덟 개가 동시에 떠들면 아무도 안 읽는다", () => {
    expect(executable).toMatch(/failed/);
    expect(executable, "실패 로그를 보여주지 않는다").toMatch(/tail .*\.log/);
  });

  /**
   * A hook that runs nothing is indistinguishable from no hook. The repo-wide
   * scanners are unconditional for that reason, so every push runs at least these.
   */
  it("무조건 도는 레인이 있다 — 아무것도 안 도는 푸시가 없다", () => {
    for (const always of ["tests/contract/", "check-comment-refs.mjs", "decisions:check"]) {
      expect(executable, `무조건 도는 레인에 ${always} 가 없다`).toContain(always);
    }
  });

  /**
   * Every command a lane runs must exist as a script (or a real file). A typo here
   * fails at push time on someone else's machine, which is the worst place to find
   * it.
   */
  it("레인이 부르는 pnpm 스크립트가 전부 실재한다", () => {
    const scripts = Object.keys(
      (JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
        scripts?: Record<string, string>;
      }).scripts ?? {},
    );
    // The class must span the whole token, uppercase included. A narrower class
    // silently truncates a typo back into a valid name — `docs:surface:checkX`
    // matched as `docs:surface:check` and the probe passed (measured 2026-08-22).
    const named = [...executable.matchAll(/pnpm\s+([A-Za-z][A-Za-z0-9:_-]*)/g)]
      .map((m) => m[1])
      .filter((name) => name !== "exec");
    expect(named.length, "레인에서 pnpm 스크립트를 하나도 못 찾았다 — 이 시험이 헛돈다").toBeGreaterThan(3);
    expect(named.filter((n) => !scripts.includes(n))).toEqual([]);
  });

  /**
   * The lane picker is shell `grep -E` against the changed-file list. These cases
   * run the hook's own patterns so a mis-anchored regex is caught here rather than
   * by a lane silently never firing.
   */
  it("경로 글롭이 의도한 것만 켠다", () => {
    const patterns = {
      ts: /\.tsx?$|\.mjs$|tsconfig.*\.json$|next\.config\.ts$/,
      app: /^src\/|^app\//,
      docs: /^docs\/|^[A-Z0-9_-]+\.md$|^\.claude\/|^\.agents\//,
      mcpCli: /^mcp\/|^cli\//,
      messages: /^messages\/|^scripts\/validate-messages/,
    };
    /*
     * Each pattern must appear in the hook — otherwise this test measures its own
     * copy rather than the hook's behaviour. JS regex literals escape `/`, shell
     * `grep -E` does not, so compare with those escapes removed.
     */
    for (const source of Object.values(patterns)) {
      const asShell = source.source.replace(/\\\//g, "/");
      expect(executable, `훅에 없는 글롭을 시험하고 있다: ${asShell}`).toContain(asShell);
    }

    expect(patterns.app.test("src/views/home/ui/HomePage.tsx")).toBe(true);
    expect(patterns.app.test("docs/GLOSSARY.md")).toBe(false);
    expect(patterns.docs.test("docs/GLOSSARY.md")).toBe(true);
    expect(patterns.docs.test("AGENTS.md")).toBe(true);
    // A vault node is data, not documentation — but it does live under docs/, so
    // the docs lane covering it is correct and cheap.
    expect(patterns.docs.test("docs/ontology/ontology-atlas.md")).toBe(true);
    expect(patterns.docs.test("src/shared/ui/toast.tsx")).toBe(false);
    expect(patterns.mcpCli.test("mcp/src/index.js")).toBe(true);
    expect(patterns.mcpCli.test("src/mcp-thing.ts")).toBe(false);
    expect(patterns.messages.test("messages/ko.json")).toBe(true);
    expect(patterns.ts.test("next.config.ts")).toBe(true);
    expect(patterns.ts.test("README.md")).toBe(false);
  });

  /**
   * The hook is a shell script and a syntax error in it blocks every push in the
   * repository. `sh -n` parses without executing.
   */
  it("셸 문법이 유효하다 — 여기가 깨지면 아무도 푸시를 못 한다", () => {
    expect(() =>
      execFileSync("sh", ["-n", path.join(ROOT, HOOK_PATH)], { stdio: "pipe" }),
    ).not.toThrow();
  });
});

/**
 * The ledger numbers entries by hand, so two branches written the same day take
 * the same number and neither notices — measured 2026-08-22, when a hook decision
 * landed on `main` as a second `(94)` beside an unrelated one. A duplicate breaks
 * the ledger's own contract, which asks the next pass to cite a prior record by
 * number.
 */
describe("결정 원장 번호", () => {
  const LEDGER = "docs/DECISIONS.md";

  /*
   * The key is **date + number**, not the number alone: numbering restarts each
   * day, so `(2)` appears nine times across nine dates and every one is correct.
   * A first draft of this test keyed on the number and reported 20 "duplicates",
   * all of them legitimate — the gate would have been pure noise.
   */
  it("같은 날짜에 같은 번호를 두 번 쓰지 않는다", () => {
    const entries = [
      ...readFileSync(path.join(ROOT, LEDGER), "utf8").matchAll(
        /^## (\d{4}-\d{2}-\d{2}) \((\d+)\)/gm,
      ),
    ].map((m) => `${m[1]} (${m[2]})`);

    expect(entries.length, "원장에서 번호 붙은 기록을 하나도 못 찾았다 — 이 시험이 헛돈다").toBeGreaterThan(50);

    const seen = new Set<string>();
    const duplicated = [
      ...new Set(entries.filter((k) => (seen.has(k) ? true : (seen.add(k), false)))),
    ];

    /*
     * **A ratchet, not a zero** (measured 2026-08-22). Switching this on found
     * **eight** same-day collisions already in the ledger — 2026-08-14 alone has
     * four. They are not one author's slip: several branches written the same day
     * each took "the next number" against a `main` that did not yet have the other.
     *
     * Renumbering them now would rewrite records other entries already cite by
     * number, and the ledger's own contract is that history is appended, never
     * edited. So the existing eight stay and the count may only fall. What this
     * blocks is the **ninth**.
     */
    expect(
      duplicated.length,
      `같은 날 같은 번호를 쓴 기록이 늘었다 — 다음 패스가 선행 결정을 번호로 인용할 수 없다:\n${duplicated.join("\n")}`,
    ).toBeLessThanOrEqual(8);
    expect(
      duplicated.length,
      "겹침이 줄었다 — 상한 8 도 같이 내려라. 여유를 무료로 두지 않는다.",
    ).toBeGreaterThanOrEqual(8);
  });
});
