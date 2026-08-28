import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The sidecar must be built **before the first cargo call**.
 *
 * Once `src-tauri/tauri.conf.json` declares the MCP binary as an `externalBin`,
 * **every cargo call** requires that file, not just the bundle step — the Tauri
 * build script checks the resource path exists and dies with
 * `resource path ... doesn't exist` when it does not.
 *
 * On 2026-07-28 `v1.0.0-rc.2` stopped exactly here. The sidecar was built only
 * inside `desktop:build:app`, but the workflow runs `cargo test`
 * (= `test:desktop:bridge`) before that. Both architectures failed and staging and
 * publishing were skipped.
 *
 * It does not show up locally — once a person has built the file it stays, and
 * every later cargo call passes. **A defect visible only on a clean checkout**, so
 * the workflow order is pinned as a contract.
 */

const WORKFLOW_PATH = join(process.cwd(), ".github/workflows/release-macos.yml");
const TAURI_CONF_PATH = join(process.cwd(), "src-tauri/tauri.conf.json");
const PACKAGE_PATH = join(process.cwd(), "package.json");

/**
 * The **executed lines** that run cargo, directly or through a pnpm script.
 *
 * Only what `run:` actually executes, never comments — the first version searched
 * for `"cargo "` anywhere and caught an explanatory comment written on the step
 * just above, turning the contract red against itself. A gate that searches for
 * strings reads its own documentation too.
 */
const CARGO_RUN_LINES = [/^\s*run:\s*pnpm test:desktop:bridge\b/m, /^\s*run:.*\bcargo\s/m] as const;

const SIDECAR_STEP = "pnpm mcp:build-binary";

describe("release workflow — 사이드카 순서 (v1.0.0-rc.2 회귀)", () => {
  const workflow = readFileSync(WORKFLOW_PATH, "utf8");
  const pkg = JSON.parse(readFileSync(PACKAGE_PATH, "utf8")) as {
    scripts?: Record<string, string>;
  };

  it("tauri.conf.json 이 여전히 externalBin 으로 사이드카를 선언한다", () => {
    const conf = JSON.parse(readFileSync(TAURI_CONF_PATH, "utf8")) as {
      bundle?: { externalBin?: string[] };
    };
    // If this declaration disappears, the ordering contract below loses its premise —
    // deleting this file is then the right move, and this assertion says so first.
    expect(conf.bundle?.externalBin ?? []).toContain("binaries/ontology-atlas-mcp");
  });

  it("사이드카 빌드 단계가 존재한다", () => {
    expect(workflow).toContain(SIDECAR_STEP);
  });

  /**
   * The compiler that builds the sidecar (`bun build --compile`) is not on the runner
   * by default. When bundling was introduced (#732) the install step did not come
   * with it, and `v1.0.0-rc.2` stopped here once more — **right after** the ordering
   * was fixed.
   *
   * Locking the order alone cannot catch "called first, but the tool to call is
   * missing".
   */
  it("bun 설치가 사이드카 빌드보다 앞선다", () => {
    const bunAt = workflow.indexOf("oven-sh/setup-bun");
    expect(bunAt, "사이드카를 굽는 bun 설치 단계가 없다").toBeGreaterThan(-1);
    expect(bunAt).toBeLessThan(workflow.indexOf(SIDECAR_STEP));
  });

  /**
   * `mcp/` is not a pnpm workspace member; it uses its own `node_modules`, which the
   * root `pnpm install` does not populate. A person's machine still has an old
   * install, so local compilation passes and only the runner fails to find
   * `@modelcontextprotocol/sdk`.
   *
   * Even with the tool (bun) and the order both locked, an empty **dependency tree
   * for the compilation target** stops it at the same place. All three conditions
   * must be locked for this step to actually pass.
   */
  it("bundled MCP 의존 설치가 사이드카 빌드보다 앞선다", () => {
    const depsAt = workflow.indexOf("pnpm --dir mcp install");
    expect(depsAt, "번들 MCP 서버 의존 설치 단계가 없다").toBeGreaterThan(-1);
    expect(depsAt).toBeLessThan(workflow.indexOf(SIDECAR_STEP));
  });

  it("사이드카 빌드가 cargo 를 돌리는 모든 단계보다 앞선다", () => {
    const sidecarAt = workflow.indexOf(SIDECAR_STEP);
    expect(sidecarAt).toBeGreaterThan(-1);

    for (const pattern of CARGO_RUN_LINES) {
      const global = new RegExp(pattern.source, "gm");
      for (const match of workflow.matchAll(global)) {
        expect(
          match.index,
          `"${match[0].trim()}" 가 사이드카 빌드보다 먼저 나온다 — 깨끗한 ` +
            `체크아웃에서 resource path 가 없어 cargo 가 죽는다`,
        ).toBeGreaterThan(sidecarAt);
      }
    }
  });

  it("로컬 release preflight도 bridge cargo 호출 전에 사이드카를 굽는다", () => {
    const commands = pkg.scripts?.["desktop:release-preflight"]?.split(" && ") ?? [];
    const sidecarAt = commands.indexOf("pnpm mcp:build-binary");
    const bridgeAt = commands.indexOf("pnpm test:desktop:bridge");

    expect(commands.length, "desktop:release-preflight가 비어 있다").toBeGreaterThan(0);
    expect(bridgeAt, "desktop:release-preflight가 native bridge tests를 실행하지 않는다").toBeGreaterThan(-1);
    expect(
      sidecarAt,
      "desktop:release-preflight가 externalBin sidecar를 만들지 않는다 — 깨끗한 체크아웃에서 cargo가 resource path 오류로 죽는다",
    ).toBeGreaterThan(-1);
    expect(
      sidecarAt,
      "desktop:release-preflight가 bridge cargo 호출 뒤에 sidecar를 만든다",
    ).toBeLessThan(bridgeAt);
  });

  it("desktop preflight는 출하 불변식만 막고 source dogfood는 별도 gate로 둔다", () => {
    const desktopCommands = pkg.scripts?.["desktop:release-preflight"]?.split(" && ") ?? [];
    const dogfoodCommands = pkg.scripts?.["dogfood:release-gate"]?.split(" && ") ?? [];

    expect(desktopCommands.length, "desktop:release-preflight가 비어 있다").toBeGreaterThan(0);
    expect(dogfoodCommands.length, "dogfood:release-gate가 비어 있다").toBeGreaterThan(0);
    expect(desktopCommands).toContain("pnpm vault:validate");
    expect(desktopCommands).not.toContain("pnpm cli:mcp-verify docs/ontology --timeout-ms 90000");
    expect(desktopCommands.some((command) => command.startsWith("pnpm dogfood:"))).toBe(false);
    expect(dogfoodCommands).toContain("pnpm dogfood:verify");
    expect(dogfoodCommands).toContain("OATLAS_DOGFOOD_TIMEOUT_MS=90000 pnpm dogfood:walk");
    expect(dogfoodCommands).toContain("pnpm dogfood:agent-setup-gate");
    expect(dogfoodCommands).toContain("pnpm test:mcp:dogfood");
  });
});
