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
  /* Proves the `next.config.ts` chain is wired; `check-macos-release-tag.mjs` forbids a literal. */
  it("is fed from package.json rather than carrying its own copy", () => {
    const pkg = readJson("package.json");
    expect(RELEASE_VERSION).not.toBe("unknown");
    expect(RELEASE_VERSION).toBe(pkg.version);
    const source = readFileSync(
      join(process.cwd(), "src/views/download/lib/release-facts.ts"),
      "utf8",
    );
    expect(source).toMatch(/RELEASE_VERSION\s*=\s*process\.env\.NEXT_PUBLIC_RELEASE_VERSION/);
  });

  it("matches the version declared in src-tauri/tauri.conf.json", () => {
    const tauriConf = readJson("src-tauri/tauri.conf.json");
    expect(RELEASE_VERSION).toBe(tauriConf.version);
  });

  /* Catches a Cargo version drift in unit tests instead of the release rehearsal; one line needs no TOML parser. */
  it("matches the version declared in src-tauri/Cargo.toml", () => {
    const cargo = readFileSync(join(process.cwd(), "src-tauri/Cargo.toml"), "utf8");
    // Only the `[package]` section, so a dependency's version cannot match.
    const packageSection = cargo.split(/^\[/m)[1] ?? cargo;
    const match = /^version\s*=\s*"([^"]+)"/m.exec(packageSection);
    expect(match?.[1], "could not read [package] version from src-tauri/Cargo.toml").toBeDefined();
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

  it("only claims signing and notarization while the release chain actually enforces them", () => {
    const pkg = readJson("package.json") as { scripts?: Record<string, string> };
    const chain = RELEASE_ARTIFACT_STEPS.flatMap((step) => step.args);

    expect(pkg.scripts?.["desktop:release-artifact"]).toContain("build-macos-release-artifact.mjs");
    expect(RELEASE_SIGNING.developerId).toBe(chain.includes("desktop:sign"));
    expect(RELEASE_SIGNING.notarized).toBe(chain.includes("desktop:notarize"));
    expect(chain).toContain("desktop:verify-release-dmg");
    expect(pkg.scripts?.["desktop:verify-release-dmg"]).toContain("--require-signed");
    expect(pkg.scripts?.["desktop:verify-release-dmg"]).toContain("--require-notarized");
  });

  it("matches the MCP tool count declared in mcp/src/server/registry.mjs", () => {
    const source = readFileSync(join(process.cwd(), "mcp/src/server/registry.mjs"), "utf8");
    const start = source.indexOf("const TOOLS = [");
    expect(start).toBeGreaterThan(-1);
    const block = source.slice(start, source.indexOf("\n];", start));
    expect(block.match(/^\s+name: '/gm)?.length ?? 0).toBe(MCP_TOOL_COUNT);
  });
});
