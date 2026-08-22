import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MCP_TOOL_COUNT,
  RELEASE_ARCHES,
  RELEASE_MIN_MACOS,
  RELEASE_SIGNING,
  RELEASE_VERSION,
  buildDmgName,
} from "./release-facts";
import { RELEASE_ARTIFACT_STEPS } from "../../../../scripts/build-macos-release-artifact.mjs";

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(process.cwd(), relativePath), "utf8"));
}

describe("release-facts", () => {
  it("matches the version declared in package.json", () => {
    const pkg = readJson("package.json");
    expect(RELEASE_VERSION).toBe(pkg.version);
  });

  it("matches the version declared in src-tauri/tauri.conf.json", () => {
    const tauriConf = readJson("src-tauri/tauri.conf.json");
    expect(RELEASE_VERSION).toBe(tauriConf.version);
  });

  /**
   * **The fourth place** — `src-tauri/Cargo.toml` (added 2026-08-01).
   *
   * This test long watched only three (`RELEASE_VERSION`, `package.json`, `tauri.conf.json`) while
   * Cargo was checked only by `pnpm desktop:check`. The cost of that asymmetry showed up on the
   * rc.5 version bump: with all 5,502 unit tests green, the release rehearsal stopped **at the first
   * step** (`cargo=1.0.0-rc.4`).
   *
   * The problem is finding out late — the rehearsal includes compiling the app, so it is a heavy
   * gate a person runs right before tagging, and learning it there costs one extra round trip. If
   * the same fact can be known in half a second, know it in half a second.
   *
   * No TOML parser is added — this file needs one top-level `version` line, and adding a dependency
   * for that would make the gate cost more than it saves.
   */
  it("matches the version declared in src-tauri/Cargo.toml", () => {
    const cargo = readFileSync(join(process.cwd(), "src-tauri/Cargo.toml"), "utf8");
    // The first `version = "…"` of the `[package]` section — searched only near the top of the file
    // so it cannot pick up a dependency's version.
    const packageSection = cargo.split(/^\[/m)[1] ?? cargo;
    const match = /^version\s*=\s*"([^"]+)"/m.exec(packageSection);
    expect(match?.[1], "src-tauri/Cargo.toml 의 [package] version 을 못 읽었다").toBeDefined();
    expect(RELEASE_VERSION).toBe(match?.[1]);
  });

  it("matches the minimum macOS version declared in src-tauri/tauri.conf.json", () => {
    const tauriConf = readJson("src-tauri/tauri.conf.json") as {
      bundle?: { macOS?: { minimumSystemVersion?: string } };
    };
    const minimumSystemVersion = tauriConf.bundle?.macOS?.minimumSystemVersion;
    expect(minimumSystemVersion).toBeDefined();
    expect(RELEASE_MIN_MACOS).toBe(`macOS ${minimumSystemVersion!.split(".")[0]}`);
  });

  it("builds DMG names matching the real check-macos-download-release.mjs naming convention", () => {
    expect(buildDmgName("aarch64")).toBe(`ontology-atlas_${RELEASE_VERSION}_aarch64.dmg`);
    expect(buildDmgName("x64")).toBe(`ontology-atlas_${RELEASE_VERSION}_x64.dmg`);
    for (const arch of RELEASE_ARCHES) {
      expect(buildDmgName(arch)).toMatch(/^ontology-atlas_[^/]+_(aarch64|x64)\.dmg$/);
    }
  });

  // `/download` states as fact that "this app is Apple-signed and notarized". What backs that claim
  // is not the copy but the command chain that produces the release asset — if signing or
  // notarization verification drops out of the chain, the copy quietly becomes false, so it is
  // blocked here. (Before 2026-07-27 it was false in the other direction: the signing path was back
  // while the page kept saying "not signed yet".)
  it("only claims signing and notarization while the release chain actually enforces them", () => {
    const pkg = readJson("package.json") as { scripts?: Record<string, string> };
    const chain = RELEASE_ARTIFACT_STEPS.flatMap((step) => step.args);

    expect(pkg.scripts?.["desktop:release-artifact"]).toContain("build-macos-release-artifact.mjs");
    expect(RELEASE_SIGNING.developerId).toBe(chain.includes("desktop:sign"));
    expect(RELEASE_SIGNING.notarized).toBe(chain.includes("desktop:notarize"));
    // Signing without verification is a claim, not evidence.
    expect(chain).toContain("desktop:verify-release-dmg");
    expect(pkg.scripts?.["desktop:verify-release-dmg"]).toContain("--require-signed");
    expect(pkg.scripts?.["desktop:verify-release-dmg"]).toContain("--require-notarized");
  });

  it("matches the MCP tool count declared in mcp/src/index.js", () => {
    const source = readFileSync(join(process.cwd(), "mcp/src/index.js"), "utf8");
    const start = source.indexOf("const TOOLS = [");
    expect(start).toBeGreaterThan(-1);
    const block = source.slice(start, source.indexOf("\n];", start));
    expect(block.match(/^\s+name: '/gm)?.length ?? 0).toBe(MCP_TOOL_COUNT);
  });
});
