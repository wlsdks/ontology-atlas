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
 * The test jobs run `cargo test` (= `test:desktop:bridge`) and the build jobs run
 * `tauri build`, each on its own clean runner, so every such job builds the sidecar
 * itself before its first cargo call.
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

/** `cargo audit --file` reads the lockfile alone and never runs the build script. */
const LOCKFILE_ONLY_CARGO = /\bcargo audit --file\b/;

const SIDECAR_STEP = "pnpm mcp:build-binary";

/** Package scripts that bake the sidecar themselves before they call cargo. */
const SELF_BAKING_BUILDS = ["desktop:build:app:prebuilt", "desktop:build:windows"] as const;

function jobBlocks(workflow: string): { name: string; block: string }[] {
  const jobs = workflow.slice(workflow.indexOf("\njobs:\n") + 1);
  return jobs
    .split(/^(?= {2}[A-Za-z][\w-]*:\s*$)/m)
    .map((block) => ({ name: /^ {2}([A-Za-z][\w-]*):/.exec(block)?.[1] ?? "", block }))
    .filter((job) => job.name !== "");
}

describe("release workflow — the sidecar is built before the first cargo call", () => {
  const workflow = readFileSync(WORKFLOW_PATH, "utf8");
  const pkg = JSON.parse(readFileSync(PACKAGE_PATH, "utf8")) as {
    scripts?: Record<string, string>;
  };

  it("tauri.conf.json still declares the sidecar through externalBin", () => {
    const conf = JSON.parse(readFileSync(TAURI_CONF_PATH, "utf8")) as {
      bundle?: { externalBin?: string[] };
    };
    // If this declaration disappears, the ordering contract below loses its premise —
    // deleting this file is then the right move, and this assertion says so first.
    expect(conf.bundle?.externalBin ?? []).toContain("binaries/ontology-atlas-mcp");
  });

  it("the sidecar build step exists", () => {
    expect(workflow).toContain(SIDECAR_STEP);
  });

  /**
   * The compiler that builds the sidecar (`bun build --compile`) is not on the runner
   * by default, so its install step must precede the sidecar build.
   *
   * Locking the order alone cannot catch "called first, but the tool to call is
   * missing".
   */
  it("the bun install comes before the sidecar build", () => {
    const bunAt = workflow.indexOf("oven-sh/setup-bun");
    expect(bunAt, "there is no bun install step that bakes the sidecar").toBeGreaterThan(-1);
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
  it("the bundled MCP dependency install comes before the sidecar build", () => {
    const depsAt = workflow.indexOf("pnpm --dir mcp install");
    expect(depsAt, "there is no install step for the bundled MCP server dependencies").toBeGreaterThan(-1);
    expect(depsAt).toBeLessThan(workflow.indexOf(SIDECAR_STEP));
  });

  it("every job builds the sidecar before its own first cargo call", () => {
    const cargoJobs: string[] = [];
    for (const { name, block } of jobBlocks(workflow)) {
      const sidecarAt = block.indexOf(SIDECAR_STEP);
      for (const pattern of CARGO_RUN_LINES) {
        for (const match of block.matchAll(new RegExp(pattern.source, "gm"))) {
          const line = block.slice(match.index, block.indexOf("\n", match.index));
          if (LOCKFILE_ONLY_CARGO.test(line)) continue;
          cargoJobs.push(name);
          expect(sidecarAt, `${name} runs "${line.trim()}" on a runner that never built the sidecar`).toBeGreaterThan(-1);
          expect(
            match.index,
            `${name}: "${match[0].trim()}" comes before the sidecar build: in a clean ` +
              `checkout the resource path is missing and cargo dies`,
          ).toBeGreaterThan(sidecarAt);
        }
      }
    }
    expect(new Set(cargoJobs)).toEqual(new Set(["test-macos", "test-windows"]));
  });

  it("each build script bakes the sidecar itself before tauri build", () => {
    for (const script of SELF_BAKING_BUILDS) {
      const commands = pkg.scripts?.[script]?.split(" && ") ?? [];
      const sidecarAt = commands.indexOf(SIDECAR_STEP);
      const tauriAt = commands.findIndex((command) => command.startsWith("pnpm tauri build"));
      expect(tauriAt, `${script} does not run tauri build`).toBeGreaterThan(-1);
      expect(sidecarAt, `${script} does not build the sidecar`).toBeGreaterThan(-1);
      expect(sidecarAt).toBeLessThan(tauriAt);
    }
    const artifact = readFileSync(join(process.cwd(), "scripts/desktop-release/build-macos-release-artifact.mjs"), "utf8");
    expect(artifact).toContain('args: ["desktop:build:app:prebuilt"]');
    expect(workflow).toContain("run: pnpm desktop:build:windows");
  });

  it("the local release preflight also bakes the sidecar before the bridge cargo call", () => {
    const commands = pkg.scripts?.["desktop:release-preflight"]?.split(" && ") ?? [];
    const sidecarAt = commands.indexOf("pnpm mcp:build-binary");
    const bridgeAt = commands.indexOf("pnpm test:desktop:bridge");

    expect(commands.length, "desktop:release-preflight is empty").toBeGreaterThan(0);
    expect(bridgeAt, "desktop:release-preflight does not run the native bridge tests").toBeGreaterThan(-1);
    expect(
      sidecarAt,
      "desktop:release-preflight does not build the externalBin sidecar, so cargo dies with a resource path error on a clean checkout",
    ).toBeGreaterThan(-1);
    expect(
      sidecarAt,
      "desktop:release-preflight builds the sidecar after the bridge cargo call",
    ).toBeLessThan(bridgeAt);
  });

  it("the desktop preflight blocks only shipping invariants and leaves source dogfood to a separate gate", () => {
    const desktopCommands = pkg.scripts?.["desktop:release-preflight"]?.split(" && ") ?? [];
    const dogfoodCommands = pkg.scripts?.["dogfood:release-gate"]?.split(" && ") ?? [];

    expect(desktopCommands.length, "desktop:release-preflight is empty").toBeGreaterThan(0);
    expect(dogfoodCommands.length, "dogfood:release-gate is empty").toBeGreaterThan(0);
    expect(desktopCommands).toContain("pnpm vault:validate");
    expect(desktopCommands).not.toContain("pnpm cli:mcp-verify docs/ontology --timeout-ms 90000");
    expect(desktopCommands.some((command) => command.startsWith("pnpm dogfood:"))).toBe(false);
    expect(dogfoodCommands).toContain("pnpm dogfood:verify");
    expect(dogfoodCommands).toContain("OATLAS_DOGFOOD_TIMEOUT_MS=90000 pnpm dogfood:walk");
    expect(dogfoodCommands).toContain("pnpm dogfood:agent-setup-gate");
    expect(dogfoodCommands).toContain("pnpm test:mcp:dogfood");
  });
});
