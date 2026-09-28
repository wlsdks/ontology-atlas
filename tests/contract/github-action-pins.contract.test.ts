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

  it("installs toolchains by exact release, never by a moving channel", () => {
    const files = ACTION_ROOTS.flatMap(yamlFiles).map((path) => ({ path, source: readFileSync(join(ROOT, path), "utf8") }));
    const floating = files.flatMap(({ path, source }) =>
      [...source.matchAll(/^\s+((?:[a-z]+-)*version|toolchain):\s*["']?(latest|canary|nightly)["']?\s*$/gm)].map(
        (match) => `${path}: ${match[1]}: ${match[2]}`,
      ),
    );
    const latestDownloads = files.filter(({ source }) => /\/releases\/latest\//.test(source)).map(({ path }) => path);
    expect([...floating, ...latestDownloads], "a moving channel ships whatever was newest that day").toEqual([]);

    const bunSteps = files.flatMap(({ path, source }) =>
      source.split(/(?=^\s+- (?:name|uses):)/m).filter((step) => step.includes("oven-sh/setup-bun@")).map((step) => ({ path, step })),
    );
    expect(bunSteps.length).toBeGreaterThanOrEqual(3);
    for (const { path, step } of bunSteps) {
      expect(step, `${path}: setup-bun must read .bun-version`).toMatch(/^\s+bun-version-file: \.bun-version$/m);
      expect(step, `${path}: an inline bun-version outranks the file`).not.toMatch(/^\s+bun-version:/m);
    }
    expect(readFileSync(join(ROOT, ".bun-version"), "utf8")).toMatch(/^\d+\.\d+\.\d+\n$/);
  });

  it("verifies the registry publisher's bytes before it receives the OIDC assertion", () => {
    const publish = readFileSync(join(ROOT, ".github/workflows/publish-mcp-registry.yml"), "utf8");
    expect(publish).toMatch(/MCP_PUBLISHER_VERSION: v\d+\.\d+\.\d+\n/);
    expect(publish).toMatch(/MCP_PUBLISHER_SHA256: [a-f0-9]{64}\n/);
    const install = publish.indexOf("sha256sum --check --strict");
    expect(install, "mcp-publisher runs without its SHA-256 being checked").toBeGreaterThan(0);
    expect(install).toBeLessThan(publish.indexOf("tar xzf mcp-publisher.tar.gz"));
    expect(install).toBeLessThan(publish.indexOf("./mcp-publisher login"));
  });
});
