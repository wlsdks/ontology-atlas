import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..");
const ACTION_ROOTS = [".github/workflows", ".github/actions"];

function yamlFiles(directory: string): string[] {
  return readdirSync(join(ROOT, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return yamlFiles(path);
    return [".yml", ".yaml"].includes(extname(entry.name)) ? [path] : [];
  });
}

function actionReferences() {
  return ACTION_ROOTS.flatMap(yamlFiles).flatMap((path) => {
    const source = readFileSync(join(ROOT, path), "utf8");
    return [...source.matchAll(/^\s*(?:-\s+)?uses:\s*([^\s#]+)(?:\s+#.*)?$/gm)].map((match) => ({
      path: relative(ROOT, join(ROOT, path)),
      reference: match[1],
    }));
  });
}

describe("GitHub Actions 공급망 고정", () => {
  it("워크플로와 로컬 복합 액션의 모든 외부 Action을 전체 commit SHA로 고정한다", () => {
    const references = actionReferences();
    expect(references.length, "검사 대상이 비어 있으면 이 게이트는 아무것도 지키지 않는다").toBeGreaterThan(10);
    expect(
      references.some(
        ({ path, reference }) =>
          path === ".github/workflows/deploy-pages.yml" &&
          reference.startsWith("actions/upload-pages-artifact@"),
      ),
      "`- uses:` 목록형 줄을 놓치면 Pages 배포 Action 전체가 검사 밖으로 빠진다",
    ).toBe(true);
    expect(
      references.some(
        ({ path, reference }) =>
          path === ".github/actions/setup-playwright/action.yml" &&
          reference.startsWith("actions/cache@"),
      ),
      "워크플로만 읽으면 공용 복합 Action 안의 공급망 입력을 놓친다",
    ).toBe(true);

    const mutable = references.filter(({ reference }) => {
      if (reference.startsWith("./")) return false;
      if (reference.startsWith("docker://")) return !/@sha256:[a-f0-9]{64}$/.test(reference);
      return !/^[^\s/@]+\/[^\s@]+@[a-f0-9]{40}$/.test(reference);
    });

    expect(
      mutable,
      "태그와 브랜치는 같은 이름이 다른 코드를 가리킬 수 있다 — 전체 commit SHA를 쓰고 옆 주석에 사람이 읽을 버전을 남겨라",
    ).toEqual([]);
  });
});
