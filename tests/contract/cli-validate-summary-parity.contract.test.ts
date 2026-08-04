import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BROKEN_VAULT, HEALTHY_VAULT } from "../e2e/fixtures/broken-vault";

/**
 * `ontology-atlas validate` 의 **사람이 읽는 줄과 기계가 읽는 JSON 이 같은 수를
 * 말하는가**.
 *
 * 왜 이 계약이 생겼나 (2026-08-04 실측): 오류 5 · 경고 4 짜리 폴더에서 마지막
 * 요약 줄이 `9 파일 / 8 문제 (error 5 · warning 3)` 였다. 세 수가 전부 **파일**
 * 수였고(문제가 있는 파일 8, 오류 있는 파일 5, 경고만 있는 파일 3), 그래서
 * 오류가 있는 파일 안의 경고 하나가 **통째로 사라졌다**. 같은 명령의 `--json`
 * 은 issue 단위로 세어 5/4 였다. 한 폴더를 두 출력이 다른 수로 부르면 둘 다 못
 * 믿는다.
 *
 * 기댓값을 손으로 적지 않는다 — **JSON 에서 뽑아 텍스트와 대조**한다. 그래야
 * 픽스처가 바뀌어도 계약이 따라오고, 이 게이트가 문장을 못박지 않는다.
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
    // 결함 볼트는 exit 1 이 정상이다 — 출력이 필요한 것이지 종료 코드가 아니다.
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

    // 탐지기가 빈 집합 위에서 놀지 않는다 — 셀 것이 실제로 있어야 한다.
    expect(errors).toBeGreaterThan(0);
    expect(warnings).toBeGreaterThan(0);
    // 그리고 그 경고 중 적어도 하나는 **오류가 있는 파일 안에** 있어야 한다.
    // 이 조건이 없으면 파일 단위 집계와 문제 단위 집계가 우연히 같아져,
    // 계약이 옛 결함을 그대로 통과시킨다.
    expect(
      parsed.problems.some(
        (problem) =>
          problem.issues.some((issue) => issue.severity === "error") &&
          problem.issues.some((issue) => issue.severity !== "error"),
      ),
      "픽스처가 이 계약의 사각지대를 재현하지 못한다",
    ).toBe(true);

    const text = runValidate(root, false)
      // ANSI 색상 제거 — 숫자만 본다.
      .replace(/\[[0-9;]*m/g, "");
    const summary = text.trim().split("\n").at(-1) ?? "";
    expect(summary).toContain(`error ${errors}`);
    expect(summary).toContain(`warning ${warnings}`);
    expect(summary).toContain(`${issues.length} 문제`);
  });

  it("정상 볼트는 clean 이라고 말한다 (항상-빨강 아님)", () => {
    const root = materialize(HEALTHY_VAULT);
    const parsed = JSON.parse(runValidate(root, true)) as { problems: unknown[] };
    expect(parsed.problems).toEqual([]);
  });
});
