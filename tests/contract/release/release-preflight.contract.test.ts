import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  admissionCheckCommands,
  currentHeadSha,
  REHEARSAL_SKIPS,
  REHEARSAL_SUBSTITUTES,
  ephemeralUpdaterKey,
  localCommandFor,
  parseAdmitReleaseSteps,
  parseBuildMacosSteps,
  PROBE_TIMEOUT_MS,
  probeTool,
} from "../../../scripts/desktop-release/release-rehearsal.mjs";
import { RELEASE_ARTIFACT_STEPS } from "../../../scripts/desktop-release/build-macos-release-artifact.mjs";

/**
 * These steps are wired nowhere outside the release workflow, so they first run only
 * after a tag exists, and a developer's machine passes them because it already has
 * everything the runner lacks.
 *
 * Where the sibling file `release-sidecar-order.contract.test.ts` locks the
 * sidecar's **order**, this file locks the stretch after it — dependency
 * reproducibility, the updater archive's signing state, and whether the rehearsal
 * covers the workflow without gaps.
 */

const root = process.cwd();
const WORKFLOW_PATH = join(root, ".github/workflows/release-macos.yml");
const workflow = readFileSync(WORKFLOW_PATH, "utf8");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

it("builds Apple Silicon releases on the supported macOS 15 runner", () => {
  const macosJob = workflow.split('  build-macos:')[1]?.split('\n  build-windows:')[0] ?? '';
  expect(macosJob).toContain('runs-on: ${{ matrix.runner }}');
  const runners = [...macosJob.matchAll(/^\s+runner: (\S+)$/gm)].map(match => match[1]);
  expect(runners).toEqual(['macos-15']);
});

describe("the bundled MCP dependencies must be reproducible", () => {
  /**
   * `mcp/`'s `package-lock.json` is **npm's** and pnpm does not read it. Without a
   * lockfile, `pnpm --dir mcp install` makes the runner resolve fresh from the
   * registry on every release — the sidecar's dependency tree changes with no commit,
   * and that binary ships in the app.
   */
  it("the workflow installs the mcp dependencies frozen", () => {
    expect(workflow).toContain("pnpm --dir mcp install --frozen-lockfile");
  });

  it("the pnpm lockfile to be frozen exists in the repository", () => {
    const lockfile = readFileSync(join(root, "mcp/pnpm-lock.yaml"), "utf8");
    expect(lockfile).toContain("lockfileVersion");
    // The name the app sidecar actually compiles in; this checks the lockfile freezes it.
    expect(lockfile).toContain("@modelcontextprotocol/server");
  });

  /**
   * npm reads top-level `overrides` and pnpm reads `pnpm.overrides`; writing only one gives npm
   * consumers and the release runner different trees. There are currently no overrides, so the two
   * tests compare empty sets and arm themselves when one reappears.
   */
  it("npm and pnpm see the same override", () => {
    const mcpPkg = JSON.parse(readFileSync(join(root, "mcp/package.json"), "utf8")) as {
      overrides?: Record<string, string>;
      pnpm?: { overrides?: Record<string, string> };
    };
    expect(mcpPkg.pnpm?.overrides ?? {}).toEqual(mcpPkg.overrides ?? {});
  });

  it("the frozen lockfile really reflects that override", () => {
    const mcpPkg = JSON.parse(readFileSync(join(root, "mcp/package.json"), "utf8")) as {
      overrides?: Record<string, string>;
    };
    const lockfile = readFileSync(join(root, "mcp/pnpm-lock.yaml"), "utf8");
    for (const [name, version] of Object.entries(mcpPkg.overrides ?? {})) {
      expect(lockfile, `the ${name} override is not reflected in the lockfile`).toContain(
        `${name}@${version}`,
      );
    }
  });
});

describe("the updater archive must contain the signed app", () => {
  /**
   * `tauri build` emits `.app.tar.gz` with the unsigned app and signing happens afterwards, so only
   * updater users meet "is damaged". The one correct slot is immediately after app signing and
   * before DMG packaging.
   */
  const pipelines = [
    [
      "desktop:release-artifact",
      RELEASE_ARTIFACT_STEPS.map((step) => [step.command, ...step.args].join(" ")),
      "pnpm desktop:sign",
    ],
    [
      "desktop:release-artifact:unsigned",
      pkg.scripts["desktop:release-artifact:unsigned"].split(" && "),
      "pnpm desktop:sign:adhoc",
    ],
  ] as const;

  for (const [scriptName, commands, signStep] of pipelines) {
    it(`${scriptName} rebuilds the archive after app signing and before DMG packaging`, () => {
      const signAt = commands.findIndex((command) => command === signStep);
      const repackAt = commands.findIndex((command) => command === "pnpm desktop:repack-updater");
      const dmgAt = commands.findIndex((command) => command.endsWith("scripts/desktop/package-macos-dmg.mjs"));

      expect(repackAt, `${scriptName} has no desktop:repack-updater`).toBeGreaterThan(-1);
      expect(
        repackAt,
        "repacking before signing packs the unsigned app as it is, which fixes nothing and just gives a green",
      ).toBeGreaterThan(signAt);
      expect(
        repackAt,
        "after DMG packaging, the DMG and the archive hold different apps",
      ).toBeLessThan(dmgAt);
    });
  }

  it("the repack script is registered", () => {
    expect(pkg.scripts["desktop:repack-updater"]).toBe(
      "node scripts/desktop-release/repack-macos-updater-archive.mjs",
    );
  });

  it("the credentialed release command runs only one secret-isolating orchestrator", () => {
    expect(pkg.scripts["desktop:release-artifact"]).toBe(
      "node scripts/desktop-release/build-macos-release-artifact.mjs",
    );
    expect(RELEASE_ARTIFACT_STEPS.length).toBe(11);
  });
});

describe("the rehearsal covers every release job", () => {
  const admissionSteps = parseAdmitReleaseSteps(workflow);
  const steps = parseBuildMacosSteps(workflow);

  it("actually reads the tag verification and source admission steps of the admit-release job", () => {
    expect(admissionSteps.map((step) => step.name)).toContain("Verify requested release version");
    expect(admissionSteps.map((step) => step.name)).toContain("Admit tag at current main SHA");
  });

  it("given an existing tag, builds the admission command with the full SHA of the current HEAD", () => {
    const sha = currentHeadSha(root);
    expect(sha).toMatch(/^[0-9a-f]{40}$/i);
    expect(admissionCheckCommands("v1.2.3", sha)).toEqual([
      {
        name: "Verify requested release version",
        argv: ["pnpm", "desktop:release-tag", "--", "--tag=v1.2.3"],
      },
      {
        name: "Admit tag at current main SHA",
        argv: [
          "pnpm",
          "desktop:release-source",
          "--",
          "--mode=admit",
          "--tag=v1.2.3",
          `--sha=${sha}`,
        ],
      },
    ]);
  });

  /*
   * `--list` really invokes all four tools; a slow first `cargo`/`rustc` call through the rustup shim
   * can exceed vitest's 5-second default on a runner. The test asserts what is printed, not how fast.
   */
  it("listing without a tag explicitly says SKIP rather than pretending admission was verified", { timeout: 60_000 }, () => {
    const rehearsal = spawnSync(process.execPath, ["scripts/desktop-release/release-rehearsal.mjs", "--list"], {
      cwd: root,
      encoding: "utf8",
    });

    expect(rehearsal.status, rehearsal.stderr).toBe(0);
    expect(rehearsal.stdout).toContain("SKIP [admit-release] Verify requested release version");
    expect(rehearsal.stdout).toContain("SKIP [admit-release] Admit tag at current main SHA");
    expect(rehearsal.stdout).toContain("ADMISSION SKIP");
  });

  it("the tag list shows the two admission checks of the workflow side by side with the current HEAD SHA", { timeout: 60_000 }, () => {
    const sha = currentHeadSha(root);
    const rehearsal = spawnSync(
      process.execPath,
      ["scripts/desktop-release/release-rehearsal.mjs", "--list", "--tag=v1.2.3"],
      { cwd: root, encoding: "utf8" },
    );

    expect(rehearsal.status, rehearsal.stderr).toBe(0);
    expect(rehearsal.stdout).toContain(
      "RUN [admit-release] Verify requested release version — pnpm desktop:release-tag -- --tag=v1.2.3",
    );
    expect(rehearsal.stdout).toContain(
      `RUN [admit-release] Admit tag at current main SHA — pnpm desktop:release-source -- --mode=admit --tag=v1.2.3 --sha=${sha}`,
    );
  });

  it("actually reads the steps of the build-macos job", () => {
    // If the parser silently returns 0 steps, the rehearsal does nothing and goes green.
    expect(steps.length).toBeGreaterThan(10);
    expect(steps.map((step) => step.name)).toContain("Build bundled MCP sidecar");
    expect(steps.map((step) => step.name)).toContain("Stage release assets");
  });

  /**
   * This is the file's central contract. When a new step enters the workflow, the
   * rehearsal must **run it, offer a substitute, or record why it cannot run**.
   * Without one of the three, that step becomes another "square first stepped on by
   * tagging" and we start a fifth round trip.
   */
  it("every step is classified as run, replaced or explicitly skipped", () => {
    const skips = REHEARSAL_SKIPS as Record<string, string | undefined>;
    const substitutes = REHEARSAL_SUBSTITUTES as Record<string, unknown>;
    const unclassified = [...admissionSteps, ...steps].filter((step: { name: string; uses: string | null }) => {
      if (step.uses) return false; // GitHub Action — runner-only
      if (skips[step.name] || substitutes[step.name]) return false;
      return localCommandFor(step) === null;
    });

    expect(
      unclassified.map((step) => step.name),
      "The rehearsal does not say how it handles this step: give the reason in REHEARSAL_SKIPS " +
        "or put what runs instead in REHEARSAL_SUBSTITUTES",
    ).toEqual([]);
  });

  it("a skip reason is not empty", () => {
    for (const [name, reason] of Object.entries(REHEARSAL_SKIPS)) {
      expect(reason.length, `the skip reason of ${name} is empty`).toBeGreaterThan(20);
    }
  });

  it("the rehearsal bakes the sidecar before the first cargo call", () => {
    // Checks the workflow's order contract (the sibling file) carried over to the rehearsal intact.
    const names = steps.map((step) => step.name);
    expect(names.indexOf("Build bundled MCP sidecar")).toBeLessThan(
      names.indexOf("Native vault bridge tests"),
    );
  });

  it("desktop:release-rehearsal is registered", () => {
    expect(pkg.scripts["desktop:release-rehearsal"]).toBe("node scripts/desktop-release/release-rehearsal.mjs");
  });

  it("creates the throwaway updater private key outside the repository and deletes it right after reading", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "ontology-atlas-rehearsal-key-"));
    const repoRoot = join(sandbox, "repo");
    const tempRoot = join(sandbox, "system-temp");
    mkdirSync(repoRoot);
    mkdirSync(tempRoot);

    try {
      const env = ephemeralUpdaterKey(repoRoot, {
        existingKey: "",
        tempRoot,
        generate(keyPath: string) {
          expect(keyPath.startsWith(`${tempRoot}/`)).toBe(true);
          writeFileSync(keyPath, "throwaway-private-key", { mode: 0o600 });
          return { status: 0 };
        },
      });

      expect(env).toEqual({
        TAURI_SIGNING_PRIVATE_KEY: "throwaway-private-key",
        TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "",
      });
      expect(readdirSync(tempRoot)).toEqual([]);
      expect(existsSync(join(repoRoot, ".tmp", "rehearsal-updater.key"))).toBe(false);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("leaves no temporary directory behind even when the throwaway updater key generation fails", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "ontology-atlas-rehearsal-key-fail-"));
    const tempRoot = join(sandbox, "system-temp");
    mkdirSync(tempRoot);

    try {
      expect(
        ephemeralUpdaterKey(sandbox, {
          existingKey: "",
          tempRoot,
          generate: () => ({ status: 1 }),
        }),
      ).toBeNull();
      expect(readdirSync(tempRoot)).toEqual([]);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});

describe("the download smoke wording comes from the live catalog", () => {
  /**
   * #730 rebuilt the download screen and removed a sentence, but `desktop:smoke` was
   * left demanding **yesterday's sentence**, and its unit test only checked that the
   * constant equalled its own literal. With 249 tests green, the defect surfaced only
   * in the release build after tagging (the second step of
   * `desktop:release-artifact`).
   */
  it("the smoke contract has no hard-coded download sentence", () => {
    const smoke = readFileSync(join(root, "scripts/desktop/desktop-smoke.mjs"), "utf8");
    expect(smoke).toContain("DESKTOP_SMOKE_ROUTE_TEXT_KEYS");
    for (const retired of [
      "Install once. Work from your local vault.",
      "한 번 설치하고, 내 로컬 vault 에서 작업하세요.",
      "download-fact-strip",
    ]) {
      expect(smoke, `${retired}: yesterday wording or marker is still left in the gate`).not.toContain(
        retired,
      );
    }
  });
});

/**
 * A tool check says one of three things: `ok`, missing, or could not check. Folding unknown into
 * missing sends someone to install a tool that is fine, and without a timeout the test ties to
 * machine speed.
 */
describe("tool check of the release rehearsal", () => {
  it("a tool that answers gives its version back as it is", () => {
    const result = probeTool("x", ["--version"], {
      spawn: () => ({ status: 0, stdout: "1.2.3\n다음 줄" }),
    });
    expect(result).toEqual({ state: "ok", version: "1.2.3" });
  });

  it("a missing executable is `missing`", () => {
    const result = probeTool("x", ["--version"], {
      spawn: () => ({ status: null, error: { code: "ENOENT" } }),
    });
    expect(result.state).toBe("missing");
  });

  it("hitting the limit is `unknown`, and it does not claim the tool is absent", () => {
    // Node kills a timed-out child with a signal. Folding that into "missing" is the
    // "pretending to know what you do not" that this repository forbids across all
    // loading and progress surfaces.
    expect(probeTool("x", [], { spawn: () => ({ status: null, signal: "SIGTERM" }) }).state).toBe(
      "unknown",
    );
    expect(
      probeTool("x", [], { spawn: () => ({ status: null, error: { code: "ETIMEDOUT" } }) }).state,
    ).toBe("unknown");
  });

  it("really passes the limit along, since without it the script could wait forever", () => {
    let seen: Record<string, unknown> | undefined;
    probeTool("x", [], {
      timeout: 1234,
      spawn: (_tool: string, _args: string[], options: Record<string, unknown>) => {
        seen = options;
        return { status: 0, stdout: "" };
      },
    });
    expect(seen?.timeout).toBe(1234);
  });

  it("the default limit is finite and not 0, otherwise a limit is no limit", () => {
    expect(PROBE_TIMEOUT_MS).toBeGreaterThan(0);
    expect(Number.isFinite(PROBE_TIMEOUT_MS)).toBe(true);
  });
});
