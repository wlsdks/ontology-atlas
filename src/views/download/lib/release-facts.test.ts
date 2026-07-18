import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RELEASE_ARCHES, RELEASE_MIN_MACOS, RELEASE_VERSION, buildDmgName } from "./release-facts";

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
});
