import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { judgeRatchet, RAISES_DIR, raiseProblems, readRaises } from "./lib/ratchet-base";

/**
 * The merge-base judge that the converted ratchets share (`lib/ratchet-base.ts`).
 *
 * Each ratchet proves its own census; this file proves the judgement around it on a
 * throwaway repository, because the cases that matter (a raise already landed, two
 * branches improving at once, no history at all) cannot be arranged in this checkout.
 */

const scratch = mkdtempSync(join(tmpdir(), "ratchet-judge-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function git(repo: string, ...args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "user.name=probe", "-c", "user.email=probe@example.invalid", "-c", "commit.gpgsign=false", ...args],
    { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

/** A repository whose metric is the number of lines in `src/debt.txt`. */
function repo(name: string, debt: number): string {
  const dir = join(scratch, name);
  mkdirSync(join(dir, "src"), { recursive: true });
  git(dir, "init", "-q", "-b", "main");
  writeDebt(dir, "debt.txt", debt);
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "base");
  return dir;
}

function writeDebt(dir: string, file: string, n: number): void {
  writeFileSync(join(dir, "src", file), Array.from({ length: n }, (_, i) => `item ${i}\n`).join(""));
}

const lines = (root: string) =>
  readdirSync(join(root, "src")).reduce(
    (sum, f) => sum + readFileSync(join(root, "src", f), "utf8").split("\n").filter(Boolean).length,
    0,
  );

function judge(dir: string, base: string | null, fallback = 100) {
  return judgeRatchet({ gate: "probe-debt", measure: lines, reads: ["src"], fallback, cwd: dir, base });
}

function writeRaise(dir: string, slug: string, raise: number): void {
  mkdirSync(join(dir, RAISES_DIR), { recursive: true });
  writeFileSync(
    join(dir, RAISES_DIR, `probe-debt.${slug}.json`),
    JSON.stringify({ gate: "probe-debt", raise, why: "A probe raise that states a full sentence of reason." }),
  );
}

describe("ratchet judged against the merge base", () => {
  it("fails growth over the base and passes a fall with no file edited", () => {
    const dir = repo("grow", 5);
    const base = git(dir, "rev-parse", "HEAD");

    writeDebt(dir, "debt.txt", 6);
    const grown = judge(dir, base);
    expect(grown.atBase).toBe(5);
    expect(grown.current).toBeGreaterThan(grown.ceiling);

    writeDebt(dir, "debt.txt", 3);
    const fallen = judge(dir, base);
    expect(fallen.current).toBeLessThanOrEqual(fallen.ceiling);
  });

  it("widens only by the raise records this change adds", () => {
    const dir = repo("raise", 5);
    writeRaise(dir, "landed", 1);
    git(dir, "add", ".");
    git(dir, "commit", "-q", "-m", "an earlier raise");
    const base = git(dir, "rev-parse", "HEAD");

    writeDebt(dir, "debt.txt", 6);
    expect(judge(dir, base).ceiling, "a raise already at the base must not widen a later change").toBe(5);

    writeRaise(dir, "this-change", 1);
    const raised = judge(dir, base);
    expect(raised.added.map((r) => r.file)).toEqual([`${RAISES_DIR}/probe-debt.this-change.json`]);
    expect(raised.current).toBeLessThanOrEqual(raised.ceiling);
  });

  it("lets two branches that each lower the metric merge without a conflict", () => {
    const dir = repo("parallel", 0);
    writeDebt(dir, "a.txt", 4);
    writeDebt(dir, "b.txt", 4);
    git(dir, "add", ".");
    git(dir, "commit", "-q", "-m", "two debts");
    const base = git(dir, "rev-parse", "HEAD");

    git(dir, "switch", "-q", "-c", "lower-a");
    writeDebt(dir, "a.txt", 2);
    expect(judge(dir, base).current).toBeLessThanOrEqual(judge(dir, base).ceiling);
    git(dir, "commit", "-q", "-am", "lower a");

    git(dir, "switch", "-q", "-c", "lower-b", base);
    writeDebt(dir, "b.txt", 1);
    expect(judge(dir, base).current).toBeLessThanOrEqual(judge(dir, base).ceiling);
    git(dir, "commit", "-q", "-am", "lower b");

    git(dir, "switch", "-q", "main");
    git(dir, "merge", "-q", "--no-edit", "lower-a");
    git(dir, "merge", "-q", "--no-edit", "lower-b");
    expect(lines(dir)).toBe(3);
    const merged = judge(dir, base);
    expect(merged.current).toBeLessThanOrEqual(merged.ceiling);
  });

  it("falls back to the absolute ceiling plus every raise when there is no base", () => {
    const dir = repo("shallow", 5);
    writeRaise(dir, "landed", 2);
    writeDebt(dir, "debt.txt", 12);
    const verdict = judge(dir, null, 10);
    expect(verdict.atBase).toBeNull();
    expect(verdict.ceiling).toBe(12);
    writeDebt(dir, "debt.txt", 13);
    expect(judge(dir, null, 10).current).toBeGreaterThan(judge(dir, null, 10).ceiling);
  });

  it("keeps the absolute ceiling as a floor when a tree is compared with itself", () => {
    const dir = repo("self", 12);
    const head = git(dir, "rev-parse", "HEAD");
    const verdict = judge(dir, head, 10);
    expect(verdict.atBase).toBe(12);
    expect(verdict.current, "a push to main compares main with itself; the floor still holds").toBeGreaterThan(
      verdict.ceiling,
    );
  });
});

describe("raise records", () => {
  it("refuses a record without a reason, a positive integer, or a matching file name", () => {
    expect(raiseProblems("x.a.json", { gate: "x", raise: 1, why: "too short" })).toHaveLength(1);
    expect(raiseProblems("x.a.json", { gate: "x", raise: 0, why: "a".repeat(40) })).toHaveLength(1);
    expect(raiseProblems("y.a.json", { gate: "x", raise: 1, why: "a".repeat(40) })).toHaveLength(1);
    expect(raiseProblems("x.a.json", { gate: "x", raise: 2, why: "a".repeat(40) })).toEqual([]);
  });

  it("every record in this repository is valid and names a gate that reads it", () => {
    const gates = new Set(
      readdirSync("tests/contract")
        .filter((f) => f.endsWith(".contract.test.ts") && f !== "ratchet-merge-base.contract.test.ts")
        .flatMap((f) => [
          ...readFileSync(join("tests/contract", f), "utf8").matchAll(/judgeRatchet\(\{\s*gate:\s*["']([a-z-]+)["']/g),
        ])
        .map((m) => m[1]),
    );
    expect(gates.size, "no converted ratchet found; the gate-name check would pass vacuously").toBeGreaterThanOrEqual(4);
    for (const record of readRaises()) {
      expect(gates.has(record.gate), `${record.file} names a gate no ratchet reads`).toBe(true);
    }
  });
});
