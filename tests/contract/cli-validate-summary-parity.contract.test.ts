import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BROKEN_VAULT, HEALTHY_VAULT } from "../e2e/fixtures/broken-vault";

/**
 * Do `ontology-atlas validate`'s **human-readable line and machine-readable JSON
 * state the same numbers?**
 *
 * Why this contract exists (measured 2026-08-04): for a folder with 5 errors and 4
 * warnings, the final summary line read `9 files / 8 issues (error 5 · warning 3)`. All
 * three numbers were **file** counts (8 files with problems, 5 with errors, 3 with
 * warnings only), so one warning inside a file that also had errors **disappeared
 * entirely**. The same command's `--json` counted per issue and said 5/4. When two
 * outputs call one folder by different numbers, neither can be trusted.
 *
 * Expectations are not written by hand — they are **taken from the JSON and
 * compared against the text**. That way the contract follows a changed fixture, and
 * this gate does not pin sentences.
 */

const CLI = path.resolve(process.cwd(), "cli/src/index.mjs");
const roots: string[] = [];

function materialize(seed: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), "atlas-validate-"));
  roots.push(root);
  for (const [rel, body] of Object.entries(seed)) {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, body, "utf8");
  }
  return root;
}

function runValidate(root: string, json: boolean): string {
  const args = ["validate", `--vault=${root}`, ...(json ? ["--json"] : [])];
  try {
    return execFileSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
  } catch (error) {
    // A defective vault exits 1, which is correct — the output is what is needed, not
    // the exit code.
    const failure = error as { stdout?: string };
    if (typeof failure.stdout === "string") return failure.stdout;
    throw error;
  }
}

beforeAll(() => {
  materialize({});
});
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe("cli validate — 텍스트 요약과 --json 이 같은 수를 말한다", () => {
  it("결함 볼트에서 error/warning 이 **문제 수**로 일치한다", () => {
    const root = materialize(BROKEN_VAULT);

    const parsed = JSON.parse(runValidate(root, true)) as {
      problems: Array<{ issues: Array<{ severity: string }> }>;
    };
    const issues = parsed.problems.flatMap((problem) => problem.issues);
    const errors = issues.filter((issue) => issue.severity === "error").length;
    const warnings = issues.length - errors;

    // The detector must not idle on an empty set — there must really be something to
    // count.
    expect(errors).toBeGreaterThan(0);
    expect(warnings).toBeGreaterThan(0);
    // And at least one of those warnings must be **inside a file that also has
    // errors**. Without that condition, per-file and per-issue aggregation can
    // coincide and the contract passes the old defect unchanged.
    expect(
      parsed.problems.some(
        (problem) =>
          problem.issues.some((issue) => issue.severity === "error") &&
          problem.issues.some((issue) => issue.severity !== "error"),
      ),
      "픽스처가 이 계약의 사각지대를 재현하지 못한다",
    ).toBe(true);

    const text = runValidate(root, false)
      // Strip ANSI colour — only the numbers matter.
      .replace(/\[[0-9;]*m/g, "");
    const summary = text.trim().split("\n").at(-1) ?? "";
    expect(summary).toContain(`error ${errors}`);
    expect(summary).toContain(`warning ${warnings}`);
    expect(summary).toContain(`${issues.length} issues`);
  });

  it("정상 볼트는 clean 이라고 말한다 (항상-빨강 아님)", () => {
    const root = materialize(HEALTHY_VAULT);
    const parsed = JSON.parse(runValidate(root, true)) as { problems: unknown[] };
    expect(parsed.problems).toEqual([]);
  });
});
